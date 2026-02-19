import { globalBus, SIGNAL } from './SignalBus.js';

/**
 * AutoHealer - The MindOS Self-Correction Layer
 * 
 * Monitors the system for "software hangs" and hung tasks.
 * Automatically kills, restarts, or cleans up components as needed.
 */
export class AutoHealer {
    constructor(agent) {
        this.agent = agent;
        this.healInterval = 30000; // 30s check
        this._timer = null;
    }

    init() {
        console.log('[AutoHealer] 🚑 Self-Healing system online.');
        this._timer = setInterval(() => this.diagnose(), this.healInterval);
    }

    cleanup() {
        if (this._timer) clearInterval(this._timer);
    }

    async diagnose() {
        if (!this.agent.scheduler) return;

        // 1. Detect Stuck Tasks
        const now = Date.now();
        for (const [id, task] of this.agent.scheduler.activeTasks.entries()) {
            if (task.startTime && (now - task.startTime > 120000)) { // 2 minute hard timeout
                console.warn(`[AutoHealer] 🚨 STUCK TASK detected: "${task.name}" (ID: ${id}). Terminating...`);
                this.agent.scheduler.activeTasks.delete(id);
                globalBus.emitSignal(SIGNAL.TASK_FAILED, { id, name: task.name, error: 'TIMEOUT_AUTO_HEALED' });
            }
        }

        // 2. Check Memory Critical (via Profiler data)
        const stats = this.agent.profiler?.getStats();
        if (stats && stats.memory.heapUsed > 600 * 1024 * 1024) { // 600MB
            console.warn('[AutoHealer] 🧹 Memory overhead high. Triggering GC signal.');
            // Note: Can't force GC in Node easily without --expose-gc, but we can clear caches.
            this.agent.memory?.clearCache?.();
        }

        // 3. Logic: If bot is in limbo (no signals for 5 mins) -> Restart?
        // TODO: Implement "Heartbeat Loss" recovery
    }

    /**
     * Emergency Rebind: Resets a component if it's failing
     */
    async rebindComponent(name) {
        console.log(`[AutoHealer] 🔄 Attempting emergency rebind of: ${name}`);
        if (!this.agent.core) return;

        switch (name) {
            case 'social':
                this.agent.core.social.cleanup();
                this.agent.core.social.init();
                break;
            case 'monitor':
                this.agent.core.monitor.stop();
                this.agent.core.monitor.start();
                break;
        }
    }
}
