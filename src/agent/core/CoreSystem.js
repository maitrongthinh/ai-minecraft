
import { globalBus, SIGNAL } from './SignalBus.js';
import { MemorySystem } from '../memory/MemorySystem.js';
import { TaskScheduler } from './TaskScheduler.js';
import { ContextManager } from './ContextManager.js';
import { ReflexSystem } from './ReflexSystem.js';
import { SocialEngine } from '../interaction/SocialEngine.js';
import { CodeEngine } from '../intelligence/CodeEngine.js';
import { ScenarioManager } from '../tasks/ScenarioManager.js';
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

        const maxTokens = agent.config?.profile?.model_config?.max_context_window || 8000;
        this.contextManager = new ContextManager(agent, maxTokens);

        this.reflexSystem = new ReflexSystem(agent);
        this.memory = new MemorySystem(agent);

        // Subsystems (initialized in async method)
        this.social = null;
        this.intelligence = null;
        this.scenarios = null;

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
        // Unified Subsystem Initialization
        this.social = new SocialEngine(this.agent);
        this.intelligence = new CodeEngine(this.agent);
        this.scenarios = new ScenarioManager(null, this.agent);

        console.log('[CoreSystem] ✓ Subsystems (Social, Code, Scenarios) Loaded');

        // 3. Initialize Scheduler
        // this.scheduler already initialized in constructor

        // 4. Start Safeguards
        this.startSafeguards();

        this.isRunning = true;
        console.log('[CoreSystem] ✅ Kernel Initialized (Waiting for Bot Connection...)');

        return true;
    }

    /**
     * Phase 5: Safe Initialization
     * Connects valid bot instance to subsystems
     */
    connectBot(bot) {
        if (!bot) {
            console.error('[CoreSystem] ❌ Cannot connect null bot!');
            return;
        }
        console.log('[CoreSystem] 🔗 Connecting Bot Instance to Subsystems...');

        // Connect Reflexes (Safe Init)
        this.reflexSystem.connect(bot);

        console.log('[CoreSystem] ✅ Bot Connected Successfully');
    }

    /**
     * Start Omega Safeguards
     */
    startSafeguards() {
        // 1. Zombie Task Killer (Soft Reset Mode)
        // Checks every 10s for tasks running > 60s without updates
        const intervals = this.agent.config.profile?.system_intervals || {};
        const zombieCheck = intervals.zombie_check || 10000;
        const zombieThreshold = intervals.zombie_threshold || 60000;
        const watchdogCheck = intervals.watchdog_check || 3000;

        const config = this.agent.config || settings;
        if (config.watchdog && config.watchdog.enabled) {
            this.zombieInterval = setInterval(() => {
                if (this.scheduler) {
                    // Pass 'true' to indicate soft reset instead of kill
                    this.scheduler.checkZombieTasks(zombieThreshold);
                }
            }, zombieCheck);
            console.log(`[CoreSystem] 🛡️ Zombie Task Killer ENABLED (Check: ${zombieCheck}ms, Threshold: ${zombieThreshold}ms)`);

            // 2. Physical Watchdog (Soft Reset Mode)
            this.watchdogInterval = setInterval(() => {
                this.checkPhysicalState();
            }, watchdogCheck);
            console.log(`[CoreSystem] 🛡️ Physical Watchdog ENABLED (Check: ${watchdogCheck}ms)`);
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

        // Safe Timeout Wrapper
        const safeTimeout = (fn, ms) => {
            const id = setTimeout(fn, ms);
            this.activeTimers.add(id);
            // Cleanup on finish
            setTimeout(() => this.activeTimers.delete(id), ms + 10);
        };

        // Random Jump
        bot.setControlState('jump', true);
        safeTimeout(() => bot.setControlState('jump', false), 500);

        // Random Walk
        const randomYaw = Math.random() * Math.PI * 2;
        bot.look(randomYaw, 0).catch(e => console.error('[Watchdog] Look failed:', e.message));
        bot.setControlState('forward', true);
        safeTimeout(() => bot.setControlState('forward', false), 1000);

        this.bus.emitSignal(SIGNAL.THREAT_DETECTED, { type: 'stuck', source: 'PhysicalWatchdog' })
            ?.catch(e => console.error('[Watchdog] Signal emit failed:', e.message));
    }

    /**
     * Graceful Shutdown
     */
    shutdown() {
        console.log('[CoreSystem] 🛑 Shutting down Kernel...');
        this.isRunning = false;

        // Initialized in constructor to avoid undefined access
        if (!this.activeTimers) this.activeTimers = new Set();

        // Clear floating timers
        for (const timerId of this.activeTimers) {
            clearTimeout(timerId);
        }
        this.activeTimers.clear();

        // Cleanup sub-components
        if (this.reflexSystem) this.reflexSystem.cleanup();
        if (this.memory && typeof this.memory.shutdown === 'function') this.memory.shutdown();

        // Clear safeguards
        if (this.zombieInterval) clearInterval(this.zombieInterval);
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        this.zombieInterval = null;
        this.watchdogInterval = null;

        // Clear floating timers
        for (const timerId of this.activeTimers) {
            clearTimeout(timerId);
        }
        this.activeTimers.clear();

        if (this.scheduler) {
            this.scheduler.shutdown();
            this.scheduler.interruptPhysicalTasks();
            this.scheduler.queue = [];
        }

        this.bus.clearAllListeners(); // Prevent memory leaks
        console.log('[CoreSystem] ⏏️ Kernel Halted');
    }
}
