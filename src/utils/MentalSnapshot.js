
import fs from 'fs';
import path from 'path';

/**
 * MentalSnapshot.js
 * 
 * Periodically saves the bot's mental state to disk to allow crash recovery.
 * Saves:
 * - StateStack (What I was doing)
 * - SpatialMemory (Where things are)
 * - Inventory Snapshot (What I have - verify against server on load)
 */
export class MentalSnapshot {
    constructor(agent) {
        this.agent = agent;
        this.filepath = `./bots/${agent.name}/mental_snapshot.json`;
        this.lastSave = 0;
        this.saveInterval = 5 * 60 * 1000; // 5 minutes
    }

    async update(delta) {
        this.lastSave += delta;
        if (this.lastSave >= this.saveInterval) {
            this.lastSave = 0;
            await this.save();
        }
    }

    async save() {
        try {
            const snapshot = {
                timestamp: Date.now(),
                stateStack: this.agent.stateStack ? this.agent.stateStack.toJSON() : [],
                spatial: this.agent.spatial ? Array.from(this.agent.spatial.memory.entries()) : [],
                // Inventory is strictly server-side, but saving our *perception* of it helps debugging
                inventorySummary: this.agent.bot.inventory.items().map(i => ({ name: i.name, count: i.count }))
            };

            const dir = path.dirname(this.filepath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(this.filepath, JSON.stringify(snapshot, null, 2));
            console.log(`[MentalSnapshot] 🧠 Brain saved to ${this.filepath}`);
        } catch (err) {
            console.error('[MentalSnapshot] Failed to save snapshot:', err.message);
        }
    }

    async load() {
        if (fs.existsSync(this.filepath)) {
            try {
                const data = fs.readFileSync(this.filepath, 'utf-8');
                const snapshot = JSON.parse(data);

                // Restore StateStack
                if (this.agent.stateStack && Array.isArray(snapshot.stateStack)) {
                    // Logic to restore state... 
                    // this.agent.stateStack.restore(snapshot.stateStack);
                    console.log(`[MentalSnapshot] Restored ${snapshot.stateStack.length} states.`);
                }

                // Restore Spatial Memory
                if (this.agent.spatial && Array.isArray(snapshot.spatial)) {
                    this.agent.spatial.memory = new Map(snapshot.spatial);
                    console.log(`[MentalSnapshot] Restored ${snapshot.spatial.length} visual memories.`);
                }

                return true;
            } catch (err) {
                console.error('[MentalSnapshot] Corrupt snapshot file:', err.message);
                return false;
            }
        }
        return false;
    }
}
