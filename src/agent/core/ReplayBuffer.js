/**
 * ReplayBuffer.js - The Agent's Short-Term Memory
 * 
 * A circular buffer that records the last 30 seconds of agent activity.
 * This data is used by the EvolutionEngine to analyze failures (deaths).
 */

export class ReplayBuffer {
    /**
     * @param {Agent} agent - Reference to the agent
     * @param {Object} options - Configuration options
     */
    constructor(agent, options = {}) {
        this.agent = agent;

        // Phase 11 EAI: Hybrid Replay Buffer
        this.shortMaxSeconds = 10;
        this.shortTickRateMs = 50;
        this.shortMaxSize = Math.ceil((this.shortMaxSeconds * 1000) / this.shortTickRateMs);

        this.longMaxSeconds = 60;
        this.longTickRateMs = 1000;
        this.longMaxSize = Math.ceil((this.longMaxSeconds * 1000) / this.longTickRateMs);

        this.shortBuffer = [];
        this.longBuffer = [];

        this.lastShortCapture = 0;
        this.lastLongCapture = 0;
        this.isFrozen = false;
    }

    /**
     * Capture a snapshot of the current state
     */
    capture() {
        if (this.isFrozen) return;
        const now = Date.now();

        const shouldShort = now - this.lastShortCapture >= this.shortTickRateMs;
        const shouldLong = now - this.lastLongCapture >= this.longTickRateMs;

        if (!shouldShort && !shouldLong) return;

        const bot = this.agent.bot;
        if (!bot || !bot.entity) return;

        const snapshot = {
            timestamp: now,
            health: bot.health,
            food: bot.food,
            position: bot.entity.position.clone(),
            velocity: bot.entity.velocity.clone(),
            onGround: bot.entity.onGround,
            currentTask: this.agent.task?.name || 'idle',
            nearbyEntities: this._getNearbyEntities(),
            activeSkill: this.agent.activeSkill || null,
            equipment: this._getEquipmentSummary(),
            controlStates: { ...bot.controlState }
        };

        if (shouldShort) {
            this.shortBuffer.push(snapshot);
            if (this.shortBuffer.length > this.shortMaxSize) this.shortBuffer.shift();
            this.lastShortCapture = now;
        }

        if (shouldLong) {
            this.longBuffer.push(snapshot);
            if (this.longBuffer.length > this.longMaxSize) this.longBuffer.shift();
            this.lastLongCapture = now;
        }
    }

    /**
     * Freezes the buffer to prevent new data from overwriting history (e.g. on death)
     */
    freeze() {
        this.isFrozen = true;
        console.log('[ReplayBuffer] ❄️ Buffer frozen for retrospective analysis.');
    }

    unfreeze() {
        this.isFrozen = false;
    }

    /**
     * Get the recent history for analysis
     * @param {number} seconds - Number of recent seconds to retrieve
     */
    getHistory() {
        const now = Date.now();
        // Return 60s of long buffer, and up to 10s of short buffer if it overlaps
        // Actually, we just merge and deduplicate
        const merged = [...this.longBuffer, ...this.shortBuffer];

        // Sort by timestamp
        merged.sort((a, b) => a.timestamp - b.timestamp);

        // Deduplicate
        const deduped = [];
        let lastTime = 0;
        for (const s of merged) {
            if (s.timestamp !== lastTime) {
                deduped.push(s);
                lastTime = s.timestamp;
            }
        }
        return deduped;
    }

    _getNearbyEntities() {
        try {
            const bot = this.agent.bot;
            return Object.values(bot.entities)
                .filter(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 16)
                .map(e => ({
                    name: e.displayName || e.name || e.type,
                    type: e.type,
                    position: e.position.clone(),
                    distance: bot.entity.position.distanceTo(e.position)
                }))
                .slice(0, 5); // Only track top 5 closest
        } catch (e) { return []; }
    }

    _getEquipmentSummary() {
        try {
            const bot = this.agent.bot;
            return {
                mainHand: bot.inventory.slots[bot.getEquipmentDestSlot('hand')]?.name,
                offHand: bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')]?.name,
                armor: {
                    head: bot.inventory.slots[bot.getEquipmentDestSlot('head')]?.name,
                    chest: bot.inventory.slots[bot.getEquipmentDestSlot('torso')]?.name,
                    legs: bot.inventory.slots[bot.getEquipmentDestSlot('legs')]?.name,
                    feet: bot.inventory.slots[bot.getEquipmentDestSlot('feet')]?.name
                }
            };
        } catch (e) { return {}; }
    }

    /**
     * Format history for LLM analysis
     */
    getFormattedHistory() {
        const history = this.getHistory();
        if (history.length === 0) return "No history available.";

        return history.map(s => {
            const t = new Date(s.timestamp).toISOString().slice(11, 23);
            const pos = `(${s.position.x.toFixed(1)}, ${s.position.y.toFixed(1)}, ${s.position.z.toFixed(1)})`;
            const entities = s.nearbyEntities.map(e => `${e.name}@${e.distance.toFixed(1)}m`).join(', ');
            return `[${t}] HP:${s.health} Pos:${pos} Task:${s.currentTask} Nearby:[${entities}]`;
        }).join('\n');
    }

    async exportToDisk() {
        if (this.buffer.length === 0) return null;

        const fs = await import('fs');
        const path = await import('path');
        const filename = `death_replay_${Date.now()}.json`;
        const dir = path.resolve(process.cwd(), 'logs/replays');

        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const data = JSON.stringify({
            agent: this.agent.name,
            timestamp: new Date().toISOString(),
            ticks: this.getHistory()
        }, null, 2);

        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, data);
        console.log(`[ReplayBuffer] 💾 Replay exported to: ${filePath}`);
        return filePath;
    }

    clear() {
        this.shortBuffer = [];
        this.longBuffer = [];
    }
}

export default ReplayBuffer;
