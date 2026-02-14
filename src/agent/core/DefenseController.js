import settings from '../../../settings.js';

export class DefenseController {
    constructor(agent) {
        this.agent = agent;
        this.enabled = false;
        this.interval = null;
        this.locations = []; // Patrol points
        this.radius = settings?.defense?.radius || 18;
        this.lastHoldAt = 0;
        this.currentPatrolIndex = 0;
    }

    start() {
        this._updateLocations();
        this.enabled = true;

        if (!this.interval) {
            this.interval = setInterval(() => {
                void this.tick();
            }, 3000);
        }
        console.log('[Defense] 🛡️ Activated. Patrol points:', this.locations.length);
    }

    stop() {
        this.enabled = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    _updateLocations() {
        this.locations = [];
        const home = this.agent?.memory?.getPlace?.('base_center');
        const farm = this.agent?.memory?.getPlace?.('farm_center');
        const spawn = this.agent?.memory?.getPlace?.('spawn_anchor');

        if (home) this.locations.push(home);
        if (farm) this.locations.push(farm);
        if (spawn && !home) this.locations.push(spawn); // Fallback to spawn if no home

        // De-duplicate loosely
        // ... (omitted for brevity)
    }

    async buildDefenses(center) {
        if (!center) return false;
        console.log('[Defense] 🏗️ Building Defensive Perimeter...');

        // 1. Fence Ring
        await this._placeFenceRing(center, this.radius);

        // 2. Light Ring
        await this._placeLightRing(center, this.radius - 2);

        console.log('[Defense] ✅ Defenses established.');
        return true;
    }

    async _placeFenceRing(center, radius) {
        const actionAPI = this.agent.actionAPI;
        if (!actionAPI) return;

        // Ensure fences
        const perimeter = Math.PI * 2 * radius;
        await actionAPI.ensure_item({ itemName: 'oak_fence', targetCount: Math.ceil(perimeter) });

        console.log('[Defense] 🚧 Placing Fence Ring...');
        for (let x = -radius; x <= radius; x++) {
            for (let z = -radius; z <= radius; z++) {
                // Approximate circle
                if (Math.abs(Math.sqrt(x * x + z * z) - radius) < 1.0) {
                    const pos = { x: center.x + x, y: center.y, z: center.z + z };
                    await this._safePlace(pos, 'oak_fence');
                }
            }
        }
    }

    async _placeLightRing(center, radius) {
        const actionAPI = this.agent.actionAPI;
        if (!actionAPI) return;

        await actionAPI.ensure_item({ itemName: 'torch', targetCount: Math.ceil(radius * 3) });

        console.log('[Defense] 🕯️ Placing Light Perimeter...');
        for (let x = -radius; x <= radius; x += 3) {
            for (let z = -radius; z <= radius; z += 3) {
                if (Math.abs(Math.sqrt(x * x + z * z) - radius) < 2.0) {
                    const pos = { x: center.x + x, y: center.y, z: center.z + z };
                    await this._safePlace({ ...pos, y: pos.y }, 'torch');
                }
            }
        }
    }

    async _safePlace(pos, type) {
        try {
            await this.agent.actionAPI.place({
                blockType: type,
                position: pos,
                options: { retries: 1 }
            });
            await new Promise(r => setTimeout(r, 50));
        } catch (e) { /* ignore placement errors (obstructed etc) */ }
    }

    async tick() {
        if (!this.enabled || !this.agent?.bot) return;
        if (!this.agent?.combatReflex || !this.agent?.actionAPI) return;

        const bot = this.agent.bot;

        // 1. Self-Preservation check
        if (bot.health < 10 || bot.food < 10) {
            await this.agent.actionAPI.eat_if_hungry({ threshold: 16, options: { retries: 1 } });
            return;
        }

        // 2. Scan for Hostiles relative to current position
        // Phase 5: Prioritize protecting the Home/Farm over self IF healthy
        const hostiles = this.agent.combatReflex.findNearbyHostiles(this.radius);
        if (hostiles.length > 0) {
            if (!this.agent.combatReflex.inCombat) {
                console.log(`[Defense] ⚔️ Engaging intruder: ${hostiles[0].name}`);
                this.agent.combatReflex.enterCombat(hostiles[0]);
            }
            return;
        }

        // 3. Patrol Logic
        if (this.agent.combatReflex.inCombat) return;

        // If we haven't patrolled in a while, move to next point
        const now = Date.now();
        if (now - this.lastHoldAt < 10000) return; // Hold for 10s at each point
        this.lastHoldAt = now;

        if (this.locations.length === 0) this._updateLocations();
        if (this.locations.length === 0) return;

        const target = this.locations[this.currentPatrolIndex];
        this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.locations.length;

        console.log(`[Defense] 👮 Patrolling to point ${this.currentPatrolIndex + 1}/${this.locations.length}`);

        await this.agent.actionAPI.hold_position({
            x: target.x,
            y: target.y,
            z: target.z,
            radius: 4,
            duration: 8000 // Stand guard for 8s
        });
    }
}

export default DefenseController;
