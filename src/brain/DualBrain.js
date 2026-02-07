import settings from '../../settings.js';
import { getStrategicPrompt } from '../prompts/StrategicPrompts.js';
import { ActionLogger } from '../utils/ActionLogger.js';
import { sendThoughtToServer } from '../agent/mindserver_proxy.js';

/**
 * SingleBrain: Unified AI Controller
 * 
 * Replaces DualBrain. Uses ONLY MiniMax-M2 (via MegaLLM) for all tasks.
 * No more dual-model routing or fast model fallback.
 * 
 * Features:
 * - Rate Limiting (budget management)
 * - Context enrichment with Cognee memories
 * - Context enrichment with Skill Catalog
 * - Strategic Prompts with Survival Awareness
 * - Logging via ActionLogger
 */
export class DualBrain {
    constructor(agent, prompter, cogneeMemory = null, skillLibrary = null) {
        this.agent = agent;
        this.prompter = prompter;

        // Single Model Config (MiniMax-M2 via MegaLLM)
        this.model = settings.models?.high_iq || {
            provider: 'openai',
            model: 'gpt-5',
            url: 'https://ai.megallm.io/v1'
        };

        // External context providers
        this.cogneeMemory = cogneeMemory;
        this.skillLibrary = skillLibrary;

        // Rate Limiter State
        this.requestCount = 0;
        this.windowStart = Date.now();
        // MODE: UNLEASHED - Context Stuffing Enforced
        this.limit = 1000; // Effectively unlimited for now (was settings.models?.high_iq?.rate_limit)
        this.windowSize = 12 * 60 * 60 * 1000; // 12 hours

        ActionLogger.api('brain_init', { model: this.model.model, limit: this.limit });
        console.log(`[Brain] Initialized with single model: ${this.model.model} (UNLEASHED MODE)`);
    }

    /**
     * CHAT: Uses MiniMax for all conversation
     */
    async chat(messages) {
        const requestId = this.agent.latestRequestId;
        ActionLogger.api('chat_request', { msgCount: messages.length, requestId });

        if (!this._checkBudget()) {
            ActionLogger.api('chat_budget_exceeded', { budget: `${this.requestCount}/${this.limit}`, requestId });
            return 'Xin lỗi, tôi đã dùng hết budget API cho hôm nay. Hãy thử lại sau.';
        }

        try {
            const res = await this.prompter.chat(messages, this.model);
            this._consumeBudget();
            ActionLogger.api('chat_success', { budget: `${this.requestCount}/${this.limit}`, requestId });
            return res;
        } catch (error) {
            ActionLogger.error('chat_failed', { error: error.message, requestId });
            return 'Có lỗi xảy ra khi xử lý tin nhắn.';
        }
    }

    /**
     * PLAN: Uses MiniMax with strategic context
     */
    async plan(context, worldId = null) {
        const requestId = this.agent.latestRequestId;
        ActionLogger.api('plan_request', { contextMsgs: context.length, worldId, requestId }, worldId);

        if (!this._checkBudget()) {
            ActionLogger.api('plan_budget_exceeded', { budget: `${this.requestCount}/${this.limit}`, requestId }, worldId);
            return 'Budget API đã hết. Không thể lập kế hoạch phức tạp.';
        }

        // Generate Strategic System Prompt
        const strategicSysPrompt = getStrategicPrompt(this.agent.bot);

        // Build context with strategic prompt
        let planContext = [...context];
        if (planContext.length > 0 && planContext[0].role === 'system') {
            planContext[0].content = strategicSysPrompt + "\n\nOriginal Instructions: " + planContext[0].content;
        } else {
            planContext.unshift({ role: 'system', content: strategicSysPrompt });
        }

        // Enrich with Cognee and Skills
        const enrichedContext = await this._enrichContext(planContext, worldId);

        try {
            const res = await this.prompter.chat(enrichedContext, this.model);
            this._consumeBudget();
            ActionLogger.api('plan_success', { budget: `${this.requestCount}/${this.limit}`, requestId }, worldId);

            // Extract core thought if available (e.g. from <think> tags or just the response summary)
            let thoughtPreview = res.includes('</think>') ? res.split('</think>')[0].substring(0, 150) + '...' : res.substring(0, 100) + '...';
            sendThoughtToServer(this.agent.name, `[PLAN] ${thoughtPreview}`);

            return res;
        } catch (error) {
            ActionLogger.error('plan_failed', { error: error.message, requestId }, worldId);
            return 'Có lỗi khi lập kế hoạch. Hãy thử lại.';
        }
    }

    /**
     * CODE: Uses MiniMax for code generation
     */
    async code(prompt, worldId = null) {
        const requestId = this.agent.latestRequestId;
        ActionLogger.api('code_request', { promptLength: prompt.length, requestId }, worldId);

        if (!this._checkBudget()) {
            ActionLogger.api('code_budget_exceeded', { budget: `${this.requestCount}/${this.limit}`, requestId }, worldId);
            throw new Error('Budget Exceeded for Coding.');
        }

        const enrichedPrompt = await this._enrichCodePrompt(prompt);

        try {
            const res = await this.prompter.generateCode(enrichedPrompt, this.model);
            this._consumeBudget();
            ActionLogger.api('code_success', { budget: `${this.requestCount}/${this.limit}`, requestId }, worldId);
            sendThoughtToServer(this.agent.name, `[CODE_GEN] Generated code for: "${prompt.substring(0, 50)}..."`);
            return res;
        } catch (error) {
            ActionLogger.error('code_failed', { error: error.message }, worldId);
            throw error;
        }
    }

    _checkBudget() {
        const now = Date.now();
        if (now - this.windowStart > this.windowSize) {
            this.requestCount = 0;
            this.windowStart = now;
            console.log('[Brain] Budget window reset.');
        }

        if (this.requestCount >= this.limit) {
            console.warn(`[Brain] Budget LIMIT reached (${this.requestCount}/${this.limit})`);
            return false;
        }
        return true;
    }

    _consumeBudget() {
        this.requestCount++;
        console.log(`[Brain] Budget used: ${this.requestCount}/${this.limit}`);
    }

    /**
     * Phase 4: Dynamic Context Loading (MindOS)
     * Prepares context based on current agent state/mode
     * @param {string} state - Current agent state (combat, crafting, building, etc.)
     * @returns {Promise<object>} Enriched context object
     */
    async prepareContext(state) {
        let context = {
            mode: state,
            timestamp: Date.now(),
            health: this.agent.bot.health,
            food: this.agent.bot.food,
            position: this.agent.bot.entity.position
        };

        // Dynamic context switching based on state
        switch (state) {
            case 'combat':
            case 'survival':
                context.combat = {
                    weapons: this._getWeaponsSummary(),
                    nearbyHostiles: this._getNearbyHostiles(),
                    armor: this._getArmorSummary()
                };
                break;

            case 'crafting':
            case 'resource_gathering':
                context.crafting = {
                    inventory: this._getInventorySummary(),
                    recipes: await this.agent.unifiedMemory.query('recipes', { limit: 3 })
                };
                break;

            case 'building':
                context.building = {
                    blueprint: this.agent.blueprintManager?.current?.name || 'none',
                    materials: this._getMaterialsSummary(),
                    location: this.agent.unifiedMemory.getPlace('construction_site')
                };
                break;

            default:
                // General context
                context.general = {
                    nearbyEntities: this._getNearbyEntities(5),
                    timeOfDay: this.agent.bot.time.timeOfDay
                };
        }

        return context;
    }

    // Phase 4 Helpers
    _getWeaponsSummary() {
        return this.agent.inventory.items().filter(i => i.name.includes('sword') || i.name.includes('bow')).map(i => i.name).join(', ');
    }

    _getNearbyHostiles() {
        // Use Vision if available, else standard bot find
        if (this.agent.vision) return this.agent.vision.getHostiles();
        return 'unknown';
    }

    _getArmorSummary() {
        return this.agent.bot.inventory.slots.slice(5, 9).map(i => i ? i.name : 'empty').join(', ');
    }

    _getInventorySummary() {
        return this.agent.inventory.items().map(i => `${i.name} x${i.count}`).join(', ');
    }

    _getMaterialsSummary() {
        return this.agent.inventory.items().filter(i => i.name.includes('log') || i.name.includes('stone') || i.name.includes('plank')).map(i => `${i.name} x${i.count}`).join(', ');
    }

    _getNearbyEntities(range) {
        // Simplified for context
        return Object.values(this.agent.bot.entities)
            .filter(e => e.position.distanceTo(this.agent.bot.entity.position) < range && e !== this.agent.bot.entity)
            .map(e => e.name || e.username)
            .join(', ');
    }

    /**
     * Legacy Enrichtment (Compat)
     * Enrich context with Cognee memory and skill catalog
     */
    async _enrichContext(context, worldId) {
        let enriched = [...context];

        // Inject Cognee memories
        if (this.cogneeMemory && worldId) {
            try {
                const lastUserMsg = context.filter(m => m.role === 'user').pop();
                if (lastUserMsg) {
                    const memoryResult = await this.cogneeMemory.recall(worldId, lastUserMsg.content, 3);

                    if (memoryResult.success && memoryResult.count > 0) {
                        const memoryContext = {
                            role: 'system',
                            content: `[MEMORY RECALL] Relevant past experiences:\n${memoryResult.results.join('\n')}`
                        };

                        const systemMsgIdx = enriched.findIndex(m => m.role === 'system');
                        if (systemMsgIdx >= 0) {
                            enriched.splice(systemMsgIdx + 1, 0, memoryContext);
                        } else {
                            enriched.unshift(memoryContext);
                        }

                        console.log(`[Brain] ✓ Injected ${memoryResult.count} memories`);
                    }
                }
            } catch (err) {
                console.warn('[Brain] Failed to enrich with Cognee:', err.message);
            }
        }

        // Inject Skill Catalog
        if (this.skillLibrary) {
            try {
                const skillSummary = this.skillLibrary.getSummary?.();

                if (skillSummary && !skillSummary.includes('No skills available')) {
                    const skillContext = {
                        role: 'system',
                        content: `[SKILL CATALOG] ${skillSummary}\n\nWhen relevant, suggest using existing skills.`
                    };

                    const insertIdx = enriched.length > 1 && enriched[1].content?.includes('[MEMORY RECALL]') ? 2 : 1;
                    enriched.splice(insertIdx, 0, skillContext);
                    console.log('[Brain] ✓ Injected skill catalog');
                }
            } catch (err) {
                console.warn('[Brain] Failed to inject skills:', err.message);
            }
        }

        return enriched;
    }

    /**
     * Enrich code prompt with skill catalog
     */
    async _enrichCodePrompt(prompt) {
        if (!this.skillLibrary) {
            return prompt;
        }

        try {
            const skillSummary = this.skillLibrary.getSummary?.();
            if (skillSummary && !skillSummary.includes('No skills available')) {
                return `${prompt}\n\n[AVAILABLE SKILLS]\n${skillSummary}`;
            }
        } catch (err) {
            console.warn('[Brain] Failed to enrich code prompt:', err.message);
        }

        return prompt;
    }
}
