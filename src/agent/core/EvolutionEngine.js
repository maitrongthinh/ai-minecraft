/**
 * EvolutionEngine.js - The Self-Correction Loop
 * 
 * Phase 2: Evolution Engine
 * 
 * Converts failures into new skills. Bot never makes the same mistake twice.
 * 
 * 4-Step Evolution Process:
 * 1. Detection  - Capture full context when task fails
 * 2. Analysis   - Check if similar error was solved before (Cognee)
 * 3. Sanitization - Validate AI-generated code in sandbox
 * 4. Hot-Swap   - Load new skill into memory without restart
 */

import { CodeSandbox } from './CodeSandbox.js';
import { CODER_SYSTEM_PROMPT } from '../../prompts/CoderPrompt.js';
import { globalBus, SIGNAL } from './SignalBus.js'; // Phase 4.5: MindOS Integration

// Error signature for deduplication
function hashError(error, intent) {
    const normalized = `${intent}:${error.replace(/[0-9]+/g, 'N')}`;
    return Buffer.from(normalized).toString('base64').slice(0, 16);
}

export class EvolutionEngine {
    constructor(agent) {
        this.agent = agent;
        this.sandbox = new CodeSandbox({ timeout: 100 });

        // Track pending fixes to avoid duplicate requests
        this.pendingFixes = new Map();

        // Phase 4.5: Auto-Correction Listener
        globalBus.subscribe(SIGNAL.TASK_FAILED, async (event) => {
            console.log('[EvolutionEngine] 👂 Heard TASK_FAILED. Analyzing...');
            const snapshot = this.captureSnapshot(event.payload.task, event.payload.error);
            await this.requestFix(snapshot);
        });

        // Phase 6: System 2 Integration - Listen to degraded signals
        globalBus.subscribe(SIGNAL.SYSTEM2_DEGRADED, async (event) => {
            console.log('[EvolutionEngine] 👂 System 2 DEGRADED. Recording failure pattern...');
            await this._trackSystem2Failure(event.payload);
        });

        // Phase 6: Listen to skill execution failures for improvement
        globalBus.subscribe(SIGNAL.SKILL_FAILED, async (event) => {
            console.log('[EvolutionEngine] 👂 Skill FAILED. Analyzing for evolution...');
            const snapshot = this.captureSnapshot(
                { name: event.payload.skillName || event.payload.name, params: event.payload.params },
                new Error(event.payload.error)
            );
            await this.requestFix(snapshot);
        });

        // Track error history to avoid re-generating for same errors
        this.errorHistory = new Map();

        // Phase 6: Track System2 failures for pattern analysis
        this.system2Failures = [];
        this.maxFailureHistory = 50;

        // Stats for monitoring
        this.stats = {
            capturedErrors: 0,
            generatedSkills: 0,
            failedGenerations: 0,
            usedCachedSkills: 0,
            registeredToToolRegistry: 0,
            system2FailuresTracked: 0
        };

        console.log('[EvolutionEngine] ⚡ Initialized - Ready to evolve (Phase 6: ToolRegistry + System2)');
    }

    /**
     * Step 1: Capture failure context (Black Box)
     * Called by TaskScheduler when a task fails
     * 
     * @param {Object} task - Failed task object
     * @param {Error} error - The error that occurred
     * @returns {Object} Snapshot of failure context
     */
    captureSnapshot(task, error) {
        const bot = this.agent.bot;
        const errorMessage = typeof error === 'string' ? error : (error?.message || 'Unknown error');
        const errorStack = typeof error === 'string' ? [] : (error?.stack?.split('\n').slice(0, 5) || []);

        const snapshot = {
            // Error info
            taskName: task?.name || 'unknown_task',
            errorMessage,
            errorStack,
            errorHash: hashError(errorMessage, task?.name || ''),

            // Bot state
            position: bot?.entity?.position ? {
                x: Math.floor(bot.entity.position.x),
                y: Math.floor(bot.entity.position.y),
                z: Math.floor(bot.entity.position.z)
            } : null,
            health: bot?.health || 0,
            food: bot?.food || 0,

            // Inventory summary
            inventory: this._getInventorySummary(),

            // Surroundings (3 block radius)
            surroundings: this._getSurroundings(),

            // Timestamp
            timestamp: Date.now()
        };

        this.stats.capturedErrors++;
        console.log(`[EvolutionEngine] 📸 Captured snapshot for: ${snapshot.taskName}`);

        return snapshot;
    }

    /**
     * Get inventory summary (items and counts)
     */
    _getInventorySummary() {
        try {
            const items = this.agent.bot?.inventory?.items() || [];
            const summary = {};

            for (const item of items) {
                if (item?.name) {
                    summary[item.name] = (summary[item.name] || 0) + item.count;
                }
            }

            return summary;
        } catch (e) {
            return {};
        }
    }

    /**
     * Get nearby blocks (3 block radius)
     */
    _getSurroundings() {
        try {
            const bot = this.agent.bot;
            if (!bot?.entity?.position) return [];

            const pos = bot.entity.position;
            const blocks = new Set();

            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        const block = bot.blockAt(pos.offset(dx, dy, dz));
                        if (block && block.name !== 'air') {
                            blocks.add(block.name);
                        }
                    }
                }
            }

            return Array.from(blocks).slice(0, 10); // Top 10 unique blocks
        } catch (e) {
            return [];
        }
    }

    /**
     * Step 2: Request fix from AI (Analysis & Generation)
     * 
     * @param {Object} snapshot - Failure context from captureSnapshot
     * @returns {Promise<Object>} Result of fix attempt
     */
    async requestFix(snapshot) {
        const { errorHash, taskName } = snapshot;

        // Check if we already have a fix for this error
        if (this.errorHistory.has(errorHash)) {
            const existingSkill = this.errorHistory.get(errorHash);
            console.log(`[EvolutionEngine] ♻️ Using cached fix: ${existingSkill}`);
            this.stats.usedCachedSkills++;
            return { success: true, skillName: existingSkill, cached: true };
        }

        // Check if we're already processing this error
        if (this.pendingFixes.has(errorHash)) {
            console.log(`[EvolutionEngine] ⏳ Already processing: ${taskName}`);
            return { success: false, reason: 'already_processing' };
        }

        // Mark as pending
        this.pendingFixes.set(errorHash, Date.now());

        try {
            // Generate skill name from task
            const skillName = this._generateSkillName(taskName, snapshot.errorMessage);

            // Build prompt for AI
            const prompt = this._buildGenerationPrompt(snapshot);

            // Call DualBrain (Slow Loop) to generate code
            let generatedCode = null;

            if (this.agent.brain) {
                generatedCode = await this.agent.brain.generateReflexCode(prompt);
            } else if (this.agent.prompter) {
                // Fallback to prompter
                generatedCode = await this.agent.prompter.promptCoding([
                    { role: 'system', content: CODER_SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ]);
            }

            if (!generatedCode) {
                this.stats.failedGenerations++;
                return { success: false, reason: 'no_code_generated' };
            }

            // Extract code block
            const code = this._extractCodeBlock(generatedCode);
            if (!code) {
                this.stats.failedGenerations++;
                return { success: false, reason: 'no_code_block' };
            }

            // Step 3: Validate in sandbox
            const validation = await this.validateCode(code);
            if (!validation.valid) {
                this.stats.failedGenerations++;
                console.warn(`[EvolutionEngine] ❌ Code validation failed:`, validation.checks);
                return { success: false, reason: 'validation_failed', details: validation };
            }

            // Step 4: Deploy skill
            const deployed = await this.deploySkill(skillName, code, snapshot);
            if (!deployed) {
                this.stats.failedGenerations++;
                return { success: false, reason: 'deploy_failed' };
            }

            // Remember this fix for future
            this.errorHistory.set(errorHash, skillName);
            this.stats.generatedSkills++;

            console.log(`[EvolutionEngine] ✅ Evolved new skill: ${skillName}`);
            return { success: true, skillName, code };

        } catch (e) {
            console.error(`[EvolutionEngine] Error in requestFix:`, e.message);
            this.stats.failedGenerations++;
            return { success: false, reason: 'exception', error: e.message };
        } finally {
            this.pendingFixes.delete(errorHash);
        }
    }

    /**
     * Generate skill name from task and error
     */
    _generateSkillName(taskName, errorMessage) {
        // Clean and format
        let name = taskName
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 30);

        // Add error context
        if (errorMessage.includes('path')) name += '_pathfix';
        else if (errorMessage.includes('inventory')) name += '_itemfix';
        else if (errorMessage.includes('health')) name += '_safefix';
        else name += '_fix';

        return name;
    }

    /**
     * Build prompt for AI code generation
     */
    _buildGenerationPrompt(snapshot) {
        return `
FAILURE CONTEXT:
- Task: ${snapshot.taskName}
- Error: ${snapshot.errorMessage}
- Position: ${JSON.stringify(snapshot.position)}
- Health: ${snapshot.health}/20
- Inventory: ${JSON.stringify(snapshot.inventory)}
- Nearby blocks: ${snapshot.surroundings.join(', ')}

MISSION:
Write a JavaScript function that handles this situation and prevents this error.
The function should be named based on the task and be reusable.

CONSTRAINTS:
- Function signature: async function skillName(bot) { ... }
- Use only mineflayer API
- Must complete within 30 seconds
- Handle edge cases gracefully
`;
    }

    /**
     * Extract code block from AI response
     */
    _extractCodeBlock(response) {
        if (!response) return null;

        const match = response.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
        if (match) return match[1].trim();

        // Fallback: if response looks like code
        if (response.includes('async function') || response.includes('function ')) {
            return response.trim();
        }

        return null;
    }

    /**
     * Step 3: Validate code in sandbox
     * 
     * @param {string} code - Code to validate
     * @returns {Object} Validation result
     */
    async validateCode(code) {
        return this.sandbox.validate(code);
    }

    /**
     * Step 4: Deploy skill to SkillLibrary (Hot-Swap)
     * 
     * @param {string} name - Skill name
     * @param {string} code - Validated code
     * @param {Object} snapshot - Original failure context
     * @returns {boolean} Success
     */
    async deploySkill(name, code, snapshot) {
        try {
            const skillLibrary = this.agent.skillLibrary;
            if (!skillLibrary) {
                console.warn('[EvolutionEngine] No SkillLibrary available');
                return false;
            }

            const description = `Auto-generated fix for: ${snapshot.errorMessage?.slice(0, 50) || 'unknown'}`;
            const tags = ['generated', 'evolution', snapshot.taskName || 'unknown'];

            // Use hot-swap if available, otherwise addSkill
            if (typeof skillLibrary.hotSwap === 'function') {
                await skillLibrary.hotSwap(name, code, description);
            } else {
                skillLibrary.addSkill(name, code, description, tags);
            }

            // Phase 6: Also register with ToolRegistry for MCP compatibility
            await this.registerWithToolRegistry(name, code, snapshot);

            // Log to Cognee for future retrieval
            if (this.agent.cogneeMemory && typeof this.agent.cogneeMemory.storeExperience === 'function') {
                try {
                    await this.agent.cogneeMemory.storeExperience(
                        this.agent.world_id || 'default',
                        [`Evolved skill ${name} to fix error: ${snapshot.errorMessage}`],
                        {
                            type: 'skill_evolution',
                            skillName: name,
                            errorFixed: snapshot.errorMessage,
                            codePreview: code.slice(0, 500)
                        }
                    );
                } catch (memoryErr) {
                    console.warn('[EvolutionEngine] Failed to persist evolution event to Cognee:', memoryErr.message);
                }
            }

            // Emit skill learned signal
            globalBus.emitSignal(SIGNAL.SKILL_LEARNED, {
                name,
                source: 'evolution',
                snapshot: {
                    taskName: snapshot.taskName,
                    error: snapshot.errorMessage?.slice(0, 100)
                }
            });

            return true;
        } catch (e) {
            console.error('[EvolutionEngine] Deploy failed:', e.message);
            return false;
        }
    }

    /**
     * Get evolution statistics
     */
    getStats() {
        return {
            ...this.stats,
            pendingFixes: this.pendingFixes.size,
            knownErrors: this.errorHistory.size,
            system2Failures: this.system2Failures.length
        };
    }

    /**
     * Clear error history (for testing/reset)
     */
    clearHistory() {
        this.errorHistory.clear();
        this.pendingFixes.clear();
        this.system2Failures = [];
        console.log('[EvolutionEngine] History cleared');
    }

    // ===== Phase 6: ToolRegistry Integration =====

    /**
     * Register evolved skill with ToolRegistry for MCP compatibility
     * @param {string} name - Skill name
     * @param {string} code - Generated code
     * @param {object} snapshot - Original failure context
     * @returns {boolean} Success
     */
    async registerWithToolRegistry(name, code, snapshot) {
        if (!this.agent.toolRegistry) {
            console.warn('[EvolutionEngine] ToolRegistry not available');
            return false;
        }

        try {
            // Build MCP-compatible metadata
            const metadata = {
                name: name,
                description: `Auto-evolved fix: ${snapshot.errorMessage?.slice(0, 60) || 'unknown error'}`,
                parameters: {
                    type: 'object',
                    properties: {
                        context: {
                            type: 'object',
                            description: 'Execution context'
                        }
                    },
                    required: []
                },
                returns: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                    }
                },
                tags: ['evolved', 'auto-generated', snapshot.taskName || 'unknown'],
                evolved: true,
                evolvedFrom: {
                    taskName: snapshot.taskName,
                    error: snapshot.errorMessage?.slice(0, 100),
                    timestamp: Date.now()
                }
            };

            // Create executor function from code
            const executor = this._createExecutorFromCode(code);

            // Register with ToolRegistry
            await this.agent.toolRegistry.registerDynamicSkill(name, metadata, executor);

            this.stats.registeredToToolRegistry++;
            console.log(`[EvolutionEngine] ✅ Registered ${name} with ToolRegistry`);

            // Emit skill registered signal
            globalBus.emitSignal(SIGNAL.SKILL_REGISTERED, {
                name,
                source: 'evolution',
                timestamp: Date.now()
            });

            return true;
        } catch (error) {
            console.error('[EvolutionEngine] ToolRegistry registration failed:', error.message);
            return false;
        }
    }

    /**
     * Create executor function from generated code string
     * @private
     */
    _createExecutorFromCode(code) {
        // Return a safe wrapper that executes the code
        return async (agent, params) => {
            try {
                // Use the sandbox to execute
                const result = await this.sandbox.execute(code, {
                    agent,
                    params,
                    bot: agent.bot
                });
                return { success: true, result };
            } catch (error) {
                return { success: false, error: error.message };
            }
        };
    }

    // ===== Phase 6: System2 Failure Tracking =====

    /**
     * Track System2 failures for pattern analysis
     * @private
     */
    async _trackSystem2Failure(payload) {
        const failure = {
            goal: payload.goal,
            reason: payload.reason,
            details: payload.details,
            timestamp: Date.now()
        };

        // Add to history
        this.system2Failures.push(failure);
        this.stats.system2FailuresTracked++;

        // Trim history if too large
        if (this.system2Failures.length > this.maxFailureHistory) {
            this.system2Failures = this.system2Failures.slice(-this.maxFailureHistory);
        }

        // Analyze patterns
        const pattern = this._analyzeFailurePattern();
        if (pattern) {
            console.log(`[EvolutionEngine] 🔍 Detected failure pattern: ${pattern.type}`);
            await this._evolveFromPattern(pattern);
        }
    }

    /**
     * Analyze recent failures for patterns
     * @private
     */
    _analyzeFailurePattern() {
        if (this.system2Failures.length < 3) return null;

        const recentFailures = this.system2Failures.slice(-10);

        // Count failure reasons
        const reasonCounts = {};
        for (const f of recentFailures) {
            reasonCounts[f.reason] = (reasonCounts[f.reason] || 0) + 1;
        }

        // Find most common failure
        const sortedReasons = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1]);

        if (sortedReasons.length > 0 && sortedReasons[0][1] >= 3) {
            return {
                type: 'recurring_failure',
                reason: sortedReasons[0][0],
                count: sortedReasons[0][1],
                examples: recentFailures.filter(f => f.reason === sortedReasons[0][0])
            };
        }

        return null;
    }

    /**
     * Evolve new capability from failure pattern
     * @private
     */
    async _evolveFromPattern(pattern) {
        console.log(`[EvolutionEngine] 🧬 Evolving from pattern: ${pattern.reason}`);

        // Create a synthetic snapshot from the pattern
        const syntheticSnapshot = {
            taskName: `fix_${pattern.reason.replace(/\s+/g, '_')}`,
            errorMessage: `Recurring issue (${pattern.count}x): ${pattern.reason}`,
            errorHash: `pattern_${pattern.reason}`,
            examples: pattern.examples.slice(0, 3).map(e => e.details),
            timestamp: Date.now()
        };

        // Request fix for the pattern
        await this.requestFix(syntheticSnapshot);
    }

    /**
     * Get failure analysis report
     */
    getFailureAnalysis() {
        const recentFailures = this.system2Failures.slice(-20);

        // Group by reason
        const byReason = {};
        for (const f of recentFailures) {
            if (!byReason[f.reason]) {
                byReason[f.reason] = [];
            }
            byReason[f.reason].push(f);
        }

        // Group by goal type
        const byGoalType = {};
        for (const f of recentFailures) {
            const goalType = this._extractGoalType(f.goal);
            if (!byGoalType[goalType]) {
                byGoalType[goalType] = [];
            }
            byGoalType[goalType].push(f);
        }

        return {
            totalFailures: this.system2Failures.length,
            recentCount: recentFailures.length,
            byReason: Object.entries(byReason).map(([reason, failures]) => ({
                reason,
                count: failures.length,
                lastOccurrence: failures[failures.length - 1]?.timestamp
            })),
            byGoalType: Object.entries(byGoalType).map(([type, failures]) => ({
                type,
                count: failures.length
            })),
            evolvedSkills: this.stats.generatedSkills,
            registeredToRegistry: this.stats.registeredToToolRegistry
        };
    }

    /**
     * Extract goal type from goal string
     * @private
     */
    _extractGoalType(goal) {
        if (!goal) return 'unknown';
        const goalLower = goal.toLowerCase();

        if (goalLower.includes('build') || goalLower.includes('house')) return 'building';
        if (goalLower.includes('mine') || goalLower.includes('dig')) return 'mining';
        if (goalLower.includes('fight') || goalLower.includes('kill')) return 'combat';
        if (goalLower.includes('gather') || goalLower.includes('collect')) return 'gathering';
        if (goalLower.includes('craft')) return 'crafting';
        if (goalLower.includes('explore') || goalLower.includes('find')) return 'exploration';

        return 'other';
    }
}

export default EvolutionEngine;

