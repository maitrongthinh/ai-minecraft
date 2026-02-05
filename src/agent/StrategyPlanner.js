/**
 * StrategyPlanner.js
 * 
 * Manages long-term goals and prioritizes actions based on survival needs.
 * 
 * Features:
 * 1. Goal Queue (Priority-based)
 * 2. State Monitoring (Health/Food/Time) -> Triggers Interrupts
 * 3. Decomposition of high-level goals via DualBrain
 */

export class StrategyPlanner {
    constructor(agent) {
        this.agent = agent;
        this.goals = []; // Array of { id, description, priority, timestamp }
        this.currentGoal = null;
        this.isExecuting = false;

        // Priority Constants
        this.PRIORITY = {
            CRITICAL: 100, // Immediate survival (Health < 10, Starvation)
            HIGH: 80,      // Night survival, Combat
            MEDIUM: 50,    // Main mission (e.g. "Get Diamonds")
            LOW: 20        // Idle exploration
        };
    }

    /**
     * BRAIN REFACTOR Phase C: Get failure context for prompt injection
     * Retrieves recent errors from history to prevent repeating mistakes
     * @returns {string} - Formatted failure warning for LLM prompt
     */
    getFailureContext() {
        if (!this.agent.history) return '';

        const recentErrors = this.agent.history.getRecentErrors(3);
        if (recentErrors.length === 0) return '';

        const errorLines = recentErrors.map(e => {
            const ago = Math.round((Date.now() - e.timestamp) / 1000 / 60);
            return `- ${e.action}: ${e.error} (${ago} min ago)`;
        });

        return `\n⚠️ RECENT FAILURES (DO NOT REPEAT THESE ACTIONS):\n${errorLines.join('\n')}\n`;
    }

    /**
     * MEMORY GAP A FIX: Get memory context from Cognee/VectorStore
     * Retrieves relevant past experiences for better planning
     * @param {string} goalDescription - The goal to search memories for
     * @returns {Promise<string>} - Formatted memory context for LLM prompt
     */
    async getMemoryContext(goalDescription) {
        // Try Cognee first (Graph-based memory)
        if (this.agent.cogneeMemory && this.agent.world_id) {
            try {
                // Task 32: Active Recall - Ask "How to" specifically
                const query = `how to ${goalDescription}`;
                const recalled = await this.agent.cogneeMemory.recall(
                    this.agent.world_id,
                    query,
                    3 // Get top 3 relevant memories
                );
                if (recalled.success && recalled.results && recalled.results.length > 0) {
                    console.log(`[StrategyPlanner] 📚 Recalled ${recalled.results.length} memories for "${query}"`);
                    return `\n📚 RELEVANT PAST EXPERIENCES (How to ${goalDescription}):\n${recalled.results.map(r => `- ${r}`).join('\n')}\n`;
                }
            } catch (e) {
                console.warn('[StrategyPlanner] Cognee recall failed:', e.message);
            }
        }

        // Fallback to VectorStore via Dreamer
        if (this.agent.dreamer) {
            try {
                const memories = await this.agent.dreamer.searchMemories(goalDescription);
                if (memories && memories.length > 0) {
                    console.log(`[StrategyPlanner] 📚 Found ${memories.length} memories from VectorStore`);
                    return `\n📚 RELEVANT MEMORIES:\n${memories.slice(0, 3).map(m => `- ${m.text}`).join('\n')}\n`;
                }
            } catch (e) {
                console.warn('[StrategyPlanner] VectorStore search failed:', e.message);
            }
        }

        return '';
    }

    /**
     * Add a new goal to the queue
     * @param {string} description - Goal description
     * @param {number} priority - Priority level (default: MEDIUM)
     */
    addGoal(description, priority = 50) {
        const goal = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            description,
            priority,
            timestamp: Date.now(),
            attempt_count: 0 // Task 32: Anti-Stuck Counter
        };
        this.goals.push(goal);
        this.sortGoals();
        console.log(`[StrategyPlanner] Added goal: "${description}" (P:${priority})`);
    }

    sortGoals() {
        // Sort by priority (descending) then timestamp (ascending)
        this.goals.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return a.timestamp - b.timestamp;
        });
    }

    /**
     * Main update loop called by Agent
     */
    async update() {
        if (!this.agent.running) return;

        // 1. Survival Check (Implicit High Priority Goals)
        await this.checkSurvivalNeeds();

        // 2. Goal Selection
        if (!this.currentGoal && this.goals.length > 0) {
            this.currentGoal = this.goals.shift();

            // Task 32: Anti-Stuck Logic
            this.currentGoal.attempt_count = (this.currentGoal.attempt_count || 0) + 1;

            if (this.currentGoal.attempt_count > 3) {
                const failMsg = `⚠️ Goal FAILED after 3 attempts: "${this.currentGoal.description}". Skipping.`;
                console.log(`[StrategyPlanner] ${failMsg}`);
                this.agent.history.addError(this.currentGoal.description, "Too many failed attempts (Anti-Stuck)");

                // Store failure in Cognee
                if (this.agent.cogneeMemory) {
                    this.agent.cogneeMemory.storeExperience(this.agent.world_id, [failMsg], { type: 'goal_failure', goal: this.currentGoal.description }).catch(e => { });
                }

                this.currentGoal = null; // discard
                return; // Try next goal in next loop
            }

            console.log(`[StrategyPlanner] 🎯 Selected new goal (Attempt ${this.currentGoal.attempt_count}): "${this.currentGoal.description}"`);

            // Trigger DualBrain to plan for this goal
            const failureContext = this.getFailureContext();
            const memoryContext = await this.getMemoryContext(this.currentGoal.description);
            const prompt = `STRATEGIC GOAL (Attempt ${this.currentGoal.attempt_count}/3): ${this.currentGoal.description}.${failureContext}${memoryContext}\nPlan the next steps carefully.`;
            await this.agent.handleMessage('system', prompt);
        }
    }

    /**
     * Check for critical survival needs and inject them as CRITICAL goals
     */
    async checkSurvivalNeeds() {
        if (!this.agent.bot || !this.agent.bot.entity) return;

        const health = this.agent.bot.health;
        const food = this.agent.bot.food;
        const time = this.agent.bot.time.timeOfDay;
        const isNight = time > 13000 && time < 23000;

        // Check if we already have a critical goal active
        if (this.currentGoal && this.currentGoal.priority >= this.PRIORITY.CRITICAL) {
            return;
        }

        let criticalNeed = null;

        if (health < 10) {
            criticalNeed = "CRITICAL: Health low. Retreat and Heal immediately.";
        } else if (food < 6) {
            criticalNeed = "CRITICAL: Starving. Find and eat food immediately.";
        } else if (isNight && this.agent.bot.blockAt(this.agent.bot.entity.position).light < 8) {
            // Only worry if in dark
            // Note: Detailed light check is expensive, this is a heuristic
            // For now, simpler check:
            // criticalNeed = "Night danger. Find shelter or light up area.";
            // (Disabled for now to avoid spamming goals at night)
        }

        if (criticalNeed) {
            console.log(`[StrategyPlanner] ⚠️ INTERRUPT: ${criticalNeed}`);

            // If we have a current goal, push it back to queue
            if (this.currentGoal) {
                // Task 32: Don't reset attempt_count, just put back
                this.goals.unshift(this.currentGoal);
            }

            // Set immediate critical goal
            this.currentGoal = {
                id: 'survival_' + Date.now(),
                description: criticalNeed,
                priority: this.PRIORITY.CRITICAL,
                timestamp: Date.now()
            };

            // BRAIN REFACTOR Phase C: Inject failure context in survival prompts too
            // MEMORY GAP C FIX: Also inject memory context for survival decisions
            const failureContext = this.getFailureContext();
            const memoryContext = await this.getMemoryContext(criticalNeed);
            await this.agent.handleMessage('system', `SURVIVAL INTERRUPT: ${criticalNeed}${failureContext}${memoryContext}`);
        }
    }

    /**
     * Called when a task/goal is considered complete
     */
    completeGoal() {
        if (this.currentGoal) {
            console.log(`[StrategyPlanner] ✅ Goal complete: "${this.currentGoal.description}"`);
            this.currentGoal = null;
        }
    }
}
