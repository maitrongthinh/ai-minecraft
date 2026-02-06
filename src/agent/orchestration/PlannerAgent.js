import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * PlannerAgent - HTN (Hierarchical Task Network) Goal Decomposition
 * 
 * System 2 Component: Converts high-level goals into executable task plans.
 * Uses DualBrain for AI-powered planning with structured output.
 * 
 * Example:
 * Input: "Build a house"
 * Output: [
 *   { task: "gather_resources", params: { resource: "wood", count: 64 } },
 *   { task: "gather_resources", params: { resource: "stone", count: 32 } },
 *   { task: "find_flat_area", params: { size: 10 } },
 *   { task: "build_foundation", params: { width: 8, length: 8 } },
 *   ...
 * ]
 */
export class PlannerAgent {
    constructor(agent) {
        this.agent = agent;
        this.maxDepth = 3; // Maximum HTN decomposition depth
        this.maxSteps = 20; // Maximum plan steps

        console.log('[PlannerAgent] Initialized');
    }

    /**
     * Decompose a high-level goal into executable tasks
     * @param {string} goal - Natural language goal
     * @param {object} context - Current context (inventory, location, etc.)
     * @returns {Promise<{success: boolean, plan: Array, reasoning: string}>}
     */
    async decompose(goal, context = {}) {
        console.log(`[PlannerAgent] Decomposing goal: "${goal}"`);

        try {
            // Build context for planning
            const planningContext = await this._buildPlanningContext(context);

            // Generate plan using DualBrain (Planner model)
            const plan = await this._generatePlan(goal, planningContext);

            if (!plan || plan.length === 0) {
                return {
                    success: false,
                    plan: [],
                    reasoning: 'Failed to generate plan'
                };
            }

            // Validate plan structure
            const validatedPlan = this._validatePlanStructure(plan);

            globalBus.emitSignal(SIGNAL.SYSTEM2_PLAN_READY, {
                goal,
                stepCount: validatedPlan.length
            });

            return {
                success: true,
                plan: validatedPlan,
                reasoning: `Generated ${validatedPlan.length} steps for: ${goal}`
            };

        } catch (error) {
            console.error('[PlannerAgent] Decomposition failed:', error);
            return {
                success: false,
                plan: [],
                reasoning: `Planning error: ${error.message}`
            };
        }
    }

    /**
     * Build context for planning decisions
     * @private
     */
    async _buildPlanningContext(context) {
        const botState = {
            health: this.agent.bot?.health || 20,
            food: this.agent.bot?.food || 20,
            position: this.agent.bot?.entity?.position || { x: 0, y: 64, z: 0 },
            isDay: this.agent.bot?.time?.isDay ?? true
        };

        // Get inventory summary
        const inventory = this._getInventorySummary();

        // Get available skills from ToolRegistry
        const availableSkills = this._getAvailableSkills();

        // Phase 5: Agentic RAG - Proactive memory recall
        let relevantMemories = [];
        let memoryContext = '';

        if (this.agent.unifiedMemory && context.goal) {
            try {
                // Proactively fetch memories relevant to the goal
                const memories = await this.agent.unifiedMemory.proactiveRecall(context.goal);
                relevantMemories = memories.raw || [];
                memoryContext = await this.agent.unifiedMemory.getMemoryContext(context.goal);
                console.log(`[PlannerAgent] Agentic RAG: Retrieved ${relevantMemories.length} memories`);
            } catch (error) {
                console.warn('[PlannerAgent] Agentic RAG failed:', error.message);
            }
        }
        // Fallback to ContextManager
        else if (this.agent.contextManager) {
            const ctx = await this.agent.contextManager.buildContext('planning');
            relevantMemories = ctx.relevantMemories || [];
        }

        return {
            botState,
            inventory,
            availableSkills,
            relevantMemories,
            memoryContext,
            ...context
        };
    }

    /**
     * Get summarized inventory
     * @private
     */
    _getInventorySummary() {
        if (!this.agent.bot?.inventory) {
            return { items: [], slots: { used: 0, total: 36 } };
        }

        const items = this.agent.bot.inventory.items();
        const summary = {};

        for (const item of items) {
            const name = item.name;
            summary[name] = (summary[name] || 0) + item.count;
        }

        return {
            items: Object.entries(summary).map(([name, count]) => ({ name, count })),
            slots: { used: items.length, total: 36 }
        };
    }

    /**
     * Get available skills from ToolRegistry
     * @private
     */
    _getAvailableSkills() {
        if (!this.agent.toolRegistry) {
            return [];
        }

        return this.agent.toolRegistry.listSkills().map(s => ({
            name: s.name,
            description: s.description,
            tags: s.tags
        }));
    }

    /**
     * Generate plan using AI
     * @private
     */
    async _generatePlan(goal, context) {
        // Build prompt for planning
        const prompt = this._buildPlanningPrompt(goal, context);

        // Use DualBrain if available
        if (this.agent.brain) {
            try {
                const response = await this.agent.brain.plan(goal, {
                    systemPrompt: prompt,
                    maxTokens: 2000,
                    temperature: 0.3
                });

                // Parse structured output
                return this._parsePlanResponse(response);
            } catch (error) {
                console.warn('[PlannerAgent] DualBrain planning failed:', error.message);
            }
        }

        // Fallback: Return template plan
        return this._generateTemplatePlan(goal, context);
    }

    /**
     * Build prompt for AI planning
     * @private
     */
    _buildPlanningPrompt(goal, context) {
        const skillList = context.availableSkills
            .map(s => `- ${s.name}: ${s.description}`)
            .join('\n');

        const inventoryList = context.inventory.items
            .slice(0, 10)
            .map(i => `- ${i.name}: ${i.count}`)
            .join('\n') || '(empty)';

        // Phase 5: Include memory context if available
        const memorySection = context.memoryContext
            ? `\nRELEVANT MEMORIES:\n${context.memoryContext}\n`
            : '';

        return `You are a Minecraft planning agent. Decompose goals into executable tasks.

CURRENT STATE:
- Health: ${context.botState.health}/20
- Food: ${context.botState.food}/20
- Position: (${Math.floor(context.botState.position.x)}, ${Math.floor(context.botState.position.y)}, ${Math.floor(context.botState.position.z)})
- Time: ${context.botState.isDay ? 'Day' : 'Night'}

INVENTORY:
${inventoryList}
${memorySection}
AVAILABLE SKILLS:
${skillList}

GOAL: ${goal}

OUTPUT FORMAT (JSON array):
[
  { "task": "skill_name", "params": { ... }, "reason": "why this step" },
  ...
]

Rules:
1. Use only available skills
2. Order tasks logically (gather before build)
3. Consider current inventory
4. Use memories to inform decisions
5. Maximum ${this.maxSteps} steps
6. Each step must be concrete and executable`;
    }

    /**
     * Parse AI response into plan structure
     * @private
     */
    _parsePlanResponse(response) {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const plan = JSON.parse(jsonMatch[0]);
                return Array.isArray(plan) ? plan : [];
            }

            // Try parsing whole response as JSON
            const parsed = JSON.parse(response);
            return Array.isArray(parsed) ? parsed : [];

        } catch (error) {
            console.warn('[PlannerAgent] Failed to parse plan response:', error.message);
            return [];
        }
    }

    /**
     * Generate template plan based on goal keywords
     * @private
     */
    _generateTemplatePlan(goal, context) {
        const goalLower = goal.toLowerCase();

        // Template plans for common goals
        if (goalLower.includes('house') || goalLower.includes('build')) {
            return [
                { task: 'gather_resources', params: { resource: 'wood', count: 64 }, reason: 'Need wood for building' },
                { task: 'craft_items', params: { item: 'crafting_table', count: 1 }, reason: 'Need crafting table' },
                { task: 'craft_items', params: { item: 'wooden_planks', count: 32 }, reason: 'Convert logs to planks' },
                { task: 'find_location', params: { type: 'flat_area', size: 10 }, reason: 'Find building site' },
                { task: 'build_structure', params: { type: 'house', size: 'small' }, reason: 'Build the house' }
            ];
        }

        if (goalLower.includes('mine') || goalLower.includes('diamond') || goalLower.includes('ore')) {
            return [
                { task: 'craft_items', params: { item: 'wooden_pickaxe', count: 1 }, reason: 'Need pickaxe for mining' },
                { task: 'gather_resources', params: { resource: 'stone', count: 3 }, reason: 'Get stone for better pickaxe' },
                { task: 'craft_items', params: { item: 'stone_pickaxe', count: 1 }, reason: 'Better mining tool' },
                { task: 'mine_ores', params: { oreType: 'coal_ore', count: 8 }, reason: 'Get coal for torches' },
                { task: 'go_to_y', params: { y: 12 }, reason: 'Diamond level' },
                { task: 'mine_ores', params: { oreType: 'diamond_ore', count: 4 }, reason: 'Find diamonds' }
            ];
        }

        if (goalLower.includes('survive') || goalLower.includes('food')) {
            return [
                { task: 'gather_resources', params: { resource: 'wood', count: 16 }, reason: 'Basic tools' },
                { task: 'craft_items', params: { item: 'wooden_sword', count: 1 }, reason: 'Self defense' },
                { task: 'hunt_animals', params: { type: 'any', count: 5 }, reason: 'Get food' },
                { task: 'find_shelter', params: { type: 'cave_or_build' }, reason: 'Night shelter' }
            ];
        }

        if (goalLower.includes('kill') || goalLower.includes('fight') || goalLower.includes('attack')) {
            return [
                { task: 'equip_best_weapon', params: {}, reason: 'Prepare for combat' },
                { task: 'eat_food', params: { minFood: 18 }, reason: 'Full health for combat' },
                { task: 'approach_target', params: { target: goal.split(' ').pop() }, reason: 'Get close to target' },
                { task: 'attack_target', params: { strategy: 'aggressive' }, reason: 'Attack!' }
            ];
        }

        // Default: generic exploration
        return [
            { task: 'gather_resources', params: { resource: 'wood', count: 32 }, reason: 'Basic resources' },
            { task: 'craft_items', params: { item: 'crafting_table', count: 1 }, reason: 'Crafting capability' },
            { task: 'explore_area', params: { radius: 50 }, reason: 'Explore surroundings' }
        ];
    }

    /**
     * Validate and clean plan structure
     * @private
     */
    _validatePlanStructure(plan) {
        return plan
            .filter(step => step && step.task)
            .slice(0, this.maxSteps)
            .map((step, index) => ({
                id: index + 1,
                task: step.task,
                params: step.params || {},
                reason: step.reason || '',
                status: 'pending'
            }));
    }

    /**
     * Replan after failure
     * @param {string} originalGoal - The original goal
     * @param {Array} failedSteps - Steps that failed
     * @param {string} failureReason - Why it failed
     */
    async replan(originalGoal, failedSteps, failureReason) {
        console.log(`[PlannerAgent] Replanning after failure: ${failureReason}`);

        const context = await this._buildPlanningContext({
            previousFailure: {
                steps: failedSteps,
                reason: failureReason
            }
        });

        // Generate new plan with failure context
        return this.decompose(
            `${originalGoal} (Note: Previous attempt failed at: ${failureReason})`,
            context
        );
    }
}
