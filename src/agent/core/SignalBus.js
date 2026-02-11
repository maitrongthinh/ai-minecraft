/**
 * SignalBus.js - The Synapse Bus (Event-Driven Architecture)
 * 
 * Phase 4: MindOS Kernel
 * 
 * Event-driven communication between modules.
 * Modules don't call each other directly - they emit/listen to signals.
 * 
 * Error Isolation: Module crash doesn't break the bus.
 */

import EventEmitter from 'events';

// Signal Types for inter-module communication
export const SIGNAL = {
    // Threat & Combat
    THREAT_DETECTED: 'threat.detected',
    THREAT_CLEARED: 'threat.cleared',
    COMBAT_STARTED: 'combat.started',
    COMBAT_ENDED: 'combat.ended',
    ENGAGED_TARGET: 'combat.engaged_target', // Phase 4: Swarm sync

    // Task Management
    TASK_SCHEDULED: 'task.scheduled',
    TASK_STARTED: 'task.started',
    TASK_COMPLETED: 'task.completed',
    TASK_FAILED: 'task.failed',
    TASK_CANCELLED: 'task.cancelled',

    // Memory Events
    MEMORY_STORED: 'memory.stored',
    MEMORY_RECALLED: 'memory.recalled',
    MEMORY_CLEARED: 'memory.cleared',

    // Learning & Evolution
    SKILL_LEARNED: 'skill.learned',
    SKILL_FAILED: 'skill.failed',
    CODE_GENERATED: 'code.generated',

    // Health & Survival
    HEALTH_LOW: 'health.low',
    HEALTH_CRITICAL: 'health.critical',
    HUNGRY: 'health.hungry', // < 6 food
    DEATH: 'death',
    RESPAWN: 'respawn',

    // State Changes
    STATE_CHANGED: 'state.changed',
    MODE_CHANGED: 'mode.changed',

    // Bot Events
    BOT_SPAWNED: 'bot.spawned',
    BOT_READY: 'bot.ready',
    BOT_DISCONNECTED: 'bot.disconnected',
    PEER_UPDATE: 'swarm.peer_update', // Phase 4
    SWARM_SIGNAL: 'swarm.signal',   // Phase 4

    // Vision
    ENTITY_SPOTTED: 'entity.spotted',
    BLOCK_FOUND: 'block.found',
    ENVIRONMENT_SCAN: 'environment.scan', // Background scan

    // Legacy Bridge Signals (and Observability)
    ACTION_STARTED: 'action.started',
    ACTION_COMPLETED: 'action.completed',
    ACTION_FAILED: 'action.failed',


    // Coding
    CODE_REQUEST: 'code.request',
    CODE_GENERATED: 'code.generated',

    // Chat
    CHAT_RECEIVED: 'chat.received',
    COMMAND_RECEIVED: 'command.received',

    // System 2 Lifecycle (Dual-Loop Architecture)
    SYSTEM2_START: 'system2.planning_start',
    SYSTEM2_PLAN_READY: 'system2.plan_ready',
    SYSTEM2_DEGRADED: 'system2.degraded',       // Fallback to Survival Mode
    SYSTEM2_RECOVERED: 'system2.recovered',     // Recovered from Survival

    // Voice of God Override (Priority 100)
    HUMAN_OVERRIDE: 'human.override',

    // Skill Registry
    SKILL_REGISTERED: 'skill.registered',
    SKILL_EXECUTED: 'skill.executed',

    // System Ready
    SYSTEM_READY: 'system.ready'
};

/**
 * SignalBus - Central nervous system for module communication
 */
class SignalBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // Allow many modules

        // Registry of connected modules
        this.modules = new Map();

        // Signal history for debugging
        this.history = [];
        this.maxHistory = 100;

        // Stats
        this.stats = {
            signalsEmitted: 0,
            signalsHandled: 0,
            errors: 0
        };

        console.log('[SignalBus] ⚡ Synapse Bus initialized');
    }

    /**
     * Clear all listeners (for hot-swapping/shutdown)
     */
    clearAllListeners() {
        this.removeAllListeners();
        console.log('[SignalBus] 🧹 All listeners cleared');
    }

    /**
     * Register a module with the bus
     * @param {string} name - Module name
     * @param {object} module - Module instance
     */
    registerModule(name, module) {
        this.modules.set(name, module);
        console.log(`[SignalBus] 📡 Registered module: ${name}`);
    }

    /**
     * Unregister a module
     * @param {string} name - Module name
     */
    unregisterModule(name) {
        this.modules.delete(name);
        console.log(`[SignalBus] 📴 Unregistered module: ${name}`);
    }

    /**
     * Emit a signal with error isolation
     * @param {string} signal - Signal type from SIGNAL enum
     * @param {object} payload - Data to send
     */
    emitSignal(signal, payload = {}) {
        const event = {
            signal,
            payload,
            timestamp: Date.now()
        };

        // Log to history
        this.history.push(event);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        this.stats.signalsEmitted++;

        // Get all listeners
        const listeners = this.listeners(signal);

        // Execute each handler with error isolation
        for (const handler of listeners) {
            try {
                const result = handler(event);
                this.stats.signalsHandled++;

                // Handle async handlers (Phase 4 Hardening)
                if (result instanceof Promise) {
                    result.catch(error => {
                        this.stats.errors++;
                        console.error(`[SignalBus] ❌ Async handler error for ${signal}:`, error.message);
                    });
                }
            } catch (error) {
                this.stats.errors++;
                console.error(`[SignalBus] ❌ Sync handler error for ${signal}:`, error.message);
                // Don't rethrow - isolate the error
            }
        }

        // Debug log (only for important signals)
        if (!signal.startsWith('memory.') && !signal.startsWith('entity.')) {
            console.log(`[SignalBus] ⚡ ${signal}`, payload.reason || payload.name || '');
        }
    }

    /**
     * Subscribe to a signal
     * @param {string} signal - Signal type
     * @param {function} handler - Handler function
     * @returns {function} Unsubscribe function
     */
    subscribe(signal, handler) {
        this.on(signal, handler);
        return () => this.off(signal, handler);
    }

    /**
     * Subscribe once to a signal
     * @param {string} signal - Signal type
     * @param {function} handler - Handler function
     */
    subscribeOnce(signal, handler) {
        this.once(signal, handler);
    }

    /**
     * Get recent signal history
     * @param {number} count - Number of recent signals
     */
    getHistory(count = 20) {
        return this.history.slice(-count);
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            ...this.stats,
            modulesConnected: this.modules.size,
            historySize: this.history.length
        };
    }

    /**
     * Wait for a specific signal (Promise-based)
     * @param {string} signal - Signal to wait for
     * @param {number} timeout - Timeout in ms
     */
    waitFor(signal, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(signal, handler);
                reject(new Error(`Timeout waiting for ${signal}`));
            }, timeout);

            const handler = (event) => {
                clearTimeout(timer);
                resolve(event);
            };

            this.once(signal, handler);
        });
    }

    /**
     * Clear all listeners (for shutdown)
     */
    shutdown() {
        this.removeAllListeners();
        this.modules.clear();
        console.log('[SignalBus] 🔌 Shutdown complete');
    }
}

// Global singleton instance
export const globalBus = new SignalBus();

export default SignalBus;
