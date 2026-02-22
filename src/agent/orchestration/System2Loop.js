import { globalBus, SIGNAL } from '../core/SignalBus.js';
import settings from '../../../settings.js';
import { SurvivalAnalysis } from '../intelligence/SurvivalAnalysis.js';
import { PlannerAgent } from './PlannerAgent.js';
import { CriticAgent } from './CriticAgent.js';
import { ExecutorAgent } from './ExecutorAgent.js';
import { sendSystem2TraceToServer } from '../mindserver_proxy.js';

const CognitiveState = {
    IDLE: 'idle',
    PLANNING: 'planning',
    VALIDATING: 'validating',
    EXECUTING: 'executing',
    EVALUATING: 'evaluating',
    DEGRADED: 'degraded'
};

/**
 * System2Loop - Async Orchestration Controller
 * 
 * The "Slow Loop" of the Dual-Loop Architecture.
 * Coordinates PlannerAgent → CriticAgent → ExecutorAgent
 * Runs asynchronously in background while System 1 handles reflexes.
 * 
 * Features:
 * - Cognitive State Machine: Formal transitions (IDLE, PLANNING, VALIDATING, EXECUTING, EVALUATING)
 * - Graceful Degradation: Falls back to Survival Mode on failure
 * - Human Override: Responds to SIGNAL.HUMAN_OVERRIDE
 * - Replanning: Auto-replans on execution failure
 */
export class System2Loop {
    constructor(agent) {
        this.agent = agent;

        // CRITICAL: Brain may not be initialized yet - defer sub-agent creation
        this.brain = agent.brain;
        this.initialized = false;
        this.state = CognitiveState.IDLE;

        // Initialize sub-agents
        this.planner = new PlannerAgent(agent);
        this.critic = new CriticAgent(agent);
        this.executor = new ExecutorAgent(agent);

        // State
        this.currentGoal = null;
        this.currentPlan = null;
        this.failureCount = 0;

        // Phase 3: Profile-Driven Constants
        const profile = agent.config?.profile;
        this.maxFailures = profile?.intelligence?.max_retries || settings.tactical?.max_retries || 3;
        this.recoveryInterval = profile?.timeouts?.recovery_interval || settings.tactical?.recovery_interval || 5000;

        this.survivalMode = false;
        this.abortController = null;
        this.recoveryTimer = null;

        // Subscribe to signals
        this._setupSignals();

        console.log('[System2Loop] Initialized - Slow Loop ready');
    }

    _trace(phase, stage, message, meta = {}) {
        const trace = {
            phase,
            stage,
            message,
            meta,
            timestamp: Date.now()
        };
        sendSystem2TraceToServer(this.agent?.name || 'unknown', trace);
        return trace;
    }

    _setState(newState) {
        if (this.state === newState) return;

        const oldState = this.state;
        this.state = newState;
        console.log(`[System2Loop] State transition: ${oldState} -> ${newState}`);
        this._trace('state_change', newState, `Transitioned from ${oldState} to ${newState}`);

        // Sync with Blackboard
        if (this.agent.scheduler?.blackboard) {
            this.agent.scheduler.blackboard.updateSystem2({
                plan_phase: newState
            });
        }

        globalBus.emitSignal(SIGNAL.SYSTEM2_STATE_CHANGE, {
            from: oldState,
            to: newState,
            goal: this.currentGoal
        });
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
            if (this.state !== CognitiveState.IDLE && this.state !== CognitiveState.DEGRADED) {
                console.log('[System2Loop] Critical health - pausing plan');
                this._enterSurvivalMode('Critical health');
            }
        });

        // Auto-Resume on Recovery (Fix Task Amnesia)
        globalBus.subscribe(SIGNAL.SYSTEM2_RECOVERED, async (event) => {
            const { previousGoal } = event.payload;
            if (previousGoal && this.state === CognitiveState.IDLE) {
                console.log(`[System2Loop] 🔄 Resuming interrupted goal: "${previousGoal}"`);
                // Small delay to ensure state stability
                await new Promise(r => setTimeout(r, 1000));
                await this.processGoal(previousGoal);
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
        this._trace('lifecycle', 'goal_received', `New goal: ${goal}`);

        this._setState(CognitiveState.PLANNING);
        this.currentGoal = goal;
        this.failureCount = 0;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        // Initial Blackboard setup
        if (this.agent.scheduler?.blackboard) {
            this.agent.scheduler.blackboard.updateSystem2({
                active_goal: goal,
                current_step: null,
                last_failure: null
            });
        }

        globalBus.emitSignal(SIGNAL.SYSTEM2_START, { goal });
        this._trace('lifecycle', 'start', 'System2 loop started', { goal });

        try {
            // Phase 1: Planning
            console.log('[System2Loop] Phase 1: Planning...');
            this._trace('plan', 'start', 'Planner decomposition started');
            const planResult = await this.planner.decompose(goal);

            if (!planResult.success || signal.aborted) {
                if (signal.aborted) throw new Error('AbortError');
                this._trace('plan', 'failed', 'Planner decomposition failed', { reason: planResult.reasoning });
                return this._handleFailure('Planning failed', planResult.reasoning);
            }

            this.currentPlan = planResult.plan;
            console.log(`[System2Loop] Plan created: ${this.currentPlan.length} steps`);
            this._trace('plan', 'ready', `Plan created with ${this.currentPlan.length} steps`, {
                steps: this.currentPlan.map(s => ({
                    id: s.id,
                    task: s.task,
                    reason: s.reason
                }))
            });

            // Phase 2: Validating (Critique)
            this._setState(CognitiveState.VALIDATING);
            console.log('[System2Loop] Phase 2: Safety Review...');
            this._trace('critic', 'start', 'Critic safety review started');
            const context = await this._getCurrentContext();
            const reviewResult = await this.critic.review(this.currentPlan, context);

            if (!reviewResult.approved) {
                // Try to apply suggestions and replan
                if (reviewResult.suggestions.length > 0) {
                    console.log('[System2Loop] Applying critic suggestions...');
                    this._trace('critic', 'needs_changes', 'Critic requested plan changes', {
                        summary: reviewResult.summary,
                        suggestions: reviewResult.suggestions
                    });
                    const modifiedPlan = this._applySuggestions(this.currentPlan, reviewResult.suggestions);

                    // Re-review
                    const reReview = await this.critic.review(modifiedPlan, context);
                    if (!reReview.approved) {
                        this._trace('critic', 'failed', 'Critic rejected modified plan', {
                            summary: reReview.summary || reviewResult.summary
                        });
                        return this._handleFailure('Safety review failed', reviewResult.summary);
                    }
                    this.currentPlan = modifiedPlan;
                    this._trace('critic', 'approved', 'Critic approved modified plan', {
                        steps: this.currentPlan.length
                    });
                } else {
                    this._trace('critic', 'failed', 'Critic rejected plan with no suggestions', {
                        summary: reviewResult.summary
                    });
                    return this._handleFailure('Safety review failed', reviewResult.summary);
                }
            } else {
                this._trace('critic', 'approved', 'Critic approved plan', {
                    issues: reviewResult.issues?.length || 0
                });
            }

            // Phase 3: Executing
            this._setState(CognitiveState.EXECUTING);
            console.log('[System2Loop] Phase 3: Executing plan...');
            this._trace('execute', 'start', 'Execution started', { steps: this.currentPlan.length });
            if (signal.aborted) throw new Error('AbortError');

            const execResult = await this.executor.executePlan(this.currentPlan, { signal });

            if (!execResult.success) {
                this._trace('execute', 'failed', 'Execution failed', {
                    failed: execResult.failed
                });
                // Attempt replan with intelligent retry check (Phase 13: Handle Stalls)
                const failureStr = execResult.failed.map(f => f.error).join('; ');
                if (failureStr.includes('STALLED')) {
                    console.error('[System2Loop] 🚨 Stall detected in execution. Forcing immediate replan with survival bias.');
                    return this._attemptReplan(goal, execResult.failed, 'Physical movement stall / Pathfinding failure');
                }

                if (SurvivalAnalysis.shouldRetry(failureStr, this.failureCount)) {
                    console.log('[System2Loop] Execution failed, attempting replan...');
                    this._trace('replan', 'start', 'Execution failed, starting replan', {
                        failed: execResult.failed
                    });
                    return this._attemptReplan(goal, execResult.failed);
                }
                return this._handleFailure('Execution failed', `${execResult.failed.length} steps failed (Non-retryable or max retries exceeded)`);
            }

            // Phase 4: Evaluating (Post-execution reflection)
            this._setState(CognitiveState.EVALUATING);
            console.log('[System2Loop] Phase 4: Evaluating results...');
            const evaluation = await this._evaluateResult(goal, execResult);
            this._trace('evaluation', 'complete', 'Post-goal evaluation complete', { evaluation });

            // Success!
            console.log('[System2Loop] ========== GOAL COMPLETE ==========');
            this._setState(CognitiveState.IDLE);
            if (this.agent.scheduler?.blackboard) {
                this.agent.scheduler.blackboard.updateSystem2({
                    active_goal: null,
                    current_step: null
                });
            }
            this._trace('lifecycle', 'complete', 'Goal completed successfully', {
                goal,
                completed: execResult.completed,
                evaluation
            });
            this.currentGoal = null;
            this.currentPlan = null;

            return {
                success: true,
                result: {
                    goal,
                    stepsCompleted: execResult.completed,
                    evaluation,
                    message: `Goal achieved: ${goal}`
                }
            };

        } catch (error) {
            if (error.message === 'AbortError') {
                console.log('[System2Loop] Goal execution aborted by user.');
                this._trace('lifecycle', 'aborted', 'Goal execution aborted by user');
                this._setState(CognitiveState.IDLE);
                return { success: false, result: 'Aborted' };
            }
            console.error('[System2Loop] Unexpected error:', error);
            this._trace('lifecycle', 'error', 'Unexpected System2 error', { error: error.message });
            return this._handleFailure('System error', error.message);
        }
    }

    /**
     * Placeholder for post-execution evaluation logic
     * @private
     */
    async _evaluateResult(goal, result) {
        // In the future, this would call an LLM to reflect on the success and update long-term knowledge
        return {
            status: 'success',
            reflection: `Successfully completed ${result.completed} steps for goal "${goal}".`
        };
    }


    /**
     * Get current context for planning/review
     * @private
     */
    async _getCurrentContext() {
        const blackboard = this.agent.scheduler?.blackboard;
        if (!blackboard) {
            console.warn('[System2Loop] ⚠️ Blackboard not available for context fetching.');
            return {
                inventory: {},
                vitals: {},
                perception: {}
            };
        }

        return {
            inventory: blackboard.get('inventory_cache') || {},
            vitals: blackboard.get('self_state') || {},
            perception: blackboard.get('perception_snapshot') || {}
        };
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
        this._trace('replan', 'attempt', 'Replan attempt started', {
            attempt: this.failureCount,
            maxFailures: this.maxFailures,
            failedSteps
        });

        const failureReason = failedSteps.map(f => f.error).join('; ');
        const replanResult = await this.planner.replan(goal, failedSteps, failureReason);

        if (!replanResult.success) {
            this._trace('replan', 'failed', 'Replan generation failed', { reason: replanResult.reasoning });
            return this._handleFailure('Replan failed', replanResult.reasoning);
        }

        this.currentPlan = replanResult.plan;
        this._trace('replan', 'ready', 'Replan generated', { steps: this.currentPlan.length });

        // Execute new plan
        const execResult = await this.executor.executePlan(this.currentPlan);

        // Intelligent Retry Check
        const execFailureReason = execResult.failed.map(f => f.error).join('; ');
        if (!execResult.success && SurvivalAnalysis.shouldRetry(execFailureReason, this.failureCount)) {
            this._trace('replan', 'retry', 'Replan execution failed, retrying', {
                failed: execResult.failed
            });
            return this._attemptReplan(goal, execResult.failed);
        }

        if (!execResult.success) {
            this._trace('replan', 'failed', 'Replan execution failed permanently', {
                failed: execResult.failed
            });
            return this._handleFailure('Replan execution failed', 'Max retries exceeded or fatal error');
        }

        this._trace('replan', 'complete', 'Replan execution succeeded', {
            completed: execResult.completed
        });

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
        this._trace('lifecycle', 'failed', `${type}: ${reason}`);

        this._setState(CognitiveState.DEGRADED);
        if (this.agent.scheduler?.blackboard) {
            this.agent.scheduler.blackboard.updateSystem2({
                last_failure: reason
            });
        }
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
        this._trace('survival', 'enter', 'Entering survival mode', { reason });
        this.survivalMode = true;

        // Schedule recovery attempt with configurable interval
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.recoveryTimer = setTimeout(() => {
            this._attemptRecovery();
        }, this.recoveryInterval);
    }

    /**
     * Attempt to recover from Survival Mode
     * @private
     */
    async _attemptRecovery() {
        console.log('[System2Loop] Attempting recovery from Survival Mode...');
        this._trace('survival', 'recovery_attempt', 'Attempting survival recovery');

        // Dynamic Check using SurvivalAnalysis
        if (SurvivalAnalysis.isSafeToRecover(this.agent.bot)) {
            console.log('[System2Loop] Conditions safe - exiting Survival Mode');
            this.survivalMode = false;
            this.failureCount = 0;
            this._trace('survival', 'recovered', 'Recovered from survival mode');

            globalBus.emitSignal(SIGNAL.SYSTEM2_RECOVERED, {
                previousGoal: this.currentGoal
            });
        } else {
            const threat = SurvivalAnalysis.getThreatLevel(this.agent.bot);
            console.log(`[System2Loop] Conditions NOT safe (Threat: ${threat}) - staying in Survival Mode`);
            this._trace('survival', 'blocked', 'Recovery blocked by threat', { threat });
            // Try again later with configurable interval
            if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
            this.recoveryTimer = setTimeout(() => this._attemptRecovery(), this.recoveryInterval);
        }
    }

    /**
     * Handle Human Override (Voice of God)
     * @param {object} payload - Override command
     */
    async handleOverride(payload) {
        console.log('[System2Loop] Processing Human Override...');
        this._trace('override', 'received', 'Human override received', { payload });

        // Abort current execution
        if (this.state !== CognitiveState.IDLE && this.abortController) {
            this.abortController.abort();
        }

        // Reset state
        this._setState(CognitiveState.IDLE);
        this.failureCount = 0;
        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
            this.recoveryTimer = null;
        }

        // If override has a new goal, process it
        if (payload.goal) {
            console.log(`[System2Loop] Override goal: "${payload.goal}"`);
            this._trace('override', 'goal', `Override goal: ${payload.goal}`);
            return await this.processGoal(payload.goal);
        }

        // If override has a direct command
        if (payload.command) {
            console.log(`[System2Loop] Override command: "${payload.command}"`);
            this._trace('override', 'command', `Override command: ${payload.command}`);
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
            state: this.state,
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
        return this.state !== CognitiveState.IDLE;
    }

    /**
     * Internal trace for telemetry
     * @private
     */
    _trace(type, event, message, data = {}) {
        const trace = {
            timestamp: Date.now(),
            type,
            event,
            message,
            state: this.state,
            goal: this.currentGoal,
            data
        };

        // Emit for observability
        globalBus.emitSignal(`system2.trace.${type}`, trace);

        // Send to mindserver if available
        sendSystem2TraceToServer(this.agent.name, trace);

        if (settings.debug_mode) {
            console.log(`[System2Trace] [${type.toUpperCase()}] ${event}: ${message}`);
        }
    }

    /**
     * Start System 2 with a primary goal
     * @param {string} goal - Primary goal to achieve
     */
    async start(goal) {
        if (this.isRunning) {
            console.log('[System2Loop] Already running, queuing goal');
            return { success: false, result: 'System2Loop already running' };
        }

        console.log(`[System2Loop] Starting with goal: "${goal}"`);
        return await this.processGoal(goal);
    }

    /**
     * Stop System 2 gracefully
     */
    stop() {
        if (this.isRunning && this.abortController) {
            console.log('[System2Loop] Stopping System 2 loop');
            this.abortController.abort();
        }
        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
            this.recoveryTimer = null;
        }
        this.isRunning = false;
        this.survivalMode = false;
    }
}
