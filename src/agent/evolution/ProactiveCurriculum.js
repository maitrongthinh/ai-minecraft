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
        this.knownBiomes = new Set();
        this.knownItems = new Set();

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
            this._checkMilestones();
            this.evaluateAndStartGoal();
        }, 5000);
    }

    _checkMilestones() {
        const bot = this.agent.bot;
        if (!bot) return;

        // 1. Biome Discovery
        const currentBiome = bot.biome?.name;
        if (currentBiome && !this.knownBiomes.has(currentBiome)) {
            this.knownBiomes.add(currentBiome);
            if (this.agent.dreamer) {
                this.agent.dreamer.memorize(`[MILESTONE] Discovered a new biome: ${currentBiome}`);
                console.log(`[ProactiveCurriculum] 🏆 Milestone unlocked: Biome ${currentBiome}`);
            }
        }

        // 2. Item Discovery
        if (bot.inventory) {
            const items = bot.inventory.items();
            for (const item of items) {
                if (!this.knownItems.has(item.name)) {
                    this.knownItems.add(item.name);
                    if (this.agent.dreamer) {
                        this.agent.dreamer.memorize(`[MILESTONE] Obtained new item: ${item.name}`);
                        console.log(`[ProactiveCurriculum] 🏆 Milestone unlocked: Item ${item.name}`);
                    }
                }
            }
        }
    }

    cancelCurriculumEvaluation() {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }
    }

    /**
     * Analyze inventory and select the next logical step using LLM (Voyager Architecture)
     */
    async analyzeInventoryForNextGoal() {
        const bot = this.agent.bot;
        if (!bot || !bot.inventory) return this.techTree[0]; // Fallback to first

        const itemsList = bot.inventory.items();
        const itemsNames = itemsList.map(i => i.name);
        const itemsContext = itemsList.map(i => `${i.name} (x${i.count})`).join(', ');

        let existingSkillsText = 'None';
        if (this.agent.skillManager) {
            existingSkillsText = Object.keys(this.agent.skillManager.getAllSkills()).join(', ');
        }

        // Phase 12 EAI: LLM Driven Curriculum
        const prompt = `
You are the Proactive Curriculum Engine for a Minecraft AI agent.
Your goal is to suggest ONE single, highly specific next objective for the agent to accomplish based on its current inventory and learned skills.
The objective must be a logical progression in the Minecraft survival tech tree.

Current Inventory:
${itemsContext || 'Empty'}

Current Learned Skills:
${existingSkillsText}

Respond with ONLY the objective statement. Do not add any explanation, JSON, or markdown formatting.
Examples of good responses:
- Mine 3 oak_log
- Craft 1 wooden_pickaxe
- Mine 3 stone to upgrade tools
- Smelt raw_iron in furnace
- Hunt for food
`;

        try {
            console.log('[ProactiveCurriculum] 🧠 Asking LLM for next logical goal...');
            if (this.agent.prompter) {
                const response = await this.agent.prompter.chat([{ role: 'user', content: prompt }]);
                let cleanGoal = response;
                if (typeof cleanGoal === 'string' && cleanGoal.includes('<think>')) {
                    cleanGoal = cleanGoal.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                }
                cleanGoal = cleanGoal.replace(/```.*?```/s, '').trim(); // sanitize markdown if leaked

                if (cleanGoal && cleanGoal.length > 3) {
                    return { id: 'dynamic_llm_goal', goal: cleanGoal, requiredItems: [] };
                }
            }
        } catch (err) {
            console.warn('[ProactiveCurriculum] ⚠ LLM Curriculum failed, falling back to static heuristic:', err.message);
        }

        // Static Fallback
        for (const node of this.techTree) {
            if (node.id.includes('pickaxe')) {
                const hasBetter = itemsNames.some(i => i.includes('iron_pickaxe') || i.includes('diamond_pickaxe'));
                if (hasBetter) continue;
            }
            if (itemsNames.some(i => i.includes(node.id))) {
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

            const nextGoal = await this.analyzeInventoryForNextGoal();
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
