import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * ProactiveCurriculum.js
 * 
 * Inspired by Voyager's Automatic Curriculum.
 * Instead of waiting for a threat to learn, the agent proactively sets goals 
 * (Tech Tree) when IDLE, preventing Context Collapse.
 */
export class ProactiveCurriculum {
    constructor(agent) {
        this.agent = agent;
        this.activeGoal = null;
        this.idleTimeout = null;

        // Basic Minecraft Tech Tree Objectives
        this.techTree = [
            { id: 'wood', goal: 'Mine 3 oak_log', requiredItems: [] },
            { id: 'planks', goal: 'Craft 12 oak_planks', requiredItems: ['oak_log'] },
            { id: 'crafting_table', goal: 'Craft 1 crafting_table', requiredItems: ['oak_planks'] },
            { id: 'wooden_pickaxe', goal: 'Craft 1 wooden_pickaxe', requiredItems: ['crafting_table', 'oak_planks', 'stick'] },
            { id: 'stone', goal: 'Mine 3 cobblestone', requiredItems: ['wooden_pickaxe'] },
            { id: 'stone_pickaxe', goal: 'Craft 1 stone_pickaxe', requiredItems: ['crafting_table', 'cobblestone', 'stick'] },
            { id: 'furnace', goal: 'Craft 1 furnace', requiredItems: ['crafting_table', 'cobblestone'] },
            { id: 'iron_ore', goal: 'Mine 3 iron_ore or raw_iron', requiredItems: ['stone_pickaxe'] },
            { id: 'iron_ingot', goal: 'Smelt raw_iron into iron_ingot', requiredItems: ['furnace', 'raw_iron'] },
            { id: 'iron_pickaxe', goal: 'Craft 1 iron_pickaxe', requiredItems: ['crafting_table', 'iron_ingot', 'stick'] },
            { id: 'diamond', goal: 'Mine 1 diamond', requiredItems: ['iron_pickaxe'] }
        ];

        // Listen for IDLE state to trigger Proactive Learning
        globalBus.subscribe(SIGNAL.STATE_CHANGED, (event) => {
            if (event.payload.state === 'IDLE' || event.payload.state === 'BOOTING_DONE') {
                this.scheduleCurriculumEvaluation();
            } else {
                this.cancelCurriculumEvaluation();
            }
        });
    }

    scheduleCurriculumEvaluation() {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
        // Wait 5 seconds of idle before starting a new objective
        this.idleTimeout = setTimeout(() => {
            this.evaluateAndStartGoal();
        }, 5000);
    }

    cancelCurriculumEvaluation() {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }
    }

    /**
     * Analyze inventory and select the next logical step in the Tech Tree
     */
    analyzeInventoryForNextGoal() {
        const bot = this.agent.bot;
        if (!bot || !bot.inventory) return this.techTree[0]; // Fallback to first

        const items = bot.inventory.items().map(i => i.name);

        // Find the most advanced tech tree node we CAN do but HAVEN'T done yet
        // A simple heuristic: find the first node where we don't have the result item
        // Note: this is a basic heuristic. A full Voyager integration uses LLM for this.
        for (const node of this.techTree) {
            // Check if we already fulfilled this by having the target item conceptually
            // E.g 'wooden_pickaxe'. If we have iron_pickaxe, we skip wood/stone pickaxes.
            if (node.id.includes('pickaxe')) {
                const hasBetter = items.some(i => i.includes('iron_pickaxe') || i.includes('diamond_pickaxe'));
                if (hasBetter) continue;
            }
            if (items.some(i => i.includes(node.id))) {
                continue; // We already have this item
            }

            return node;
        }

        return { id: 'exploration', goal: 'Explore the world to find new biomes and structures.', requiredItems: [] };
    }

    /**
     * Generate tasks and pass to System 2 Planner
     */
    async evaluateAndStartGoal() {
        try {
            // Stop if we are already doing something (Lock check)
            if (this.agent.brain && this.agent.brain.isBusy()) return;
            if (this.agent.bot.entity.velocity.y < -0.1) return; // Falling

            const nextGoal = this.analyzeInventoryForNextGoal();
            this.activeGoal = nextGoal;

            console.log(`[ProactiveCurriculum] 🎓 IDLE detected. Automatically setting goal: ${nextGoal.goal}`);

            // Route to UnifiedBrain / Planner
            if (this.agent.brain) {
                this.agent.brain.receiveInstruction(`[Curriculum Goal] ${nextGoal.goal}`);
            } else {
                this.agent.actions.handleMessage('system', `Execute task: ${nextGoal.goal}`);
            }
        } catch (error) {
            console.error('[ProactiveCurriculum] Error evaluating goal:', error.message);
        }
    }
}
