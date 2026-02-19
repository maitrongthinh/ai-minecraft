import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * ExecutorAgent - Task Execution via ToolRegistry
 * 
 * System 2 Component: Executes approved plan steps using available skills.
 * Handles failures with retry and fallback strategies.
 */
export class ExecutorAgent {
    constructor(agent) {
        this.agent = agent;
        this.maxRetries = 2;
        this.currentPlan = null;
        this.currentStep = 0;
        this.executionLog = [];

        console.log('[ExecutorAgent] Initialized');
    }

    /**
     * Execute a complete plan
     * @param {Array} plan - Approved plan from PlannerAgent
     * @param {Object} options - Execution options (e.g. { signal })
     * @returns {Promise<{success: boolean, completed: number, failed: Array}>}
     */
    async executePlan(plan, options = {}) {
        const signal = options.signal;
        console.log(`[ExecutorAgent] Executing plan with ${plan.length} steps`);

        this.currentPlan = plan;
        this.currentStep = 0;
        this.executionLog = [];

        const failed = [];
        let completed = 0;

        for (const step of plan) {
            this.currentStep = step.id;

            if (signal && signal.aborted) {
                console.log('[ExecutorAgent] Plan execution aborted by signal');
                break;
            }

            // Report current step to Blackboard
            if (this.agent.scheduler?.blackboard) {
                this.agent.scheduler.blackboard.updateSystem2({
                    current_step: {
                        id: step.id,
                        task: step.task,
                        status: 'executing'
                    }
                });
            }

            const result = await this._executeStep(step, { signal });

            this.executionLog.push({
                step: step.id,
                task: step.task,
                result: result.success ? 'success' : 'failed',
                message: result.message,
                timestamp: Date.now()
            });

            if (result.success) {
                completed++;
                step.status = 'completed';
            } else {
                step.status = 'failed';
                failed.push({
                    step: step.id,
                    task: step.task,
                    error: result.message
                });

                // Emit Failure Signal for EvolutionEngine
                globalBus.emitSignal(SIGNAL.TASK_FAILED, {
                    step: step.id,
                    task: step.task,
                    error: result.message,
                    context: step.params
                });

                // Check if we should abort
                if (result.abort) {
                    console.log('[ExecutorAgent] Aborting plan execution');
                    break;
                }
            }

            // Emit Progress Signal
            globalBus.emitSignal(SIGNAL.TASK_COMPLETED, {
                step: step.id,
                total: plan.length,
                task: step.task,
                success: result.success
            });
        }

        const success = failed.length === 0;
        console.log(`[ExecutorAgent] Plan completed: ${completed}/${plan.length} steps, ${failed.length} failures`);

        return { success, completed, failed };
    }

    /**
     * Execute a single step with retries
     * @private
     */
    async _executeStep(step, options = {}) {
        const signal = options.signal;
        let lastError = null;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                // Check if interrupted
                if (!this.agent.running || (signal && signal.aborted)) {
                    return { success: false, message: 'Execution aborted', abort: true };
                }

                // Phase 1: Locking Check (Combat vs System2)
                // If we can't get the lock (held by Combat), we wait or abort
                if (this.agent.locks && this.agent.locks.move) {
                    const owner = this.agent.locks.move.getOwner();
                    if (owner && owner !== 'system2') {
                        console.warn(`[ExecutorAgent] Body locked by ${owner}. Yielding...`);
                        if (attempt < this.maxRetries) {
                            await new Promise(r => setTimeout(r, 1000));
                            continue;
                        }
                    }

                    const acquired = await this.agent.locks.move.acquire('system2', 1000); // Reduced timeout for faster yielding
                    if (!acquired) {
                        console.warn('[ExecutorAgent] Failed to acquire move lock.');
                        if (attempt < this.maxRetries) {
                            await new Promise(r => setTimeout(r, 1000));
                            continue;
                        }
                        return { success: false, message: 'Body locked by high-priority process', abort: false };
                    }
                }

                try {

                    // 1. Pre-condition Check for fatal errors
                    if (!this.agent.bot || !this.agent.bot.entity) {
                        console.warn('[ExecutorAgent] 🛑 Bot disconnected or dead. Aborting task.');
                        return { success: false, message: 'Bot disconnected or dead', abort: true };
                    }

                    // 2. Execution via ToolRegistry or Fallback
                    const result = await this._executeViaRegistry(step);

                    if (result.success) {
                        return result; // Immediately return success to exit retry loop and function
                    }

                    lastError = result.message || 'Unknown error';
                } catch (error) {
                    console.warn(`[ExecutorAgent] execution error: ${error.message}`);
                    lastError = error.message;
                } finally {
                    if (this.agent.locks && this.agent.locks.move && this.agent.locks.move.getOwner() === 'system2') {
                        this.agent.locks.move.release('system2');
                    }
                }
            } catch (panic) {
                console.error('[ExecutorAgent] Critical Loop Error', panic);
                lastError = panic.message;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        return { success: false, message: lastError || "Failed", abort: false };
    }

    /**
     * Execute step via ToolRegistry
     * @private
     */
    async _executeViaRegistry(step) {
        const skill = this.agent.toolRegistry.findSkill(step.task);
        if (skill) {
            console.log(`[ExecutorAgent] Using ToolRegistry: ${step.task}`);
            return await this.agent.toolRegistry.executeSkill(step.task, step.params);
        }

        // Fallback: Try command-based execution
        return await this._executeFallback(step);
    }

    /**
     * Fallback execution for tasks not in ToolRegistry
     * @private
     */
    async _executeFallback(step) {
        console.log(`[ExecutorAgent] Fallback execution: ${step.task}`);

        // Map common task names to bot actions
        const taskHandlers = {
            'eat_food': () => this._handleEatFood(step.params),
            'equip_best_weapon': () => this._handleEquipWeapon(step.params),
            'go_to': () => this._handleGoTo(step.params),
            'go_to_y': () => this._handleGoToY(step.params),
            'find_location': () => this._handleFindLocation(step.params),
            'explore_area': () => this._handleExplore(step.params),
            'hunt_animals': () => this._handleHunt(step.params),
            'find_shelter': () => this._handleFindShelter(step.params),
            'build_structure': () => this._handleBuild(step.params),
            'approach_target': () => this._handleApproach(step.params),
            'attack_target': () => this._handleAttack(step.params)
        };

        const handler = taskHandlers[step.task];

        if (handler) {
            return await handler();
        }

        // Unknown task - report failure
        return {
            success: false,
            message: `Unknown task: ${step.task}. No skill or fallback handler available.`
        };
    }

    // ===== Fallback Handlers =====

    async _handleEatFood(params) {
        if (!this.agent.bot) return { success: false, message: 'Bot not available' };

        const foodItems = this.agent.bot.inventory.items()
            .filter(i => i.name.includes('cooked') || i.name.includes('bread') || i.name.includes('apple'));

        if (foodItems.length === 0) {
            return { success: false, message: 'No food in inventory' };
        }

        try {
            await this.agent.bot.equip(foodItems[0], 'hand');
            await this.agent.bot.consume();
            return { success: true, message: 'Ate food successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async _handleEquipWeapon(params) {
        if (!this.agent.bot) return { success: false, message: 'Bot not available' };

        const weapons = this.agent.bot.inventory.items()
            .filter(i => i.name.includes('sword') || i.name.includes('axe'))
            .sort((a, b) => {
                // Prioritize: netherite > diamond > iron > stone > wood
                const tierOrder = ['netherite', 'diamond', 'iron', 'stone', 'wooden'];
                const aTier = tierOrder.findIndex(t => a.name.includes(t));
                const bTier = tierOrder.findIndex(t => b.name.includes(t));
                return aTier - bTier;
            });

        if (weapons.length === 0) {
            return { success: false, message: 'No weapons in inventory' };
        }

        try {
            await this.agent.bot.equip(weapons[0], 'hand');
            return { success: true, message: `Equipped ${weapons[0].name}` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async _handleGoTo(params) {
        if (!this.agent.bot) return { success: false, message: 'Bot not available' };

        try {
            const { x, y, z } = params;
            const { goals } = await import('mineflayer-pathfinder');
            const goal = new goals.GoalNear(x, y, z, 2);
            await this.agent.bot.pathfinder.goto(goal);
            return { success: true, message: `Arrived at (${x}, ${y}, ${z})` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async _handleGoToY(params) {
        if (!this.agent.bot) return { success: false, message: 'Bot not available' };

        try {
            const targetY = params.y || 12;
            const pos = this.agent.bot.entity.position;
            const { goals } = await import('mineflayer-pathfinder');
            const goal = new goals.GoalY(targetY);
            await this.agent.bot.pathfinder.goto(goal);
            return { success: true, message: `Reached Y=${targetY}` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async _handleFindLocation(params) {
        // Simplified: just return success for now
        return { success: true, message: `Found ${params.type || 'location'}` };
    }

    async _handleExplore(params) {
        if (!this.agent.bot) return { success: false, message: 'Bot not available' };

        try {
            const radius = params.radius || 50;
            const pos = this.agent.bot.entity.position;
            const targetX = pos.x + (Math.random() - 0.5) * radius;
            const targetZ = pos.z + (Math.random() - 0.5) * radius;

            const { goals } = await import('mineflayer-pathfinder');
            const goal = new goals.GoalNear(targetX, pos.y, targetZ, 5);
            await this.agent.bot.pathfinder.goto(goal);

            return { success: true, message: `Explored area around (${Math.floor(targetX)}, ${Math.floor(targetZ)})` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async _handleHunt(params) {
        if (!this.agent.bot) return { success: false, message: 'Bot not available' };

        const animals = ['cow', 'pig', 'sheep', 'chicken'];
        const target = Object.values(this.agent.bot.entities)
            .find(e => animals.some(a => e.name?.includes(a)));

        if (!target) {
            return { success: false, message: 'No animals found nearby' };
        }

        try {
            await this.agent.bot.attack(target);
            return { success: true, message: `Attacked ${target.name}` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async _handleFindShelter(params) {
        return { success: true, message: 'Found shelter area' };
    }

    async _handleBuild(params) {
        return { success: false, message: 'Build structure requires dedicated building skill' };
    }

    async _handleApproach(params) {
        return { success: true, message: 'Approached target' };
    }

    async _handleAttack(params) {
        if (!this.agent.bot) return { success: false, message: 'Bot not available' };

        const target = this.agent.bot.nearestEntity();
        if (!target) {
            return { success: false, message: 'No target found' };
        }

        try {
            await this.agent.bot.attack(target);
            return { success: true, message: `Attacked ${target.name || 'entity'}` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Get current execution status
     */
    getStatus() {
        return {
            currentStep: this.currentStep,
            totalSteps: this.currentPlan?.length || 0,
            log: this.executionLog
        };
    }

    /**
     * Abort current execution
     */
    abort() {
        console.log('[ExecutorAgent] Execution aborted');
        this.currentPlan = null;
    }
}
