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
        this.activeListeners = new Map(); // Track transient listeners
    }

    /**
     * Phase 5: Safe Initialization
     */
    connect(bot) {
        if (!bot) {
            console.warn('[ReflexSystem] Cannot connect to null bot');
            return;
        }
        this.cleanup();

        console.log('[ReflexSystem] 🔗 Attaching core monitors...');
        this._setupCoreMonitors(bot);
    }

    /**
     * Setup persistent core monitors (Health, Death)
     */
    _setupCoreMonitors(bot) {
        // High-level health monitor (throttle via SignalBus)
        this._healthListener = () => this._onHealthChange(bot);
        this._deathListener = () => {
            globalBus.emitSignal(SIGNAL.DEATH, { timestamp: Date.now() });
        };

        bot.on('health', this._healthListener);
        bot.on('death', this._deathListener);

        // Low-level packet monitor for instant damage detection (saves 1-2 ticks)
        this._packetListener = (data, meta) => {
            if (meta.name === 'entity_status' && data.entityId === bot.entity.id && data.entityStatus === 2) {
                // Status 2 is "Hurt"
                this._onDirectDamage();
            }
        };
        bot._client.on('packet', this._packetListener);
    }

    _onHealthChange(bot) {
        if (bot.health < 10) {
            globalBus.emitSignal(SIGNAL.HEALTH_CRITICAL, { health: bot.health });
        } else if (bot.health < 18) {
            globalBus.emitSignal(SIGNAL.HEALTH_LOW, { health: bot.health });
        }

        const inCombat = bot.pvp && bot.pvp.target;
        if (bot.food < (inCombat ? 10 : 18)) {
            globalBus.emitSignal(SIGNAL.HUNGRY, { food: bot.food, context: inCombat ? 'combat' : 'safe' });
        }

        if (bot.health < this.lastHealth) {
            bot.lastDamageTime = Date.now();
            bot.lastDamageTaken = this.lastHealth - bot.health;
            if (bot.lastDamageTaken > 2) {
                globalBus.emitSignal(SIGNAL.THREAT_DETECTED, { source: 'damage', amount: bot.lastDamageTaken });
            }
        }
        this.lastHealth = bot.health;
    }

    _onDirectDamage() {
        console.log('[ReflexSystem] ⚡ INSTANT DAMAGE DETECTED (Packet Level)');
        globalBus.emitSignal(SIGNAL.THREAT_DETECTED, { type: 'instant_damage', timestamp: Date.now() });

        // Example of Transient Listener: Activate Physics check on damage if falling
        if (!this.agent.bot.entity.onGround) {
            this.registerTransient('physicsTick', () => {
                if (this.agent.physics && this.agent.physics.shouldMLG()) {
                    this.agent.physics.performMLG();
                    return true; // self-destruct
                }
                return false;
            }, 5000); // 5s TTL
        }
    }

    /**
     * Transient Listener Pattern
     * @param {string} eventName - bot event or 'physicsTick'
     * @param {Function} callback - Should return true to self-destruct
     * @param {number} ttl - Max duration in ms
     */
    registerTransient(eventName, callback, ttl = 10000, once = true) {
        const bot = this.agent.bot;
        if (!bot) return;

        const startTime = Date.now();
        const wrapper = (...args) => {
            const result = callback(...args);
            const shouldDestroy = once || result === true || (Date.now() - startTime > ttl);
            if (shouldDestroy) {
                this.removeTransient(eventName);
            }
        };

        this.removeTransient(eventName); // Ensure no duplicate
        this.activeListeners.set(eventName, wrapper);

        if (eventName === 'physicsTick') {
            bot.on('physicsTick', wrapper);
        } else {
            bot.on(eventName, wrapper);
        }
    }

    removeTransient(eventName) {
        const listener = this.activeListeners.get(eventName);
        if (listener) {
            this.agent.bot.removeListener(eventName, listener);
            this.activeListeners.delete(eventName);
        }
    }

    cleanup() {
        const bot = this.agent.bot;
        if (!bot) return;

        console.log('[ReflexSystem] 🧹 Cleaning up all listeners...');
        if (this._healthListener) bot.removeListener('health', this._healthListener);
        if (this._deathListener) bot.removeListener('death', this._deathListener);
        if (this._packetListener) bot._client.removeListener('packet', this._packetListener);

        for (const eventName of this.activeListeners.keys()) {
            this.removeTransient(eventName);
        }

        this._healthListener = null;
        this._deathListener = null;
        this._packetListener = null;
    }
}
