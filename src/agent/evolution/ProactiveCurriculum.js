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
        this.lastGoalTime = 0;
        this.goalCooldown = 30000; // 30 seconds between autonomous goals
        this.idleTimeout = null;
        this.knownBiomes = new Set();
        this.knownItems = new Set();

        // Phase 13 Watchdog State
        this.lastPosition = null;
        this.lastPosTime = Date.now();
        this.failedGoalsHistory = new Map(); // goal_id -> failure_count
        this.stallCounter = 0;

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
            { id: 'diamond', goal: 'Mine 1 diamond', requiredItems: ['iron_pickaxe'] },
            { id: 'diamond_pickaxe', goal: 'Craft 1 diamond_pickaxe', requiredItems: ['crafting_table', 'diamond', 'stick'] },
            { id: 'obsidian', goal: 'Mine 10 obsidian blocks (bring water to lava)', requiredItems: ['diamond_pickaxe', 'water_bucket'] },
            { id: 'nether_portal', goal: 'Build and enter a Nether Portal', requiredItems: ['obsidian', 'flint_and_steel'] },
            { id: 'blaze_rod', goal: 'Hunt Blazes in Nether Fortress to get 7 blaze_rods', requiredItems: ['iron_sword', 'shield'] },
            { id: 'ender_pearl', goal: 'Gather 12 ender_pearls from Endermen or trading', requiredItems: [] },
            { id: 'eye_of_ender', goal: 'Craft 12 eye_of_ender', requiredItems: ['blaze_powder', 'ender_pearl'] },
            { id: 'stronghold', goal: 'Locate and enter the Stronghold', requiredItems: ['eye_of_ender'] },
            { id: 'beating_minecraft', goal: 'Enter the End and defeat the Ender Dragon', requiredItems: ['eye_of_ender', 'bed', 'bow'] }
        ];

        // Listen for IDLE state to trigger Proactive Learning
        globalBus.subscribe(SIGNAL.STATE_CHANGED, (event) => {
            if (event.payload.state === 'IDLE' || event.payload.state === 'BOOTING_DONE') {
                this.scheduleCurriculumEvaluation();
            } else {
                this.cancelCurriculumEvaluation();
            }
        });

        // Phase 13: Movement Watchdog Tick (Every 10s)
        this._watchdogInterval = setInterval(() => this.checkMovementWatchdog(), 10000);
    }

    scheduleCurriculumEvaluation() {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
        // Wait 2 seconds of idle before starting a new objective
        this.idleTimeout = setTimeout(() => {
            this._checkMilestones();
            this.evaluateAndStartGoal();
        }, 2000);
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
     * Phase 13: Movement Watchdog
     * Verifies the bot is actually making progress if it claims to be EXECUTING.
     */
    checkMovementWatchdog() {
        const bot = this.agent.bot;
        if (!bot || !bot.entity) return;

        // Use action manager to check if we are busy (brain doesn't have isBusy)
        const isBusy = this.agent.actions?.isBusy() || this.agent.system2?.state !== 'idle';
        if (!isBusy) {
            this.lastPosition = null; // Reset if idle
            this.stallCounter = 0;
            return;
        }

        const currentPos = bot.entity.position.clone();
        if (this.lastPosition && currentPos.distanceTo(this.lastPosition) < 2.0) {
            this.stallCounter++;
            console.warn(`[ProactiveCurriculum] ⚠ Movement Stall detected (${this.stallCounter}/3)`);

            if (this.stallCounter >= 3) { // 30 seconds of no significant movement
                console.error('[ProactiveCurriculum] 🚨 Bot is STALLED. Forcing goal re-evaluation.');
                globalBus.emitSignal(SIGNAL.TASK_FAILED, {
                    error: 'STALLED',
                    reason: 'Proactive Watchdog: No movement for 30s'
                });
                this.evaluateAndStartGoal(true); // Force re-eval
                this.stallCounter = 0;
            }
        } else {
            this.stallCounter = 0;
        }

        this.lastPosition = currentPos;
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
Your mission is to reach the End and defeat the Ender Dragon.

Suggest ONE single, highly specific next objective for the agent.
Be aggressive but logical. If it's night and safe, suggest mining underground.
If the agent has logs but no planks, suggest planks.
If the agent has enough wood and planks, suggest the Crafting Table.

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
- Dig survival tunnel to mine iron at night
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
     * @param {boolean} force - Skip busy check (for watchdog)
     */
    async evaluateAndStartGoal(force = false) {
        try {
            // Stop if we are already doing something (unless forced by watchdog)
            if (!force && this.agent.actions?.isBusy()) return;
            const bot = this.agent.bot;
            if (!force && bot?.entity?.velocity?.y < -0.1) return; // Falling

            const now = Date.now();
            if (now - this.lastGoalTime < this.goalCooldown && !force) {
                return;
            }

            const nextGoal = await this.analyzeInventoryForNextGoal();
            this.activeGoal = nextGoal;
            this.lastGoalTime = now;

            console.log(`[ProactiveCurriculum] 🎓 IDLE detected. Automatically setting goal: ${nextGoal.goal}`);

            // Route curriculum goals through the agent's standard message handling path
            if (this.agent.handleMessage) {
                await this.agent.handleMessage('system', `[Curriculum Goal] ${nextGoal.goal}`);
            }
        } catch (error) {
            console.error('[ProactiveCurriculum] Error evaluating goal:', error.message);
        }
    }

    /**
     * Cleanup timers to prevent memory leaks on reconnect/shutdown
     */
    shutdown() {
        this.cancelCurriculumEvaluation();
        if (this._watchdogInterval) {
            clearInterval(this._watchdogInterval);
            this._watchdogInterval = null;
        }
        this.activeGoal = null;
        this.stallCounter = 0;
        console.log('[ProactiveCurriculum] 🔌 Shutdown complete.');
    }
}
