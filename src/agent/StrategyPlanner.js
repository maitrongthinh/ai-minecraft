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
     * Add a new goal to the queue
     * @param {string} description - Goal description
     * @param {number} priority - Priority level (default: MEDIUM)
     */
    addGoal(description, priority = 50) {
        const goal = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            description,
            priority,
            timestamp: Date.now()
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
            console.log(`[StrategyPlanner] 🎯 Selected new goal: "${this.currentGoal.description}"`);

            // Trigger DualBrain to plan for this goal
            // We inject the goal into the context via a special message
            await this.agent.handleMessage('system', `STRATEGIC GOAL: ${this.currentGoal.description}. Plan the next steps.`);
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
                this.goals.unshift(this.currentGoal); // Put back at front
            }

            // Set immediate critical goal
            this.currentGoal = {
                id: 'survival_' + Date.now(),
                description: criticalNeed,
                priority: this.PRIORITY.CRITICAL,
                timestamp: Date.now()
            };

            await this.agent.handleMessage('system', `SURVIVAL INTERRUPT: ${criticalNeed}`);
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
