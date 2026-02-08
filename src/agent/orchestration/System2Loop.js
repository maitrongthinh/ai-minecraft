import { globalBus, SIGNAL } from '../core/SignalBus.js';
import { SurvivalAnalysis } from '../intelligence/SurvivalAnalysis.js';
import { PlannerAgent } from './PlannerAgent.js';
import { CriticAgent } from './CriticAgent.js';
import { ExecutorAgent } from './ExecutorAgent.js';

/**
 * System2Loop - Async Orchestration Controller
 * 
 * The "Slow Loop" of the Dual-Loop Architecture.
 * Coordinates PlannerAgent → CriticAgent → ExecutorAgent
 * Runs asynchronously in background while System 1 handles reflexes.
 * 
 * Features:
 * - Graceful Degradation: Falls back to Survival Mode on failure
 * - Human Override: Responds to SIGNAL.HUMAN_OVERRIDE
 * - Replanning: Auto-replans on execution failure
 */
export class System2Loop {
    constructor(agent) {
        this.agent = agent;

        // Initialize sub-agents
        this.planner = new PlannerAgent(agent);
        this.critic = new CriticAgent(agent);
        this.executor = new ExecutorAgent(agent);

        // State
        this.isRunning = false;
        this.currentGoal = null;
        this.currentPlan = null;
        this.failureCount = 0;
        this.maxFailures = 3;
        this.survivalMode = false;

        // Subscribe to signals
        this._setupSignals();

        console.log('[System2Loop] Initialized - Slow Loop ready');
    }

    /**
     * Setup signal handlers
     * @private
     */
    _setupSignals() {
        // Human Override - Priority 100
        globalBus.subscribe(SIGNAL.HUMAN_OVERRIDE, async (event) => {
            console.log('[System2Loop] HUMAN OVERRIDE received');
            await this.handleOverride(event.payload);
        });

        // React to critical threats
        globalBus.subscribe(SIGNAL.HEALTH_CRITICAL, () => {
            if (this.isRunning) {
                console.log('[System2Loop] Critical health - pausing plan');
                this._enterSurvivalMode('Critical health');
            }
        });
    }

    /**
     * Process a high-level goal
     * @param {string} goal - Natural language goal
     * @returns {Promise<{success: boolean, result: any}>}
     */
    async processGoal(goal) {
        console.log(`[System2Loop] ========== NEW GOAL ==========`);
        console.log(`[System2Loop] Goal: "${goal}"`);

        this.isRunning = true;
        this.currentGoal = goal;
        this.failureCount = 0;

        globalBus.emitSignal(SIGNAL.SYSTEM2_START, { goal });

        try {
            // Phase 1: Planning
            console.log('[System2Loop] Phase 1: Planning...');
            const planResult = await this.planner.decompose(goal);

            if (!planResult.success) {
                return this._handleFailure('Planning failed', planResult.reasoning);
            }

            this.currentPlan = planResult.plan;
            console.log(`[System2Loop] Plan created: ${this.currentPlan.length} steps`);

            // Phase 2: Critique
            console.log('[System2Loop] Phase 2: Safety Review...');
            const context = await this._getCurrentContext();
            const reviewResult = await this.critic.review(this.currentPlan, context);

            if (!reviewResult.approved) {
                // Try to apply suggestions and replan
                if (reviewResult.suggestions.length > 0) {
                    console.log('[System2Loop] Applying critic suggestions...');
                    const modifiedPlan = this._applySuggestions(this.currentPlan, reviewResult.suggestions);

                    // Re-review
                    const reReview = await this.critic.review(modifiedPlan, context);
                    if (!reReview.approved) {
                        return this._handleFailure('Safety review failed', reviewResult.summary);
                    }
                    this.currentPlan = modifiedPlan;
                } else {
                    return this._handleFailure('Safety review failed', reviewResult.summary);
                }
            }

            // Log any warnings
            if (reviewResult.issues.length > 0) {
                console.log(`[System2Loop] Warnings: ${reviewResult.issues.length}`);
                reviewResult.issues.forEach(i => console.log(`  - ${i.message}`));
            }

            // Phase 3: Execution
            console.log('[System2Loop] Phase 3: Executing plan...');
            const execResult = await this.executor.executePlan(this.currentPlan);

            if (!execResult.success) {
                // Attempt replan with intelligent retry check
                if (SurvivalAnalysis.shouldRetry(execResult.failed.map(f => f.error).join('; '), this.failureCount)) {
                    console.log('[System2Loop] Execution failed, attempting replan...');
                    return this._attemptReplan(goal, execResult.failed);
                }
                return this._handleFailure('Execution failed', `${execResult.failed.length} steps failed (Non-retryable or max retries exceeded)`);
            }

            // Success!
            console.log('[System2Loop] ========== GOAL COMPLETE ==========');
            this.isRunning = false;
            this.currentGoal = null;
            this.currentPlan = null;

            return {
                success: true,
                result: {
                    goal,
                    stepsCompleted: execResult.completed,
                    message: `Goal achieved: ${goal}`
                }
            };

        } catch (error) {
            console.error('[System2Loop] Unexpected error:', error);
            return this._handleFailure('System error', error.message);
        }
    }

    /**
     * Get current context for planning/review
     * @private
     */
    async _getCurrentContext() {
        if (this.agent.contextManager) {
            return await this.agent.contextManager.buildContext('planning');
        }
        return {};
    }

    /**
     * Apply critic suggestions to plan
     * @private
     */
    _applySuggestions(plan, suggestions) {
        let modifiedPlan = [...plan];

        for (const suggestion of suggestions) {
            if (suggestion.action === 'prepend' && suggestion.step) {
                modifiedPlan.unshift({
                    id: 0,
                    task: suggestion.step.task,
                    params: suggestion.step.params,
                    reason: suggestion.reason,
                    status: 'pending'
                });
            }
        }

        // Re-number steps
        modifiedPlan = modifiedPlan.map((step, idx) => ({
            ...step,
            id: idx + 1
        }));

        return modifiedPlan;
    }

    /**
     * Attempt to replan after failure
     * @private
     */
    async _attemptReplan(goal, failedSteps) {
        this.failureCount++;
        console.log(`[System2Loop] Replan attempt ${this.failureCount}/${this.maxFailures}`);

        const failureReason = failedSteps.map(f => f.error).join('; ');
        const replanResult = await this.planner.replan(goal, failedSteps, failureReason);

        if (!replanResult.success) {
            return this._handleFailure('Replan failed', replanResult.reasoning);
        }

        this.currentPlan = replanResult.plan;

        // Execute new plan
        const execResult = await this.executor.executePlan(this.currentPlan);

        // Intelligent Retry Check
        const execFailureReason = execResult.failed.map(f => f.error).join('; ');
        if (!execResult.success && SurvivalAnalysis.shouldRetry(execFailureReason, this.failureCount)) {
            return this._attemptReplan(goal, execResult.failed);
        }

        if (!execResult.success) {
            return this._handleFailure('Replan execution failed', 'Max retries exceeded or fatal error');
        }

        return {
            success: true,
            result: {
                goal,
                stepsCompleted: execResult.completed,
                message: `Goal achieved after ${this.failureCount} replans`
            }
        };
    }

    /**
     * Handle failure with graceful degradation
     * @private
     */
    _handleFailure(type, reason) {
        console.log(`[System2Loop] FAILURE: ${type} - ${reason}`);

        this.isRunning = false;
        this._enterSurvivalMode(reason);

        globalBus.emitSignal(SIGNAL.SYSTEM2_DEGRADED, {
            goal: this.currentGoal,
            reason: type,
            details: reason
        });

        return {
            success: false,
            result: {
                goal: this.currentGoal,
                error: `${type}: ${reason}`,
                survivalMode: true
            }
        };
    }

    /**
     * Enter Survival Mode - basic heuristic behavior
     * @private
     */
    _enterSurvivalMode(reason) {
        console.log(`[System2Loop] Entering Survival Mode: ${reason}`);
        this.survivalMode = true;

        // Schedule recovery attempt
        setTimeout(() => {
            this._attemptRecovery();
        }, 3000);
    }

    /**
     * Attempt to recover from Survival Mode
     * @private
     */
    async _attemptRecovery() {
        console.log('[System2Loop] Attempting recovery from Survival Mode...');

        // Dynamic Check using SurvivalAnalysis
        if (SurvivalAnalysis.isSafeToRecover(this.agent.bot)) {
            console.log('[System2Loop] Conditions safe - exiting Survival Mode');
            this.survivalMode = false;
            this.failureCount = 0;

            globalBus.emitSignal(SIGNAL.SYSTEM2_RECOVERED, {
                previousGoal: this.currentGoal
            });
        } else {
            const threat = SurvivalAnalysis.getThreatLevel(this.agent.bot);
            console.log(`[System2Loop] Conditions NOT safe (Threat: ${threat}) - staying in Survival Mode`);
            // Try again later with backoff or fixed interval
            setTimeout(() => this._attemptRecovery(), 5000);
        }
    }

    /**
     * Handle Human Override (Voice of God)
     * @param {object} payload - Override command
     */
    async handleOverride(payload) {
        console.log('[System2Loop] Processing Human Override...');

        // Abort current execution
        if (this.isRunning) {
            this.executor.abort();
            this.isRunning = false;
        }

        // Exit survival mode
        this.survivalMode = false;
        this.failureCount = 0;

        // If override has a new goal, process it
        if (payload.goal) {
            console.log(`[System2Loop] Override goal: "${payload.goal}"`);
            return await this.processGoal(payload.goal);
        }

        // If override has a direct command
        if (payload.command) {
            console.log(`[System2Loop] Override command: "${payload.command}"`);
            // Execute directly without planning
            return await this.executor._executeFallback({
                task: payload.command,
                params: payload.params || {}
            });
        }

        return { success: true, result: 'Override acknowledged' };
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            survivalMode: this.survivalMode,
            currentGoal: this.currentGoal,
            currentStep: this.executor.currentStep,
            totalSteps: this.currentPlan?.length || 0,
            failureCount: this.failureCount
        };
    }

    /**
     * Check if System 2 is busy
     */
    isBusy() {
        return this.isRunning;
    }
}
