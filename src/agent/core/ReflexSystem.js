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

    /**
     * Phase 5: Safe Initialization
     * Only attach listeners when bot is actually ready
     */
    connect(bot) {
        if (!bot) {
            console.warn('[ReflexSystem] Cannot connect to null bot');
            return;
        }
        // Fix for [CRITICAL] leak: Ensure old listeners are removed first
        this.cleanup();

        console.log('[ReflexSystem] 🔗 Attaching autonomic monitors to bot...');
        this._setupMonitors(bot);
    }

    _setupMonitors(bot) {
        // Store listeners for removal (Fix for [CRITICAL] leak)
        this._healthListener = () => {
            // 1. Health Monitoring
            if (bot.health < 10) {
                globalBus.emitSignal(SIGNAL.HEALTH_CRITICAL, { health: bot.health });
            } else if (bot.health < 18) {
                globalBus.emitSignal(SIGNAL.HEALTH_LOW, { health: bot.health });
            }

            // 2. Hunger Monitoring (Smart Eating)
            const inCombat = bot.pvp && bot.pvp.target;
            const food = bot.food;

            if (inCombat) {
                if (food < 10) {
                    globalBus.emitSignal(SIGNAL.HUNGRY, { food, context: 'combat' });
                }
            } else {
                if (food < 18) { // Keep topped up when safe
                    globalBus.emitSignal(SIGNAL.HUNGRY, { food, context: 'safe' });
                }
            }

            // 3. Damage Tracking
            if (bot.health < this.lastHealth) {
                bot.lastDamageTime = Date.now();
                bot.lastDamageTaken = this.lastHealth - bot.health;

                if (bot.lastDamageTaken > 2) {
                    globalBus.emitSignal(SIGNAL.THREAT_DETECTED, {
                        source: 'unknown_damage',
                        damage: bot.lastDamageTaken
                    });
                }
            }
            this.lastHealth = bot.health;
        };

        this._hurtListener = (entity) => {
            if (entity === bot.entity) {
                console.log('[ReflexSystem] ⚡ OUCH! Bot took damage.');
                globalBus.emitSignal(SIGNAL.THREAT_DETECTED, { type: 'damage_taken', timestamp: Date.now() });
            }
        };

        this._deathListener = () => {
            globalBus.emitSignal(SIGNAL.DEATH, { timestamp: Date.now() });
        };

        // Health, Hunger, and Damage Monitor
        bot.on('health', this._healthListener);
        bot.on('entityHurt', this._hurtListener);
        bot.on('death', this._deathListener);
    }

    cleanup() {
        if (!this.agent.bot) return;

        console.log('[ReflexSystem] 🧹 Removing autonomic monitors...');
        if (this._healthListener) this.agent.bot.removeListener('health', this._healthListener);
        if (this._hurtListener) this.agent.bot.removeListener('entityHurt', this._hurtListener);
        if (this._deathListener) this.agent.bot.removeListener('death', this._deathListener);

        this._healthListener = null;
        this._hurtListener = null;
        this._deathListener = null;
    }

    _emitThrottled(signal, payload, cooldownMs = 5000) {
        const now = Date.now();
        const last = this.cooldowns.get(signal) || 0;

        if (now - last > cooldownMs) {
            globalBus.emitSignal(signal, payload)
                ?.catch(e => console.error(`[ReflexSystem] Signal emission failed (${signal}):`, e.message));
            this.cooldowns.set(signal, now);
        }
    }
}
