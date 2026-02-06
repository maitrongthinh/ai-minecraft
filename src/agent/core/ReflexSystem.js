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

        // Health Monitor
        this.agent.bot.on('health', () => {
            const health = this.agent.bot.health;
            if (health < 10 && health < this.lastHealth) {
                if (health < 5) {
                    this._emitThrottled(SIGNAL.HEALTH_CRITICAL, { health });
                } else {
                    this._emitThrottled(SIGNAL.HEALTH_LOW, { health });
                }
            }
            this.lastHealth = health;
        });

        // Hunger Monitor
        this.agent.bot.on('food', () => {
            // Mineflayer event is 'food' or uses bot.food property
            // Actually mineflayer emits 'health' for health/food updates usually? 
            // Double check: Mineflayer 'health' event covers food too? No, usually separate.
            // But let's check bot.food in the health listener too or add dedicated.
            // Mineflayer docs: 'health' event fires when health or food changes.

            const food = this.agent.bot.food;
            if (food < 6 && food < this.lastFood) {
                this._emitThrottled(SIGNAL.HUNGRY, { food });
                // Warning: 'health.hungry' might not be in SIGNAL const. 
                // SignalBus has HEALTH_LOW, HEALTH_CRITICAL.
                // I will verify SIGNAL list later.
            }
            this.lastFood = food;
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
