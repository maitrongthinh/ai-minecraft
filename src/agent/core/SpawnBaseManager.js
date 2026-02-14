import fs from 'fs';
import path from 'path';
import settings from '../../../settings.js';

export class SpawnBaseManager {
    constructor(agent) {
        this.agent = agent;
        this.state = {
            baseBuilt: false,
            farmBuilt: false,
            center: null,
            updatedAt: null,
            currentBlueprint: null,
            constructionProgress: 0
        };
        this.statePath = null;
        this.blueprintPath = path.resolve(process.cwd(), 'src', 'agent', 'templates', 'basic_house.json');
    }

    init() {
        const baseDir = path.resolve(process.cwd(), 'bots', this.agent?.name || 'Agent');
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }

        this.statePath = path.join(baseDir, 'spawn_base_state.json');

        if (fs.existsSync(this.statePath)) {
            try {
                const loaded = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
                if (loaded && typeof loaded === 'object') {
                    this.state = { ...this.state, ...loaded };
                }
            } catch (error) {
                console.warn(`[SpawnBaseManager] Failed to load state: ${error.message}`);
            }
        }
    }

    save() {
        if (!this.statePath) return;
        try {
            fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
        } catch (error) {
            console.warn(`[SpawnBaseManager] Failed to save state: ${error.message}`);
        }
    }

    getBuildCenter() {
        const anchor = this.agent?.memory?.getPlace?.('spawn_anchor');
        const pos = anchor || this.agent?.bot?.entity?.position;
        if (!pos) return null;

        return {
            x: Math.floor(pos.x),
            y: Math.floor(pos.y),
            z: Math.floor(pos.z)
        };
    }

    isBaseStable() {
        return Boolean(this.state.baseBuilt && this.state.farmBuilt);
    }

    async _safe(actionFn) {
        try {
            return await actionFn();
        } catch {
            return { success: false };
        }
    }

    async buildBaseAndFarm({ signal } = {}) {
        if (signal?.aborted) return { success: false, error: 'aborted' };
        if (this.isBaseStable()) return { success: true, alreadyBuilt: true, center: this.state.center };

        const center = this.getBuildCenter();
        if (!center) return { success: false, error: 'No center position available' };

        this.state.center = center;
        this.agent?.memory?.setPlace?.('base_center', center);

        // 1. Build House from Blueprint (Phase 5)
        if (!this.state.baseBuilt) {
            console.log('[BaseBuilder] 🏗️ Starting House Construction...');
            const success = await this._buildBlueprint(center);
            if (success) {
                this.state.baseBuilt = true;
                this.state.updatedAt = Date.now();
                this.save();
                this.agent?.memory?.setPlace?.('home', center);
            } else {
                return { success: false, error: 'Failed to build house' };
            }
        }

        // 2. Build Farm (Legacy support + Upgrade later)
        if (!this.state.farmBuilt) {
            await this._buildFarm(center);
            this.state.farmBuilt = true;
            this.state.updatedAt = Date.now();
            this.save();
        }

        return { success: true, center, mode: settings?.base?.mode || 'full_base_plus_farm' };
    }

    async buildFromBlueprint(blueprintName) {
        const bpPath = path.resolve(process.cwd(), 'src', 'blueprints', `${blueprintName}.json`);
        if (!fs.existsSync(bpPath)) {
            console.warn(`[BaseBuilder] Blueprint ${blueprintName} not found at ${bpPath}`);
            return false;
        }

        this.blueprintPath = bpPath;
        this.state.currentBlueprint = blueprintName;
        console.log(`[BaseBuilder] Switched blueprint to: ${blueprintName}`);

        const center = this.state.center || this.getBuildCenter();
        if (!center) return false;

        return await this._buildBlueprint(center);
    }

    async _buildBlueprint(origin) {
        try {
            if (!fs.existsSync(this.blueprintPath)) {
                console.error(`[BaseBuilder] Blueprint not found: ${this.blueprintPath}`);
                return false;
            }
            const blueprint = JSON.parse(fs.readFileSync(this.blueprintPath, 'utf8'));
            const { layers, materials } = blueprint;

            if (!layers || !materials) {
                console.error('[BaseBuilder] Invalid blueprint format (missing layers/materials)');
                return false;
            }

            // Convert layers to block list
            const blocksToPlace = [];
            for (let y = 0; y < layers.length; y++) {
                const layer = layers[y];
                for (let z = 0; z < layer.length; z++) {
                    const row = layer[z];
                    for (let x = 0; x < row.length; x++) {
                        const char = row[x];
                        const blockType = materials[char];
                        if (blockType && blockType !== 'air') {
                            blocksToPlace.push({ x, y, z, type: blockType });
                        }
                    }
                }
            }

            console.log(`[BaseBuilder] Blueprint parsed. Blocks to place: ${blocksToPlace.length}`);
            const actions = this.agent.actionAPI;

            for (const block of blocksToPlace) {
                const targetPos = {
                    x: origin.x + block.x,
                    y: origin.y + block.y,
                    z: origin.z + block.z
                };

                // Ensure material is available in inventory
                await this._safe(() => actions.ensure_item({ itemName: block.type, targetCount: 1 }));

                // Place block
                await this._safe(() => actions.place({
                    blockType: block.type,
                    position: targetPos,
                    options: { retries: 2 }
                }));

                // Small delay to prevent anticheat/spam issues
                await new Promise(r => setTimeout(r, 100));
            }
            return true;
        } catch (err) {
            console.error('[BaseBuilder] Blueprint error:', err);
            return false;
        }
    }

    async _buildFarm(center) {
        const actions = this.agent.actionAPI;
        const farmCenter = { x: center.x + 6, y: center.y, z: center.z };
        this.agent?.memory?.setPlace?.('farm_center', farmCenter);

        const farmCandidates = [
            { blockType: 'farmland', position: { x: farmCenter.x, y: farmCenter.y, z: farmCenter.z } },
            { blockType: 'farmland', position: { x: farmCenter.x + 1, y: farmCenter.y, z: farmCenter.z } },
            { blockType: 'farmland', position: { x: farmCenter.x, y: farmCenter.y, z: farmCenter.z + 1 } },
            { blockType: 'water', position: { x: farmCenter.x + 1, y: farmCenter.y, z: farmCenter.z + 1 } }
        ];

        for (const step of farmCandidates) {
            await this._safe(() => actions.place({
                blockType: step.blockType,
                position: step.position,
                options: { retries: 0 }
            }));
        }
    }

    cleanup() {
        this.save();
    }
}

export default SpawnBaseManager;
