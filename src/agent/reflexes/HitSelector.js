/**
 * HitSelector.js - The Marksmanship Brain
 * 
 * Implements Hit Selection (Lag Compensation) by tracking entity position history.
 * Allows the bot to "backtrack" and verify hits against where the target was 
 * based on current server latency.
 */

export class HitSelector {
    constructor(agent, options = {}) {
        this.agent = agent;
        this.maxBufferTicks = options.maxBufferTicks || 20; // 1 second history
        this.history = new Map(); // UUID -> [Snapshots]
    }

    /**
     * Capture snapshots of all nearby entities
     */
    update() {
        const bot = this.agent.bot;
        if (!bot || !bot.entities) return;
        const now = Date.now();
        for (const entity of Object.values(bot.entities)) {
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

    canHit(target, reach = 3.0, latencyMs = 0) {
        const bot = this.agent.bot;
        if (!bot || !bot.entity) return false;
        const backPos = this.getBacktrackedPosition(target, latencyMs);
        const dist = bot.entity.position.distanceTo(backPos);
        return dist <= reach;
    }

    /**
     * Phase 3: Find nearest valid threat from history/current state
     */
    findThreat() {
        const bot = this.agent.bot;
        if (!bot || !bot.entities) return null;

        let bestTarget = null;
        let maxScore = -1;

        const TEAMMATES = this.agent.collaboration?.teammates || [];

        for (const entity of Object.values(bot.entities)) {
            if (entity === bot.entity) continue;

            const isMob = entity.type === 'mob';
            const isPlayer = entity.type === 'player';

            if (isMob || isPlayer) {
                // 1. FILTER: Teammates & Passive
                if (isPlayer) {
                    if (TEAMMATES.includes(entity.username)) continue;
                    if (entity.metadata?.[6] === 4) continue; // Creative/Spectator (approx check)
                }

                // 2. FILTER: Hostility
                // TODO: Check SocialEngine for dynamic hostility
                if (isMob && ['Villager', 'Iron Golem', 'Trader Llama', 'Wandering Trader', 'Cat', 'Wolf', 'Horse', 'Donkey', 'Mule', 'Parrot'].includes(entity.mobType)) continue;

                // 3. SCORE CALCULATION
                let score = 0;

                // Base Priority (Danger Level)
                switch (entity.mobType) {
                    case 'Creeper': score = 100; break;
                    case 'Phantom': score = 90; break;
                    case 'Witch': score = 85; break;
                    case 'Skeleton': score = 80; break;
                    case 'Stray': score = 80; break;
                    case 'Pillager': score = 75; break;
                    case 'Blaze': score = 75; break;
                    case 'Drowned': score = 70; break; // Only if holding trident?
                    case 'Spider': score = 60; break;
                    case 'Cave Spider': score = 65; break;
                    case 'Zombie': score = 40; break;
                    case 'Husk': score = 40; break;
                    case 'Enderman': score = 30; break; // Neutral unless provoked
                    case 'Piglin': score = 30; break;   // Neutral with gold
                    default: score = 50; // Unknown/Player
                }

                if (isPlayer) score = 150; // Players are highest threat usually

                // Distance Multiplier (Closer = Higher)
                const dist = bot.entity.position.distanceTo(entity.position);
                if (dist > 16) continue; // Out of range
                score += (16 - dist) * 2;

                // Health Multiplier (Lower = Higher to finish off)
                if (entity.health > 0) {
                    score += (20 - entity.health) * 0.5;
                }

                // Line of Sight Bonus
                // (Expensive check, maybe skip or simplify)

                if (score > maxScore) {
                    maxScore = score;
                    bestTarget = entity;
                }
            }
        }
        return bestTarget;
    }
}

export default HitSelector;
