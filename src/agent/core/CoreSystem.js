
import { globalBus, SIGNAL } from './SignalBus.js';
import { MemorySystem } from '../memory/MemorySystem.js';
import { TaskScheduler } from './TaskScheduler.js';
import { ContextManager } from './ContextManager.js';
import { ReflexSystem } from './ReflexSystem.js';
import settings from '../../../settings.js';

/**
 * CoreSystem.js - The Central Hub of MindOS
 * 
 * Responsibilities:
 * 1. Initialize Kernel Components (Bus, Memory, Scheduler)
 * 2. Manage System Lifecycle
 * 3. Implement Omega Safeguards (Zombie Killer, Watchdogs)
 */
export class CoreSystem {
    constructor(agent) {
        this.agent = agent;
        this.bus = globalBus;
        this.status = 'booting'; // New status property

        // Initialize Components directly
        this.scheduler = new TaskScheduler(agent);
        this.contextManager = new ContextManager(agent);
        this.reflexSystem = new ReflexSystem(agent);
        this.memory = new MemorySystem(agent);

        // Safeguard Timers (still null initially)
        this.zombieInterval = null;
        this.watchdogInterval = null;

        console.log('[CoreSystem] 🧠 Core System Instantiated');
    }

    /**
     * Phase 1: Initialize Kernel
     */
    async initialize() {
        console.log('[CoreSystem] 🚀 Initializing MindOS Kernel...');

        // 1. Initialize Signal Bus (Already singleton, but verify)

        // 2. Initialize Subsystems
        await this.memory.init();
        this.reflexSystem.init(); // Sync init (listeners)

        // 3. Initialize Scheduler
        // this.scheduler already initialized in constructor

        // 4. Start Safeguards
        this.startSafeguards();

        this.isRunning = true;
        console.log('[CoreSystem] ✅ Kernel Initialized');

        return true;
    }

    /**
     * Start Omega Safeguards
     */
    startSafeguards() {
        // 1. Zombie Task Killer (Soft Reset Mode)
        // Checks every 10s for tasks running > 60s without updates
        if (settings.watchdog && settings.watchdog.enabled) {
            this.zombieInterval = setInterval(() => {
                if (this.scheduler) {
                    // Pass 'true' to indicate soft reset instead of kill
                    // But scheduler.checkZombieTasks needs update to handle this if we want soft reset
                    // For now, we heavily discourage killing. 
                    // Let's use the requested logic: Log warning only.
                    this.scheduler.checkZombieTasks(60000);
                }
            }, 10000);
            console.log('[CoreSystem] 🛡️ Zombie Task Killer ENABLED (Soft Mode)');

            // 2. Physical Watchdog (Soft Reset Mode)
            this.watchdogInterval = setInterval(() => {
                this.checkPhysicalState();
            }, settings.watchdog.check_interval_ms || 3000);
            console.log('[CoreSystem] 🛡️ Physical Watchdog ENABLED');
        } else {
            console.log('[CoreSystem] 🛡️ Watchdogs DISABLED (Configuration)');
        }
    }

    /**
     * Physical Watchdog Logic
     * If pathfinder is active but XYZ hasn't changed -> Trigger Jump + Random Walk
     */
    checkPhysicalState() {
        const bot = this.agent.bot;
        if (!bot || !bot.entity) return;

        // Only check if moving
        const isMoving = bot.pathfinder && bot.pathfinder.isMoving();
        if (!isMoving) {
            this.lastPos = null;
            return;
        }

        const currentPos = bot.entity.position;
        if (this.lastPos) {
            const dist = currentPos.distanceTo(this.lastPos);
            if (dist < 0.2) { // Stuck threshold
                console.warn('[Watchdog] ⚠️ Bot appears stuck! Triggering reflex...');
                this.triggerUnstuckReflex(bot);
            }
        }
        this.lastPos = currentPos.clone();
    }

    triggerUnstuckReflex(bot) {
        // Swing arm (Visual Status: Error/Stuck)
        bot.swingArm();

        // Random Jump
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);

        // Random Walk
        const randomYaw = Math.random() * Math.PI * 2;
        bot.look(randomYaw, 0).catch(e => console.error('[Watchdog] Look failed:', e.message));
        bot.setControlState('forward', true);
        setTimeout(() => bot.setControlState('forward', false), 1000);

        this.bus.emitSignal(SIGNAL.THREAT_DETECTED, { type: 'stuck', source: 'PhysicalWatchdog' })
            ?.catch(e => console.error('[Watchdog] Signal emit failed:', e.message));
    }

    /**
     * Graceful Shutdown
     */
    shutdown() {
        console.log('[CoreSystem] 🛑 Shutting down Kernel...');
        this.isRunning = false;

        if (this.zombieInterval) clearInterval(this.zombieInterval);
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        this.zombieInterval = null;
        this.watchdogInterval = null;

        // Cleanup sub-components
        if (this.reflexSystem) this.reflexSystem.cleanup();
        if (this.scheduler) {
            this.scheduler.shutdown();
            this.scheduler.interruptPhysicalTasks();
            this.scheduler.queue = [];
        }

        this.bus.clearAllListeners(); // Prevent memory leaks
        console.log('[CoreSystem] ⏏️ Kernel Halted');
    }
}
