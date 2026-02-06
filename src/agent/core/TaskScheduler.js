/**
 * TaskScheduler - Central Cortex (Nervous System)
 * 
 * The "heart" of the agent's task management system.
 * Ensures bot can walk, think, and look simultaneously without conflicts.
 * 
 * Priority Levels:
 * - 100: Survival (combat reflex, fall damage)
 * - 80:  User commands (direct orders)
 * - 50:  Work tasks (building, mining)
 * - 10:  Background (vision, memory save)
 */

import { globalBus, SIGNAL } from './SignalBus.js';

export const PRIORITY = {
    SURVIVAL: 100,
    USER: 80,
    WORK: 50,
    BACKGROUND: 10
};

export class TaskScheduler {
    constructor(agent) {
        this.agent = agent;
        this.queue = [];
        // Map to track active tasks: key=taskName, value=taskObj
        this.activeTasks = new Map();
        this._processing = false;

        this._setupReflexListeners();
    }

    _setupReflexListeners() {
        // High Priority: Critical Health -> Panic/Heal
        globalBus.subscribe(SIGNAL.HEALTH_CRITICAL, (payload) => {
            console.log('[TaskScheduler] 🚑 REFLEX: Critical Health!', payload);
            this.schedule('survival_reflex', 100, async () => {
                // Should invoke SurvivalSystem or simple fallback
                await this.agent.bot.stopDigging();
                console.log('SURVIVAL REFLEX EXECUTED');
                // Real implementation would be: await this.agent.survivalSystem.handleCritical(payload);
            }, false); // Serial task
        });

        // Medium Priority: Hungry -> Eat
        globalBus.subscribe(SIGNAL.HUNGRY, (payload) => {
            console.log('[TaskScheduler] 🍎 REFLEX: Hungry', payload);
            this.schedule('eat_reflex', 90, async () => {
                // await this.agent.survivalSystem.eat();
                console.log('EAT REFLEX EXECUTED');
            }, false);
        });

        // Combat: Threat Detected
        globalBus.subscribe(SIGNAL.THREAT_DETECTED, (payload) => {
            console.log('[TaskScheduler] ⚔️ REFLEX: Threat Detected', payload);
            // Panic or Fight task
            this.schedule('combat_reflex', 95, async () => {
                console.log('COMBAT REFLEX EXECUTED');
            }, false);
        });
    }

    /**
     * Schedule a task for execution
     * @param {string} name - Task identifier (e.g., 'build_wall', 'combat_reflex')
     * @param {number} priority - 100 (Survival), 80 (User), 50 (Work), 10 (Background)
     * @param {Function} taskFn - Async function to execute
     * @param {boolean} canRunParallel - True if can run alongside other tasks (e.g., Chat, Vision)
     */
    schedule(name, priority, taskFn, canRunParallel = false) {
        const task = {
            name,
            priority,
            taskFn,
            canRunParallel,
            timestamp: Date.now()
        };

        // RULE 1: Critical Interrupt (Reflexes - Priority >= 100)
        // Survival tasks immediately interrupt physical actions
        if (priority >= 100) {
            console.log(`[CORTEX] ⚡ CRITICAL INTERRUPT: ${name}`);
            this.interruptPhysicalTasks();
            this.execute(task);
            return;
        }

        // RULE 2: Insertion Sort by Priority (desc)
        // Ensures queue is always sorted highest priority first
        const index = this.queue.findIndex(t => t.priority < priority);
        if (index === -1) {
            this.queue.push(task);
        } else {
            this.queue.splice(index, 0, task);
        }

        this.processQueue();
    }

    /**
     * Cancel a scheduled or active task by name
     * @param {string} name - Task name to cancel
     * @returns {boolean} - True if task was found and cancelled
     */
    cancel(name) {
        // Remove from queue
        const queueIndex = this.queue.findIndex(t => t.name === name);
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1);
            console.log(`[CORTEX] 🗑️ Cancelled queued task: ${name}`);
            return true;
        }

        // If active, mark for cancellation (actual stop handled by task itself)
        if (this.activeTasks.has(name)) {
            console.log(`[CORTEX] 🛑 Marked active task for stop: ${name}`);
            // We can't forcibly stop an async function, but we can signal it
            const task = this.activeTasks.get(name);
            task.cancelled = true;
            return true;
        }

        return false;
    }

    /**
     * Interrupt all physical (non-parallel) tasks
     * Used for emergency situations like combat
     */
    interruptPhysicalTasks() {
        for (const [name, task] of this.activeTasks) {
            if (!task.canRunParallel) {
                // Stop physical bot actions
                if (this.agent.actions) {
                    this.agent.actions.stop();
                }
                this.activeTasks.delete(name);
                console.log(`[CORTEX] 🛑 Interrupted task: ${name}`);
            }
        }
    }

    /**
     * Process the task queue
     */
    async processQueue() {
        if (this._processing || this.queue.length === 0) return;

        const nextTask = this.queue[0];

        // RULE 3: Concurrency Check
        // If a blocking (non-parallel) task is running, new non-parallel tasks must wait
        const hasBlockingTask = Array.from(this.activeTasks.values())
            .some(t => !t.canRunParallel);

        if (hasBlockingTask && !nextTask.canRunParallel) {
            // Check if new task has higher priority than current blocking task
            const blockingTask = Array.from(this.activeTasks.values())
                .find(t => !t.canRunParallel);

            if (blockingTask && nextTask.priority > blockingTask.priority) {
                // Higher priority task - interrupt the blocking task
                console.log(`[CORTEX] ⬆️ Priority upgrade: ${nextTask.name} > ${blockingTask.name}`);
                this.interruptPhysicalTasks();
            } else {
                // Same or lower priority - wait
                return;
            }
        }

        this._processing = true;
        this.queue.shift();
        await this.execute(nextTask);
        this._processing = false;

        // Process next in queue
        this.processQueue();
    }

    /**
     * Execute a task with error handling
     * @param {Object} task - Task object to execute
     */
    async execute(task) {
        this.activeTasks.set(task.name, task);
        const startTime = Date.now();

        try {
            console.log(`[CORTEX] ▶️ Starting: ${task.name} (priority: ${task.priority})`);
            await task.taskFn();
            const duration = Date.now() - startTime;
            console.log(`[CORTEX] ✅ Completed: ${task.name} (${duration}ms)`);
        } catch (error) {
            console.error(`[CORTEX] ❌ Task '${task.name}' crashed:`, error.message);

            // Phase 2: Capture failure context for Evolution Engine
            const snapshot = this._captureFailureContext(task, error);

            // Phase 4: Event-Driven Failure Handling
            // Instead of calling evolution engine directly, we emit a signal
            // This allows multiple listeners (Evolution, Logging, UI) to react
            globalBus.emitSignal(SIGNAL.TASK_FAILED, {
                task: task.name,
                error: error.message,
                snapshot: snapshot,
                timestamp: Date.now()
            });

            // Report failure to Cognee for learning from mistakes
            if (this.agent.cogneeMemory) {
                try {
                    await this.agent.cogneeMemory.reportFailure(task.name, error.message);
                } catch (e) {
                    // Silently fail - don't crash the scheduler for logging issues
                }
            }

            // Record error in history for failure-aware planning
            if (this.agent.history) {
                this.agent.history.addError(task.name, error.message, {
                    priority: task.priority,
                    duration: Date.now() - startTime
                });
            }
        } finally {
            this.activeTasks.delete(task.name);
        }
    }

    /**
     * Capture context for failure analysis
     */
    _captureFailureContext(task, error) {
        return {
            taskName: task.name,
            errorMessage: error.message,
            stack: error.stack,
            agentState: {
                health: this.agent.bot?.health,
                position: this.agent.bot?.entity?.position,
                inventory: this.agent.bot?.inventory?.items()?.map(i => i.name).slice(0, 5) // Top 5 items
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Check for Zombie Tasks (running > TTL)
     * Phase 5 Omega Safeguard
     */
    checkZombieTasks(ttl = 60000) {
        const now = Date.now();
        for (const [name, task] of this.activeTasks) {
            if (now - task.timestamp > ttl) {
                console.warn(`[CORTEX] 🧟 ZOMBIE TASK DETECTED: ${name} (Age: ${(now - task.timestamp) / 1000}s)`);
                // Kill it
                this.cancel(name);

                // Emit signal
                globalBus.emitSignal(SIGNAL.TASK_FAILED, {
                    task: name,
                    error: 'Zombie Task Timeout (Forced Kill)',
                    snapshot: this._captureFailureContext(task, new Error('Timeout'))
                });
            }
        }
    }
}
