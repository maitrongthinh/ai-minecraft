import fs from 'fs';
import path from 'path';

/**
 * KnowledgeStore
 * 
 * Central management for the agent's "Self-Knowledge".
 * Maintains manifest.json as the single source of truth for:
 * - Available Tools (builtin + dynamic)
 * - Learned Reflexes
 * - Active Strategy & Progress
 * - Important Memories
 * 
 * Also auto-generates documentation for the ActionAPI to ensure
 * the LLM always has up-to-date context on what it can do.
 */
export class KnowledgeStore {
    constructor(agent) {
        this.agent = agent;
        this.botName = agent.name || 'Agent';
        this.baseDir = path.resolve(process.cwd(), 'bots', this.botName, 'agent_knowledge');

        // Subdirectories
        this.dirs = {
            root: this.baseDir,
            strategies: path.join(this.baseDir, 'strategies'),
            created_tools: path.join(this.baseDir, 'created_tools'),
            learned_reflexes: path.join(this.baseDir, 'learned_reflexes'),
            memories: path.join(this.baseDir, 'memories')
        };

        this.manifestPath = path.join(this.baseDir, 'manifest.json');
        this.apiDocsPath = path.join(this.baseDir, 'action_api_docs.md');

        this.manifest = null;
    }

    /**
     * Initialize the knowledge store and load/create manifest
     */
    init() {
        console.log('[KnowledgeStore] Initializing...');
        this._ensureDirectories();
        this._loadManifest();
        this._generateActionAPIDocs();
        console.log('[KnowledgeStore] Ready. Manifest loaded.');
    }

    /**
     * Get the current manifest data
     */
    getManifest() {
        if (!this.manifest) this._loadManifest();
        return this.manifest;
    }

    /**
     * Get path to a specific knowledge directory
     */
    getPath(key) {
        return this.dirs[key] || this.dirs.root;
    }

    /**
     * Update a section of the manifest and save to disk
     * @param {string} section - 'tools', 'reflexes', 'strategies', etc.
     * @param {object} data - Data to merge/overwrite
     */
    updateManifest(section, data) {
        if (!this.manifest) this._loadManifest();

        if (this.manifest[section]) {
            this.manifest[section] = { ...this.manifest[section], ...data };
            this._saveManifest();
        } else {
            console.warn(`[KnowledgeStore] Unknown manifest section: ${section}`);
        }
    }

    /**
     * Register a new dynamic tool in the manifest
     */
    registerTool(name, description, fileParams = {}) {
        if (!this.manifest) this._loadManifest();

        // Check if already exists
        const exists = this.manifest.tools.dynamic.find(t => t.name === name);
        if (exists) {
            exists.description = description;
            exists.updatedAt = Date.now();
        } else {
            this.manifest.tools.dynamic.push({
                name,
                description,
                createdAt: Date.now(),
                ...fileParams
            });
        }

        this._saveManifest();
        console.log(`[KnowledgeStore] Tool registered: ${name}`);
    }

    /**
     * Register a new learned reflex
     */
    registerReflex(id, trigger, description) {
        if (!this.manifest) this._loadManifest();

        const exists = this.manifest.reflexes.learned.find(r => r.id === id);
        if (exists) {
            exists.description = description;
            exists.trigger = trigger;
            exists.updatedAt = Date.now();
        } else {
            this.manifest.reflexes.learned.push({
                id,
                trigger,
                description,
                createdAt: Date.now()
            });
        }

        this._saveManifest();
    }

    /**
     * Update current active strategy info
     */
    updateStrategyStatus(strategyId, stepId) {
        this.updateManifest('strategies', {
            active: strategyId,
            active_step: stepId,
            last_updated: Date.now()
        });
    }

    //Internal methods

    _ensureDirectories() {
        Object.values(this.dirs).forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    _loadManifest() {
        if (fs.existsSync(this.manifestPath)) {
            try {
                this.manifest = JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
            } catch (e) {
                console.error('[KnowledgeStore] Corrupt manifest, creating new one.', e);
                this.manifest = this._createDefaultManifest();
            }
        } else {
            this.manifest = this._createDefaultManifest();
            this._saveManifest();
        }
    }

    _saveManifest() {
        if (!this.manifest) return;
        this.manifest.last_updated = new Date().toISOString();
        fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf8');
    }

    _createDefaultManifest() {
        return {
            version: 1,
            last_updated: new Date().toISOString(),
            tools: {
                builtin: this._getBuiltinToolsList(),
                dynamic: []
            },
            reflexes: {
                builtin: ["combat", "self_preservation", "fall_damage", "food_consumption"],
                learned: []
            },
            strategies: {
                active: "survival_basics",
                active_step: null,
                available: ["survival_basics", "nether_expedition", "end_expedition", "base_building"]
            },
            memories: {
                death_count: 0,
                player_profiles: [],
                important_locations: {}
            }
        };
    }

    _getBuiltinToolsList() {
        // Hardcoded list of ActionAPI primitive capabilities
        return [
            "mine(blockType, count)",
            "craft(itemName, count)",
            "place(blockType, position)",
            "smelt(itemName, count)",
            "equip(itemName, destination)",
            "eat(foodName)",
            "attack(entityName)",
            "move_to(position)",
            "follow(entityName)",
            "scan_nearby(params)"
        ];
    }

    /**
     * Auto-generate Markdown docs from ActionAPI methods
     * This is crucial for the LLM to know EXACTLY what functions to call
     */
    _generateActionAPIDocs() {
        const actionAPI = this.agent.actionAPI;
        if (!actionAPI) return;

        let docs = "# ActionAPI Reference\n\n";
        docs += "Use these primitive actions to interact with the world. All actions are async.\n\n";

        // Inspect the class prototype to find methods
        const proto = Object.getPrototypeOf(actionAPI);
        const methods = Object.getOwnPropertyNames(proto)
            .filter(name => name !== 'constructor' && !name.startsWith('_') && typeof actionAPI[name] === 'function');

        for (const method of methods) {
            // We can't easily extract params from JS at runtime without parsing source,
            // so we'll use a standardized map or fallback to generic signature.
            const signature = this._getMethodSignature(method);
            docs += `## actions.${method}(${signature})\n`;
            docs += `*Primitive action: ${method}*\n\n`;
        }

        fs.writeFileSync(this.apiDocsPath, docs, 'utf8');
        console.log(`[KnowledgeStore] Generated ActionAPI docs at ${this.apiDocsPath}`);
    }

    _getMethodSignature(methodName) {
        const signatures = {
            mine: "params: { targetBlock: string|Object, options?: Object }",
            craft: "params: { itemName: string, count?: number }",
            place: "params: { blockType: string, position: {x,y,z}, faceVector?: {x,y,z} }",
            move_to: "params: { x: number, y: number, z: number, range?: number }",
            attack: "params: { entity: Object|string }",
            equip: "params: { itemName: string, destination: 'hand'|'head'|'torso'|'legs'|'feet' }",
            eat: "params: { foodName?: string }",
            smelt: "params: { itemName: string, count: number, fuel?: string }",
            gather_nearby: "params: { target: string, count: number }",
            activate_item: "params: { offhand?: boolean }",
            use_item_on: "params: { blockPosition: {x,y,z}, faceVector?: {x,y,z} }",
            toss: "params: { itemName: string, count?: number }",
            sleep: "params: { bedPosition?: {x,y,z} }",
            chat: "params: { message: string, whisper?: string }"
        };
        return signatures[methodName] || "params: Object";
    }
}

export default KnowledgeStore;
