/**
 * HitSelector.js - The Marksmanship Brain
 * 
 * Implements Hit Selection (Lag Compensation) by tracking entity position history.
 * Allows the bot to "backtrack" and verify hits against where the target was 
 * based on current server latency.
 */

export class HitSelector {
    constructor(bot, options = {}) {
        this.bot = bot;
        this.maxBufferTicks = options.maxBufferTicks || 20; // 1 second history
        this.history = new Map(); // UUID -> [Snapshots]
    }

    /**
     * Capture snapshots of all nearby entities
     */
    update() {
        const now = Date.now();
        for (const entity of Object.values(this.bot.entities)) {
            if (entity.type === 'player' || entity.type === 'mob') {
                let snapshots = this.history.get(entity.uuid) || [];

                snapshots.push({
                    timestamp: now,
                    position: entity.position.clone(),
                    velocity: entity.velocity.clone()
                });

                if (snapshots.length > this.maxBufferTicks) {
                    snapshots.shift();
                }

                this.history.set(entity.uuid, snapshots);
            }
        }

        // Cleanup stale data
        for (const [uuid, snapshots] of this.history.entries()) {
            if (snapshots.length > 0 && now - snapshots[snapshots.length - 1].timestamp > 5000) {
                this.history.delete(uuid);
            }
        }
    }

    /**
     * Returns the best position to attack for a given target and latency
     * @param {Entity} target 
     * @param {number} latencyMs 
     */
    getBacktrackedPosition(target, latencyMs = 0) {
        const snapshots = this.history.get(target.uuid);
        if (!snapshots || snapshots.length === 0) return target.position;

        const targetTime = Date.now() - latencyMs;

        // Find the snapshot closest to the target time
        // Since it's sorted by time, we can binary search or just find the first before
        for (let i = snapshots.length - 1; i >= 0; i--) {
            if (snapshots[i].timestamp <= targetTime) {
                // Return exact or interpolate if needed
                return snapshots[i].position;
            }
        }

        return snapshots[0].position;
    }

    /**
     * Validates if the target can be hit at a given distance with lag compensation
     */
    canHit(target, reach = 3.0, latencyMs = 0) {
        const backPos = this.getBacktrackedPosition(target, latencyMs);
        const dist = this.bot.entity.position.distanceTo(backPos);
        return dist <= reach;
    }
}

export default HitSelector;
