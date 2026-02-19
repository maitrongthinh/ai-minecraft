/**
 * TaskScheduler - Central Cortex (Sovereign 3.1)
 * 
 * The "heart" of the agent's task management system.
 * Ensures bot can walk, think, and look simultaneously without conflicts.
 * 
 * Architecture v3.1:
 * - Reads state from GLOBAL BLACKBOARD (Single Source of Truth).
 * - Priority Queue: SURVIVAL > USER > WORK > BACKGROUND.
 */

import { globalBus, SIGNAL } from './SignalBus.js';
import { Blackboard } from './Blackboard.js'; // Decoupled State

export const PRIORITY = {
    SURVIVAL: 100,
    USER: 80,
    WORK: 50,
    BACKGROUND: 10
};

export class TaskScheduler {
    constructor(agent) {
        this.agent = agent;
        this.blackboard = new Blackboard(agent); // Attach State
        this.queue = [];
        this.activeTasks = new Map();
        this._processing = false;
        this._unsubscribers = [];

        this._setupReflexListeners();
    }

    /**
     * Calculate dynamic priority based on BLACKBOARD state
     */
    calculateUtility(taskName, basePriority) {
        // v3.1: Read from Blackboard instead of raw bot object where possible
        // Fallback to bot object if blackboard not fully hydrated
        const bot = this.agent.bot;
        // v3.1: Read from Blackboard (Single Source of Truth)
        const hp = this.blackboard.get('self_state.health') ?? bot?.health ?? 20;
        const food = this.blackboard.get('self_state.food') ?? bot?.food ?? 20;

        const profile = this.agent.config?.profile;
        const priorities = profile?.behavior?.priorities || {
            survival_base: 40,
            survival_multiplier: 4,
            hunger_base: 20,
            hunger_multiplier: 4.6
        };

        switch (taskName) {
            case 'survival_reflex':
            case 'combat_reflex':
                // Dynamic Survival: Inverse scale
                const healthMultiplier = Math.max(0, (20 - hp) * (priorities.survival_multiplier || 4));
                const utility = (priorities.survival_base || 40) + healthMultiplier;

                // Logging high utility decisions
                if (utility > 80) {
                    // console.log(`[CORTEX] ⚠️ High Survival Utility: ${utility.toFixed(1)} (HP: ${hp})`);
                }
                return utility;

            case 'eat_reflex':
                // Hunger utility
                const hungerMultiplier = Math.max(0, (20 - food) * (priorities.hunger_multiplier || 4.6));
                return (priorities.hunger_base || 20) + hungerMultiplier;

            default:
                return basePriority;
        }
    }

    _setupReflexListeners() {
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.HEALTH_CRITICAL, (payload) => {
            const utility = this.calculateUtility('survival_reflex', 100);
            this.schedule('survival_reflex', utility, async () => {
                await this.agent.bot.stopDigging();
                console.log(`[CORTEX] 🚨 CRITICAL SURVIVAL REFLEX (HP: ${payload.health})`);

                // If in combat, trigger retreat
                if (this.agent.combatReflex?.inCombat) {
                    await this.agent.combatReflex._executeRetreat();
                } else {
                    // Try to eat for regeneration
                    // TODO: Move this logic to a proper Reflex File (dr_eat.js)
                    const food = this.agent.bot.inventory.items().find(i => i.name.includes('cook') || i.name.includes('apple') || i.name.includes('steak'));
                    if (food) {
                        await this.agent.bot.equip(food, 'hand');
                        try {
                            // Guard against consumption errors
                            await this.agent.bot.consume();
                        } catch (e) {
                            console.log("[CORTEX] Eat failed", e.message);
                        }
                    }
                }
            }, false);
        }));

        this._unsubscribers.push(globalBus.subscribe(SIGNAL.HUNGRY, (payload) => {
            const utility = this.calculateUtility('eat_reflex', 90);
            this.schedule('eat_reflex', utility, async () => {
                // Check if we already have an eat task
                if (this.activeTasks.has('eat_reflex')) return;

                console.log(`[CORTEX] 🍖 Hunger Instinct (Food: ${payload.food})`);
                if (this.agent.bot.food < 18) {
                    const food = this.agent.bot.inventory.items().find(i => i.name.includes('steak') || i.name.includes('bread') || i.name.includes('apple') || i.name.includes('carrot'));
                    if (food) {
                        await this.agent.bot.equip(food, 'hand');
                        try {
                            await this.agent.bot.consume();
                        } catch (e) { }
                    }
                }
            }, false);
        }));

        this._unsubscribers.push(globalBus.subscribe(SIGNAL.THREAT_DETECTED, (payload) => {
            const utility = this.calculateUtility('combat_reflex', 95);
            this.schedule('combat_reflex', utility, async () => {
                // Only engage if not already in combat task
                if (this.activeTasks.has('combat_reflex')) return;

                if (this.agent.combatReflex && !this.agent.combatReflex.inCombat) {
                    const attacker = this.agent.combatReflex.findAttacker();
                    if (attacker) {
                        console.log(`[CORTEX] ⚔️ Attacker found: ${attacker.name || attacker.username}. Engaging!`);
                        this.agent.combatReflex.enterCombat(attacker);
                    }
                }
            }, false);
        }));
    }

    schedule(name, priority, taskFn, canRunParallel = false) {
        // Ensure we always have a dynamic utility if not provided
        const dynamicPriority = (name.includes('reflex')) ? priority : this.calculateUtility(name, priority);

        const task = {
            name,
            priority: dynamicPriority,
            taskFn,
            canRunParallel,
            timestamp: Date.now()
        };

        // RULE 1: Immediate Interrupt for Critical Utility
        if (dynamicPriority >= 100) {
            console.log(`[CORTEX] ⚡ CRITICAL INTERRUPT: ${name} (Score: ${dynamicPriority})`);
            this.interruptPhysicalTasks();
            this.execute(task);
            return;
        }

        // RULE 2: Insertion Sort by Priority (desc)
        const index = this.queue.findIndex(t => t.priority < dynamicPriority);
        if (index === -1) {
            this.queue.push(task);
        } else {
            this.queue.splice(index, 0, task);
        }

        this.processQueue();
    }

    /**
     * Cancel a scheduled or active task by name
     */
    cancel(name) {
        const queueIndex = this.queue.findIndex(t => t.name === name);
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1);
            console.log(`[CORTEX] 🗑️ Cancelled queued task: ${name}`);
            return true;
        }

        if (this.activeTasks.has(name)) {
            console.log(`[CORTEX] 🛑 Marked active task for stop: ${name}`);
            const task = this.activeTasks.get(name);
            task.cancelled = true;
            if (task.controller) task.controller.abort();
            return true;
        }
        return false;
    }

    interruptPhysicalTasks() {
        for (const [name, task] of this.activeTasks) {
            if (!task.canRunParallel) {
                if (this.agent.actions) this.agent.actions.stop();
                if (task.controller) task.controller.abort();
                task.cancelled = true;
                this.activeTasks.delete(name);
                console.log(`[CORTEX] 🛑 Interrupted task: ${name}`);
            }
        }
    }

    async processQueue() {
        if (this._processing || this.queue.length === 0) return;

        const nextTask = this.queue[0];

        // RULE 3: Concurrency Check
        const hasBlockingTask = Array.from(this.activeTasks.values()).some(t => !t.canRunParallel);

        if (hasBlockingTask && !nextTask.canRunParallel) {
            const blockingTask = Array.from(this.activeTasks.values()).find(t => !t.canRunParallel);
            if (blockingTask && nextTask.priority > blockingTask.priority) {
                console.log(`[CORTEX] ⬆️ Priority upgrade: ${nextTask.name} > ${blockingTask.name}`);
                this.interruptPhysicalTasks();
            } else {
                return; // Wait
            }
        }

        this._processing = true;
        this.queue.shift();
        await this.execute(nextTask);
        this._processing = false;
        this.processQueue();
    }

    async execute(task) {
        const controller = new AbortController();
        task.controller = controller;
        this.activeTasks.set(task.name, task);
        const startTime = Date.now();

        try {
            console.log(`[CORTEX] ▶️ Starting: ${task.name} (priority: ${task.priority})`);
            await task.taskFn({ signal: controller.signal });
            const duration = Date.now() - startTime;
            console.log(`[CORTEX] ✅ Completed: ${task.name} (${duration}ms)`);
        } catch (error) {
            if (error.name === 'AbortError' || task.cancelled) {
                console.warn(`[CORTEX] 🛑 Task '${task.name}' aborted.`);
                return;
            }
            console.error(`[CORTEX] ❌ Task '${task.name}' crashed:`, error.message);

            // v3.1: Emit Failure Signal for Evolution
            globalBus.emitSignal(SIGNAL.TASK_FAILED, {
                task: task.name,
                error: error.message,
                timestamp: Date.now()
            });
        } finally {
            this.activeTasks.delete(task.name);
        }
    }

    /**
     * Zombie Task Killer (Omniscient Watchdog)
     */
    checkZombieTasks(ttl = 60000) {
        const now = Date.now();
        for (const [name, task] of this.activeTasks) {
            if (now - task.timestamp > ttl) {
                console.warn(`[CORTEX] 🧟 ZOMBIE TASK DETECTED: ${name} (Age: ${(now - task.timestamp) / 1000}s)`);
                this.cancel(name);
                globalBus.emitSignal(SIGNAL.TASK_FAILED, { task: name, error: 'Zombie Timeout', fatal: true });
            }
        }
    }

    shutdown() {
        console.log('[CORTEX] 🛑 Shutting down TaskScheduler...');
        this.queue = [];
        this.activeTasks.clear();
        if (this._unsubscribers) this._unsubscribers.forEach(u => u());
        if (this.blackboard) this.blackboard.cleanup();
    }
}
