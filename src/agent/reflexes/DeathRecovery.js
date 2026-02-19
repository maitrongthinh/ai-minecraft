/**
 * DeathRecovery.js
 * 
 * Reflex Logic:
 * 1. On Death: Record Position, Dimension, Cause.
 * 2. On Spawn: Check if we have a recent pending death recovery.
 * 3. If safe (not void/lava), go to last death pos to collect items.
 * 
 * Features:
 * - Persistence: Saves state to reflex_state.json (survives restarts)
 * - Loop Prevention: Max 1 retry per death
 * - Timeout: 5 minutes (standard item despawn)
 */
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import fs from 'fs';

const STATE_FILE = 'reflex_state.json';

export class DeathRecovery {
    constructor(agent) {
        this.agent = agent;
        this.lastDeath = null;
        this.recoveryTimeout = 5 * 60 * 1000; // 5 minutes (standard item despawn)
        this.isRecovering = false;

        // Unrecoverable causes
        this.UNRECOVERABLE = [
            'lava', 'magma', 'void', 'fell out of the world'
        ];

        this.loadState();
    }

    loadState() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = fs.readFileSync(STATE_FILE, 'utf8');
                this.lastDeath = JSON.parse(data);
                // Validate expiry on load
                if (Date.now() - this.lastDeath.timestamp > this.recoveryTimeout) {
                    this.lastDeath = null;
                    this.saveState();
                }
            }
        } catch (err) {
            console.warn('[DeathRecovery] Failed to load state:', err);
        }
    }

    saveState() {
        try {
            if (this.lastDeath) {
                fs.writeFileSync(STATE_FILE, JSON.stringify(this.lastDeath, null, 2));
            } else if (fs.existsSync(STATE_FILE)) {
                fs.unlinkSync(STATE_FILE);
            }
        } catch (err) {
            console.warn('[DeathRecovery] Failed to save state:', err);
        }
    }

    onDeath(deathMsg) {
        if (!this.agent.bot || !this.agent.bot.entity) return;

        const pos = this.agent.bot.entity.position.clone();
        const dimension = this.agent.bot.game.dimension;

        const isUnrecoverable = this.UNRECOVERABLE.some(cause => deathMsg.toLowerCase().includes(cause));

        this.lastDeath = {
            position: pos,
            dimension: dimension,
            timestamp: Date.now(),
            cause: deathMsg,
            recoverable: !isUnrecoverable,
            retryCount: 0 // New: Loop prevention
        };

        this.saveState();
        console.log(`[DeathRecovery] Death recorded at ${pos}. Recoverable: ${!isUnrecoverable}`);

        // Gap 1 Fix: Store death event to Cognee for long-term learning
        // MemorySystem handles death recording via signals now.
    }

    async onSpawn() {
        // If we have a pending recovery
        if (this.lastDeath && this.lastDeath.recoverable) {
            // Check expiry
            if (Date.now() - this.lastDeath.timestamp > this.recoveryTimeout) {
                console.log('[DeathRecovery] Last death too old to recover.');
                this.lastDeath = null;
                this.saveState();
                return;
            }

            // Check retry limit
            if (this.lastDeath.retryCount >= 1) {
                console.log('[DeathRecovery] Max retries reached or previous attempt failed. Aborting to avoid death loop.');
                this.lastDeath = null;
                this.saveState();
                return;
            }

            // Check dimension
            if (this.agent.bot.game.dimension !== this.lastDeath.dimension) {
                console.log('[DeathRecovery] Cannot recover: Wrong dimension.');
                return;
            }

            // Increment retry
            this.lastDeath.retryCount++;
            this.saveState();

            // Trigger Recovery
            console.log('[DeathRecovery] 🚑 Initiating Death Recovery Sequence...');
            await this.recoverItems();
        }
    }

    async recoverItems() {
        if (this.isRecovering) return;
        this.isRecovering = true;

        if (!this.lastDeath || !this.lastDeath.position) {
            this.isRecovering = false;
            return;
        }

        const targetPos = this.lastDeath.position;

        try {
            // Fix: setGoal is sync and doesn't wait. Use goto() to wait for arrival.
            const goal = new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2);
            await this.agent.bot.pathfinder.goto(goal);
            console.log('[DeathRecovery] Arrived at death location. Scanning for items...');

            // Wait a bit for items to be picked up (magnet range)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Look around for items
            // (Simple heuristic: Pathfinding getting there usually picks them up)

            console.log('[DeathRecovery] Recovery attempt complete.');
        } catch (err) {
            console.warn('[DeathRecovery] Failed to reach death location:', err.message);
        } finally {
            this.isRecovering = false;
            // Note: We don't clear lastDeath immediately in case we want to support multi-tries later,
            // but for now, we clear it to prevent loops, relying on retryCount above.
            this.lastDeath = null;
            this.saveState();
        }
    }
}
