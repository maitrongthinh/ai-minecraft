/**
 * UnifiedMemory.js - Unified Memory Access Layer (UMAL)
 * 
 * Phase 4: MindOS Kernel
 * 
 * Single query interface for all memory systems:
 * - RAM (MemoryBank) - Instant, key-value
 * - Graph (CogneeMemory) - Structured, relationships
 * - Vector (VectorStore via Dreamer) - Semantic, embeddings
 * 
 * Auto-routing: Determines which backend to use based on data type.
 */

import { globalBus, SIGNAL } from '../core/SignalBus.js';

// Memory sources
const SOURCE = {
    RAM: 'RAM',
    GRAPH: 'GRAPH',
    VECTOR: 'VECTOR'
};

// Data types for auto-routing
const DATA_TYPE = {
    LOCATION: 'location',
    EXPERIENCE: 'experience',
    CHAT: 'chat',
    ENTITY: 'entity',
    ITEM: 'item',
    ERROR: 'error'
};

export class UnifiedMemory {
    constructor(agent) {
        this.agent = agent;

        // Backend references (will be set during init)
        this.memoryBank = null;   // RAM - fast key-value
        this.cognee = null;       // Graph - structured
        this.dreamer = null;      // Vector - semantic

        // Phase 5: Agentic RAG - Proactive recall
        this.queryGenerator = null; // Will be set after import

        // World ID for Cognee
        this.worldId = null;

        // Query cache (short-term)
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30s TTL

        // Stats
        this.stats = {
            queries: 0,
            hits: { RAM: 0, GRAPH: 0, VECTOR: 0, CACHE: 0 },
            absorbs: 0
        };

        console.log('[UnifiedMemory] 🧠 UMAL initialized');
    }

    /**
     * Initialize with agent's memory backends
     */
    init() {
        this.memoryBank = this.agent.memory_bank;
        this.cognee = this.agent.cogneeMemory;
        this.dreamer = this.agent.dreamer;
        this.worldId = this.agent.world_id;

        console.log('[UnifiedMemory] Backends connected:', {
            RAM: !!this.memoryBank,
            Graph: !!this.cognee,
            Vector: !!this.dreamer
        });

        // Phase 1: Nervous System Wiring
        this._setupListeners();
    }

    /**
     * Setup Event Listeners
     */
    _setupListeners() {
        // Listen for new memories
        globalBus.subscribe(SIGNAL.MEMORY_STORED, (event) => {
            // Log or further processing if needed
            // console.log(`[UnifiedMemory] 📥 Memory stored: ${event.payload.type}`);
        });

        // Listen for Environment Scans (Vision)
        globalBus.subscribe(SIGNAL.ENVIRONMENT_SCAN, async (event) => {
            if (event.payload.analysis) {
                // Determine type based on analysis content
                let type = DATA_TYPE.EXPERIENCE;
                // Store in background
                await this.absorb(type, {
                    facts: [event.payload.analysis],
                    metadata: { source: 'vision', timestamp: event.payload.timestamp }
                });
            }
        });
    }

    /**
     * Query across all memory tiers
     * @param {string} question - What to remember
     * @param {object} options - Query options
     * @returns {Promise<{source: string, data: any}>}
     */
    async query(question, options = {}) {
        this.stats.queries++;

        // Check cache first
        const cacheKey = question.toLowerCase().trim();
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            this.stats.hits.CACHE++;
            return { source: 'CACHE', data: cached.data };
        }

        // Tier 1: RAM (MemoryBank) - Instant lookup
        if (this.memoryBank) {
            const ramResult = this._queryRAM(question);
            if (ramResult) {
                this.stats.hits.RAM++;
                this._cacheResult(cacheKey, ramResult);
                return { source: SOURCE.RAM, data: ramResult };
            }
        }

        // Tier 2: Graph (Cognee) - Structured relationships
        if (this.cognee && this.worldId) {
            try {
                const graphResult = await this._queryGraph(question, options.limit || 5);
                if (graphResult?.results?.length > 0) {
                    this.stats.hits.GRAPH++;
                    this._cacheResult(cacheKey, graphResult.results);
                    return { source: SOURCE.GRAPH, data: graphResult.results };
                }
            } catch (e) {
                console.warn('[UnifiedMemory] Graph query failed:', e.message);
            }
        }

        // Tier 3: Vector (Dreamer) - Semantic search
        if (this.dreamer) {
            try {
                const vectorResult = await this._queryVector(question, options.limit || 5);
                if (vectorResult?.length > 0) {
                    this.stats.hits.VECTOR++;
                    this._cacheResult(cacheKey, vectorResult);
                    return { source: SOURCE.VECTOR, data: vectorResult };
                }
            } catch (e) {
                console.warn('[UnifiedMemory] Vector query failed:', e.message);
            }
        }

        // Nothing found
        return { source: null, data: null };
    }

    /**
     * Absorb new data - auto-routes to appropriate backend
     * @param {string} type - Data type (location, experience, chat, etc.)
     * @param {object} data - Data to store
     */
    async absorb(type, data) {
        this.stats.absorbs++;

        try {
            switch (type) {
                case DATA_TYPE.LOCATION:
                    await this._absorbLocation(data);
                    break;

                case DATA_TYPE.EXPERIENCE:
                    await this._absorbExperience(data);
                    break;

                case DATA_TYPE.CHAT:
                    await this._absorbChat(data);
                    break;

                case DATA_TYPE.ENTITY:
                    await this._absorbEntity(data);
                    break;

                case DATA_TYPE.ITEM:
                    await this._absorbItem(data);
                    break;

                case DATA_TYPE.ERROR:
                    await this._absorbError(data);
                    break;

                default:
                    // Default: store to both Graph and Vector
                    await this._absorbGeneric(data);
            }

            // Emit signal
            globalBus.emitSignal(SIGNAL.MEMORY_STORED, { type, data });

        } catch (e) {
            console.error('[UnifiedMemory] Absorb failed:', e.message);
        }
    }

    // ==================== QUERY IMPLEMENTATIONS ====================

    /**
     * Query RAM (MemoryBank)
     */
    _queryRAM(question) {
        // Check if it's a place query
        const placeMatch = question.match(/where is (.+)\??/i) ||
            question.match(/(.+) location/i) ||
            question.match(/find (.+)/i);

        if (placeMatch) {
            const placeName = placeMatch[1].toLowerCase().trim();
            const result = this.memoryBank.recallPlace(placeName);
            if (result) {
                return { type: 'location', name: placeName, pos: result };
            }
        }

        // Direct lookup
        const direct = this.memoryBank.recallPlace(question.toLowerCase());
        if (direct) {
            return { type: 'location', name: question, pos: direct };
        }

        return null;
    }

    /**
     * Query Graph (Cognee)
     */
    async _queryGraph(question, limit) {
        return await this.cognee.recall(this.worldId, question, limit);
    }

    /**
     * Query Vector (Dreamer)
     */
    async _queryVector(question, limit) {
        return await this.dreamer.searchMemories(question);
    }

    // ==================== ABSORB IMPLEMENTATIONS ====================

    /**
     * Absorb location data
     */
    async _absorbLocation(data) {
        const { name, x, y, z } = data;

        // RAM: Fast lookup
        if (this.memoryBank) {
            this.memoryBank.rememberPlace(name, x, y, z);
        }

        // Graph: Structured storage
        if (this.cognee && this.worldId) {
            await this.cognee.storeExperience(
                this.worldId,
                [`Location "${name}" is at coordinates (${x}, ${y}, ${z})`],
                { type: 'location' }
            );
        }

        // Invalidate cache
        this.cache.delete(name.toLowerCase());
    }

    /**
     * Absorb experience/fact
     */
    async _absorbExperience(data) {
        const { facts, metadata = {} } = data;

        // Graph: Primary storage for structured facts
        if (this.cognee && this.worldId) {
            await this.cognee.storeExperience(this.worldId, facts, metadata);
        }

        // Vector: Also store for semantic search
        if (this.dreamer) {
            for (const fact of facts) {
                await this.dreamer.vectorStore.add(fact, metadata);
            }
        }
    }

    /**
     * Absorb chat message
     */
    async _absorbChat(data) {
        const { sender, message, timestamp = Date.now() } = data;

        // Vector: Primary storage for conversations
        if (this.dreamer) {
            await this.dreamer.vectorStore.add(
                `${sender}: ${message}`,
                { type: 'chat', timestamp }
            );
        }
    }

    /**
     * Absorb entity sighting
     */
    async _absorbEntity(data) {
        const { entityType, position, action } = data;

        // Graph: Store entity encounters
        if (this.cognee && this.worldId) {
            await this.cognee.storeExperience(
                this.worldId,
                [`Saw ${entityType} at (${position.x}, ${position.y}, ${position.z}) - ${action || 'observed'}`],
                { type: 'entity', entityType }
            );
        }
    }

    /**
     * Absorb item discovery
     */
    async _absorbItem(data) {
        const { item, location, action } = data;

        // Graph: Store item info
        if (this.cognee && this.worldId) {
            const fact = location
                ? `Found ${item} at ${location.name || 'unknown location'}`
                : `Obtained ${item} by ${action || 'unknown means'}`;

            await this.cognee.storeExperience(
                this.worldId,
                [fact],
                { type: 'item', item }
            );
        }
    }

    /**
     * Absorb error for learning
     */
    async _absorbError(data) {
        const { error, context, solution } = data;

        // Graph: Store for EvolutionEngine learning
        if (this.cognee && this.worldId) {
            const facts = [
                `Error: ${error}`,
                `Context: ${JSON.stringify(context)}`,
                solution ? `Solution: ${solution}` : null
            ].filter(Boolean);

            await this.cognee.storeExperience(
                this.worldId,
                facts,
                { type: 'error' }
            );
        }
    }

    /**
     * Generic absorb (fallback)
     */
    async _absorbGeneric(data) {
        const text = typeof data === 'string' ? data : JSON.stringify(data);

        // Vector: Store as text
        if (this.dreamer) {
            await this.dreamer.vectorStore.add(text, { type: 'generic' });
        }
    }

    // ==================== UTILITIES ====================

    /**
     * Cache a query result
     */
    _cacheResult(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });

        // Cleanup old entries
        if (this.cache.size > 100) {
            const now = Date.now();
            for (const [k, v] of this.cache) {
                if (now - v.timestamp > this.cacheTimeout) {
                    this.cache.delete(k);
                }
            }
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get stats
     */
    getStats() {
        return { ...this.stats, cacheSize: this.cache.size };
    }

    /**
     * Get place directly (convenience method)
     */
    getPlace(name) {
        if (!this.memoryBank) return null;
        return this.memoryBank.recallPlace(name);
    }

    /**
     * Remember place directly (convenience method)
     */
    rememberPlace(name, x, y, z) {
        return this.absorb(DATA_TYPE.LOCATION, { name, x, y, z });
    }

    // ===== Phase 5: Agentic RAG - Proactive Recall =====

    /**
     * Initialize AgenticQueryGenerator (lazy load to avoid circular deps)
     */
    async initAgenticRAG() {
        if (!this.queryGenerator) {
            const { AgenticQueryGenerator } = await import('./AgenticQueryGenerator.js');
            this.queryGenerator = new AgenticQueryGenerator(this.agent);
            console.log('[UnifiedMemory] Agentic RAG initialized');
        }
    }

    /**
     * Proactively fetch memories relevant to a goal
     * @param {string} goal - Current goal/task
     * @param {object} context - Additional context
     * @returns {Promise<object>} - Organized relevant memories
     */
    async proactiveRecall(goal, context = {}) {
        // Ensure Agentic RAG is initialized
        await this.initAgenticRAG();

        if (!this.queryGenerator) {
            console.warn('[UnifiedMemory] AgenticQueryGenerator not available');
            return { raw: [] };
        }

        return await this.queryGenerator.fetchProactiveMemories(goal, context);
    }

    /**
     * Generate queries for a goal (without executing)
     * @param {string} goal - Current goal
     * @param {object} context - Additional context
     * @returns {Array<string>} - List of relevant queries
     */
    async generateQueries(goal, context = {}) {
        await this.initAgenticRAG();

        if (!this.queryGenerator) {
            return [];
        }

        return this.queryGenerator.generateQueries(goal, context);
    }

    /**
     * Get condensed memory context for planning
     * @param {string} goal - Current goal
     * @returns {Promise<string>} - Condensed memory context
     */
    async getMemoryContext(goal) {
        const memories = await this.proactiveRecall(goal);

        if (!this.queryGenerator) {
            return '';
        }

        return this.queryGenerator.condenseMemories(memories);
    }

    /**
     * Batch query multiple questions efficiently
     * @param {Array<string>} questions - Questions to query
     * @returns {Promise<Array>} - Results for each query
     */
    async batchQuery(questions) {
        const results = await Promise.allSettled(
            questions.map(q => this.query(q))
        );

        return results.map((r, i) => ({
            question: questions[i],
            success: r.status === 'fulfilled',
            result: r.status === 'fulfilled' ? r.value : null,
            error: r.status === 'rejected' ? r.reason?.message : null
        }));
    }
}

export { SOURCE, DATA_TYPE };
export default UnifiedMemory;
