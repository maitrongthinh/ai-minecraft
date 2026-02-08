import { globalBus, SIGNAL } from './SignalBus.js';

/**
 * ReflexSystem - autonomic Nervous System
 * 
 * Monitors bot vitals and immediate sensors (health, hunger, pain).
 * Emits signals to the SignalBus to trigger higher-level reactions.
 */
export class ReflexSystem {
    constructor(agent) {
        this.agent = agent;
        this.lastHealth = 20;
        this.lastFood = 20;
        this.cooldowns = new Map();
    }

    init() {
        console.log('[ReflexSystem] Initializing autonomic functions...');
        this._setupMonitors();
    }

    _setupMonitors() {
        if (!this.agent.bot) {
            console.warn('[ReflexSystem] Bot not ready, skipping monitors');
            return;
        }

        // Health, Hunger, and Damage Monitor (combined into one 'health' event listener)
        this.agent.bot.on('health', () => {
            // 1. Health Monitoring
            if (this.agent.bot.health < 10) {
                globalBus.emitSignal(SIGNAL.HEALTH_CRITICAL, { health: this.agent.bot.health });
            } else if (this.agent.bot.health < 18) {
                globalBus.emitSignal(SIGNAL.HEALTH_LOW, { health: this.agent.bot.health });
            }

            // 2. Hunger Monitoring (Smart Eating)
            const inCombat = this.agent.bot.pvp && this.agent.bot.pvp.target;
            const food = this.agent.bot.food;

            // Combat threshold: Only eat if CRITICAL or if Safe to eat
            // Danger threshold: 14 (Can't sprint)
            // Critical threshold: 6 (Starving)

            if (inCombat) {
                // In Combat: Only eat if starving OR if we have "Gap Apple" equivalents (not implemented yet, just prioritizing survival)
                // Or if health is critical. 
                // Don't modify autoEat options here directly (expensive), just emit signal for Strategy
                if (food < 10) {
                    globalBus.emitSignal(SIGNAL.HUNGRY, { food, context: 'combat' });
                }
            } else {
                // Normal / Idle
                if (food < 18) { // Keep topped up when safe
                    globalBus.emitSignal(SIGNAL.HUNGRY, { food, context: 'safe' });
                }
            }

            // 3. Damage Tracking
            if (this.agent.bot.health < this.lastHealth) {
                this.agent.bot.lastDamageTime = Date.now();
                this.agent.bot.lastDamageTaken = this.lastHealth - this.agent.bot.health;

                // Emit threat if significant damage
                if (this.agent.bot.lastDamageTaken > 2) {
                    globalBus.emitSignal(SIGNAL.THREAT_DETECTED, {
                        source: 'unknown_damage',
                        damage: this.agent.bot.lastDamageTaken
                    });
                }
            }
            this.lastHealth = this.agent.bot.health;
        });

        // Pain / Damage Monitor
        this.agent.bot.on('entityHurt', (entity) => {
            if (entity === this.agent.bot.entity) {
                // We were hurt!
                console.log('[ReflexSystem] ⚡ OUCH! Bot took damage.');
                // Find nearest hostile?
                // For now just emit threat signal
                globalBus.emitSignal(SIGNAL.THREAT_DETECTED, { type: 'damage_taken', timestamp: Date.now() });
            }
        });

        // Death Monitor
        this.agent.bot.on('death', () => {
            globalBus.emitSignal(SIGNAL.DEATH, { timestamp: Date.now() });
        });
    }

    _emitThrottled(signal, payload, cooldownMs = 5000) {
        const now = Date.now();
        const last = this.cooldowns.get(signal) || 0;

        if (now - last > cooldownMs) {
            globalBus.emitSignal(signal, payload);
            this.cooldowns.set(signal, now);
        }
    }
}
