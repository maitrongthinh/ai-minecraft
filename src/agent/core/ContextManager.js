import { globalBus, SIGNAL } from './SignalBus.js';

/**
 * ContextManager - Hybrid Tiered Memory System
 * 
 * Implements 3-tier context optimization per MindOS Dual-Loop spec:
 * - Tier 1 (Immediate): Bot state, inventory, nearby entities
 * - Tier 2 (Relevant): RAG from UnifiedMemory 
 * - Tier 3 (Compressed): Historical summaries from Graph
 * 
 * System 1 (Fast Loop): Uses Tier 1 only (no async delay)
 * System 2 (Slow Loop): Uses all 3 tiers
 */
export class ContextManager {
    constructor(agent, maxTokens = 8000) {
        this.agent = agent;
        this.maxTokens = maxTokens;
        this.conversationHistory = [];
        this.compressionThreshold = maxTokens * 0.7; // Compress when 70% full

        console.log('[ContextManager] Initialized with max tokens:', maxTokens);
    }

    /**
     * Build context for LLM calls
     * @param {string} mode - 'reflex' (System 1) or 'planning' (System 2)
     * @returns {Object} Optimized context object
     */
    async buildContext(state = 'planning') {
        const start = Date.now();

        try {
            // Tier 1: Immediate Context (Base)
            // Filtered internally based on state if needed, but usually cheap enough
            const tier1 = this._buildImmediateContext();


            // === ADAPTIVE SWITCHING ===

            // 1. SURVIVAL / COMBAT State (Latency < 50ms)
            if (state === 'combat' || state === 'survival') {
                const latency = Date.now() - start;
                // PURGE chat history for focus
                const combatContext = {
                    timestamp: tier1.timestamp,
                    botState: {
                        health: tier1.botState.health,
                        food: tier1.botState.food,
                        position: tier1.botState.position,
                        equipment: tier1.inventory.filter(i => i.slot >= 36) // Hotbar only
                    },
                    nearbyThreats: tier1.nearbyMobs.filter(e => e.type !== 'player' || true), // Simplified threat list
                    target: this.agent.bot.pvp?.target ? {
                        position: this.agent.bot.pvp.target.position,
                        type: 'target'
                    } : null
                };
                console.log(`[ContextManager] ⚔️ Combat context built in ${latency}ms`);
                return combatContext;
            }

            // 2. CODING State
            if (state === 'coding') {
                // specialized context for coding tasks
                const codingContext = {
                    ...tier1,
                    // Load recent errors and relevant code snippets
                    errors: this.agent.history.getErrors().slice(-5),
                    referenceCode: "/* Reference existing skills if relevant */"
                };
                // Fetch relevant docs if possible
                const docs = await this._fetchRelevantMemories();
                codingContext.docs = docs;
                return codingContext;
            }

            // 3. PLANNING / DEFAULT State (System 2)
            // Include all tiers: Memory, Summaries, Full Inventory
            const [tier2, tier3] = await Promise.all([
                this._fetchRelevantMemories(),
                this._getSummaryNodes()
            ]);

            const merged = this._merge(tier1, tier2, tier3);

            const latency = Date.now() - start;
            console.log(`[ContextManager] 🧠 Planning context built in ${latency}ms`);

            return merged;

        } catch (error) {
            console.error('[ContextManager] Error building context:', error);
            // Fallback to immediate context only
            return this._buildImmediateContext();
        }
    }

    /**
     * Tier 1: Immediate Context (always fast, no async)
     * @private
     */
    _buildImmediateContext() {
        const bot = this.agent.bot;
        const context = {
            timestamp: Date.now(),

            // Recent conversation (last 10 messages)
            recentChat: this.conversationHistory.slice(-10),

            // Bot vital stats
            botState: {
                health: bot.health,
                food: bot.food,
                position: bot.entity.position,
                dimension: bot.game.dimension,
                gameMode: bot.game.gameMode,
                experience: bot.experience.level
            },

            // Current inventory snapshot
            inventory: this._serializeInventory(),

            // Nearby entities (within 16 blocks)
            nearbyMobs: this._getNearbyEntities(),

            // Current task (if any)
            currentTask: this.agent.scheduler?.currentTask?.name || null
        };

        return context;
    }

    /**
     * Tier 2: Fetch relevant memories from UnifiedMemory
     * @private
     */
    async _fetchRelevantMemories() {
        if (!this.agent.memory) {
            return { relevant: [] };
        }

        try {
            // Query based on current context
            const currentGoal = this.agent.scheduler?.currentTask?.name;
            const location = this.agent.bot.entity.position;

            const queries = [];

            // Query 1: Goal-based
            if (currentGoal) {
                queries.push(
                    this.agent.memory.query(
                        `What strategies work well for: ${currentGoal}`,
                        { limit: 2, source: 'both' }
                    )
                );
            }

            // Query 2: Location-based
            queries.push(
                this.agent.memory.query(
                    `What happened near coordinates ${Math.floor(location.x)}, ${Math.floor(location.z)}`,
                    { limit: 2, source: 'vector' }
                )
            );

            const results = await Promise.all(queries);
            const relevant = results
                .filter(r => r.success && r.data)
                .flatMap(r => r.data)
                .slice(0, 3); // Top 3 most relevant

            return { relevant };

        } catch (error) {
            console.error('[ContextManager] Error fetching memories:', error);
            return { relevant: [] };
        }
    }

    /**
     * Tier 3: Get compressed historical summaries
     * @private
     */
    async _getSummaryNodes() {
        if (!this.agent.memory) {
            return { summaries: [] };
        }

        try {
            // Query Cognee for conversation summaries
            const result = await this.agent.memory.query(
                'Summarize previous conversations and key learnings',
                { limit: 2, source: 'graph' }
            );

            const summaries = result.success && result.data ? result.data : [];

            return { summaries };

        } catch (error) {
            console.error('[ContextManager] Error fetching summaries:', error);
            return { summaries: [] };
        }
    }

    /**
     * Merge all tiers into single context object
     * @private
     */
    _merge(tier1, tier2, tier3) {
        return {
            ...tier1,
            relevantMemories: tier2.relevant || [],
            historicalSummaries: tier3.summaries || [],
            contextTiers: {
                immediate: true,
                relevant: (tier2.relevant || []).length > 0,
                historical: (tier3.summaries || []).length > 0
            }
        };
    }

    /**
     * Serialize inventory for context
     * @private
     */
    _serializeInventory() {
        const items = this.agent.bot.inventory.items();
        return items.map(item => ({
            name: item.name,
            count: item.count,
            slot: item.slot
        }));
    }

    /**
     * Get nearby entities (mobs, players)
     * @private
     */
    _getNearbyEntities() {
        const bot = this.agent.bot;
        const entities = Object.values(bot.entities)
            .filter(e => e !== bot.entity)
            .filter(e => bot.entity.position.distanceTo(e.position) < 16)
            .map(e => ({
                type: e.name,
                distance: Math.floor(bot.entity.position.distanceTo(e.position)),
                position: {
                    x: Math.floor(e.position.x),
                    y: Math.floor(e.position.y),
                    z: Math.floor(e.position.z)
                }
            }));

        return entities.slice(0, 10); // Max 10 entities
    }

    /**
     * Add message to conversation history
     */
    addMessage(role, content) {
        this.conversationHistory.push({
            role,
            content,
            timestamp: Date.now()
        });

        // Auto-compress if exceeding threshold
        this._autoCompress();
    }

    /**
     * Auto-compress old messages when threshold exceeded
     * @private
     */
    _autoCompress() {
        const estimatedTokens = this._estimateTokens(this.conversationHistory);

        if (estimatedTokens > this.compressionThreshold) {
            console.log('[ContextManager] Compressing conversation history...');

            // Keep last 10 messages
            const recent = this.conversationHistory.slice(-10);

            // Summarize older messages
            const older = this.conversationHistory.slice(0, -10);
            if (older.length > 0) {
                const summary = {
                    role: 'system',
                    content: `[Compressed ${older.length} older messages]`,
                    timestamp: Date.now()
                };

                this.conversationHistory = [summary, ...recent];

                // Optionally: Send to Cognee for long-term storage
                this._archiveOldMessages(older);
            }
        }
    }

    /**
     * Archive old messages to UnifiedMemory
     * @private
     */
    async _archiveOldMessages(messages) {
        if (!this.agent.memory || messages.length === 0) return;

        try {
            const summary = messages
                .map(m => `${m.role}: ${m.content}`)
                .join('\n');

            await this.agent.memory.absorb('chat', {
                sender: 'system_archive',
                message: summary
            });

            console.log(`[ContextManager] Archived ${messages.length} messages to MemorySystem`);

        } catch (error) {
            console.error('[ContextManager] Error archiving messages:', error);
        }
    }

    /**
     * Estimate token count (rough approximation)
     * @private
     */
    _estimateTokens(messages) {
        const text = JSON.stringify(messages);
        return Math.ceil(text.length / 4); // ~4 chars per token
    }

    /**
     * Clear conversation history (for testing)
     */
    clear() {
        this.conversationHistory = [];
        console.log('[ContextManager] Conversation history cleared');
    }
}
