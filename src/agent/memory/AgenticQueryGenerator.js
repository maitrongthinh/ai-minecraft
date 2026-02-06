import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * AgenticQueryGenerator - Proactive Memory Recall System
 * 
 * Phase 5: Agentic RAG Enhancement
 * 
 * Instead of passive retrieval, this module:
 * 1. Analyzes goals/tasks to generate relevant queries
 * 2. Proactively fetches memories before they're needed
 * 3. Provides context-rich memory supplements for planning
 * 
 * Inspired by Agentic RAG: The agent decides WHAT to remember, not just HOW.
 */
export class AgenticQueryGenerator {
    constructor(agent) {
        this.agent = agent;

        // Query templates for different contexts
        this.queryTemplates = {
            planning: [
                'What resources do I have?',
                'Where is the nearest {resource}?',
                'What happened last time I tried to {action}?',
                'What dangers are in this area?',
                'Who is nearby?'
            ],
            combat: [
                'How do I fight {enemy}?',
                'What weapons do I have?',
                'Where is safe to retreat?',
                'What armor am I wearing?'
            ],
            building: [
                'What materials do I need for {structure}?',
                'Where did I last build?',
                'What blueprints do I know?'
            ],
            exploration: [
                'What biomes have I visited?',
                'Where is {location}?',
                'What landmarks do I know?',
                'Where did I find {resource} last time?'
            ],
            survival: [
                'Where is food?',
                'Where is shelter?',
                'What is my health history?',
                'What killed me last time?'
            ]
        };

        // Cache for query results
        this.queryCache = new Map();
        this.cacheMaxAge = 60000; // 1 minute

        console.log('[AgenticQueryGenerator] Initialized');
    }

    /**
     * Generate queries based on goal and context
     * @param {string} goal - Current goal or task
     * @param {object} context - Current bot context
     * @returns {Array<string>} - List of relevant queries
     */
    generateQueries(goal, context = {}) {
        const queries = [];
        const goalLower = goal.toLowerCase();

        // Detect goal type and add relevant templates
        const goalTypes = this._detectGoalTypes(goalLower);

        for (const type of goalTypes) {
            const templates = this.queryTemplates[type] || [];
            for (const template of templates) {
                const instantiated = this._instantiateTemplate(template, goal, context);
                if (instantiated && !queries.includes(instantiated)) {
                    queries.push(instantiated);
                }
            }
        }

        // Add goal-specific queries
        const specificQueries = this._generateSpecificQueries(goal, context);
        queries.push(...specificQueries);

        // Limit to most relevant
        return queries.slice(0, 8);
    }

    /**
     * Detect what types of activity the goal involves
     * @private
     */
    _detectGoalTypes(goalLower) {
        const types = [];

        const typeKeywords = {
            planning: ['plan', 'goal', 'task', 'want', 'need'],
            combat: ['kill', 'fight', 'attack', 'defend', 'mob', 'monster', 'zombie', 'skeleton', 'creeper'],
            building: ['build', 'house', 'shelter', 'structure', 'tower', 'wall', 'base'],
            exploration: ['find', 'explore', 'go to', 'search', 'locate', 'discover'],
            survival: ['survive', 'food', 'hunger', 'health', 'heal', 'eat', 'shelter']
        };

        for (const [type, keywords] of Object.entries(typeKeywords)) {
            if (keywords.some(k => goalLower.includes(k))) {
                types.push(type);
            }
        }

        // Default to planning if no specific type detected
        if (types.length === 0) {
            types.push('planning');
        }

        return types;
    }

    /**
     * Instantiate a template with context values
     * @private
     */
    _instantiateTemplate(template, goal, context) {
        let query = template;

        // Extract entities from goal
        const resources = this._extractResources(goal);
        const enemies = this._extractEnemies(goal);
        const locations = this._extractLocations(goal);
        const actions = this._extractActions(goal);

        // Replace placeholders
        if (query.includes('{resource}') && resources.length > 0) {
            query = query.replace('{resource}', resources[0]);
        } else if (query.includes('{resource}')) {
            return null; // Skip if no resource to substitute
        }

        if (query.includes('{enemy}') && enemies.length > 0) {
            query = query.replace('{enemy}', enemies[0]);
        } else if (query.includes('{enemy}')) {
            return null;
        }

        if (query.includes('{location}') && locations.length > 0) {
            query = query.replace('{location}', locations[0]);
        } else if (query.includes('{location}')) {
            return null;
        }

        if (query.includes('{action}') && actions.length > 0) {
            query = query.replace('{action}', actions[0]);
        } else if (query.includes('{action}')) {
            query = query.replace('{action}', goal); // Use full goal as action
        }

        if (query.includes('{structure}')) {
            const structures = ['house', 'shelter', 'base', 'tower', 'wall'];
            const found = structures.find(s => goal.toLowerCase().includes(s));
            query = query.replace('{structure}', found || 'structure');
        }

        return query;
    }

    /**
     * Generate goal-specific queries
     * @private
     */
    _generateSpecificQueries(goal, context) {
        const queries = [];
        const goalLower = goal.toLowerCase();

        // Resource gathering
        if (goalLower.includes('wood') || goalLower.includes('log')) {
            queries.push('Where are the nearest trees?');
            queries.push('Do I have an axe?');
        }

        if (goalLower.includes('stone') || goalLower.includes('cobblestone')) {
            queries.push('Where is exposed stone?');
            queries.push('Do I have a pickaxe?');
        }

        if (goalLower.includes('iron') || goalLower.includes('diamond')) {
            queries.push('Where did I last find iron?');
            queries.push('What Y level am I at?');
        }

        // Building
        if (goalLower.includes('build') || goalLower.includes('house')) {
            queries.push('Do I have enough materials?');
            queries.push('Where is a flat area?');
        }

        // Combat
        if (goalLower.includes('kill') || goalLower.includes('fight')) {
            queries.push('What is my current health?');
            queries.push('Do I have food?');
        }

        return queries;
    }

    /**
     * Extract resource names from goal
     * @private
     */
    _extractResources(goal) {
        const resources = [
            'wood', 'log', 'stone', 'cobblestone', 'iron', 'diamond', 'gold',
            'coal', 'redstone', 'lapis', 'emerald', 'food', 'wheat', 'seeds',
            'leather', 'feather', 'wool', 'string', 'bone', 'gunpowder'
        ];
        return resources.filter(r => goal.toLowerCase().includes(r));
    }

    /**
     * Extract enemy names from goal
     * @private
     */
    _extractEnemies(goal) {
        const enemies = [
            'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch',
            'phantom', 'drowned', 'husk', 'stray', 'blaze', 'ghast',
            'wither', 'ender dragon', 'pillager', 'vindicator', 'ravager'
        ];
        return enemies.filter(e => goal.toLowerCase().includes(e));
    }

    /**
     * Extract location names from goal
     * @private
     */
    _extractLocations(goal) {
        const locations = [
            'home', 'base', 'spawn', 'village', 'cave', 'mine', 'nether',
            'end', 'stronghold', 'fortress', 'temple', 'monument', 'outpost'
        ];
        return locations.filter(l => goal.toLowerCase().includes(l));
    }

    /**
     * Extract action verbs from goal
     * @private
     */
    _extractActions(goal) {
        const actions = [
            'build', 'mine', 'dig', 'craft', 'fight', 'kill', 'gather',
            'collect', 'find', 'explore', 'hunt', 'farm', 'breed', 'trade'
        ];
        return actions.filter(a => goal.toLowerCase().includes(a));
    }

    /**
     * Proactively fetch memories for a goal
     * @param {string} goal - Current goal
     * @param {object} context - Current context
     * @returns {Promise<object>} - Retrieved memories organized by type
     */
    async fetchProactiveMemories(goal, context = {}) {
        console.log(`[AgenticQueryGenerator] Fetching proactive memories for: "${goal}"`);

        const queries = this.generateQueries(goal, context);
        const memories = {
            resources: [],
            locations: [],
            experiences: [],
            entities: [],
            items: [],
            raw: []
        };

        // Check if UnifiedMemory is available
        if (!this.agent.unifiedMemory) {
            console.warn('[AgenticQueryGenerator] UnifiedMemory not available');
            return memories;
        }

        // Execute queries in parallel
        const queryPromises = queries.map(async (query) => {
            // Check cache
            const cacheKey = query.toLowerCase();
            if (this.queryCache.has(cacheKey)) {
                const cached = this.queryCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheMaxAge) {
                    return { query, result: cached.data };
                }
            }

            try {
                const result = await this.agent.unifiedMemory.query(query, { limit: 3 });

                // Cache result
                this.queryCache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });

                return { query, result };
            } catch (error) {
                console.warn(`[AgenticQueryGenerator] Query failed: ${query}`, error.message);
                return { query, result: null };
            }
        });

        const results = await Promise.allSettled(queryPromises);

        // Organize results
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.result?.data) {
                const { query, result: memResult } = result.value;
                const data = memResult.data;

                // Categorize by source/type
                memories.raw.push({ query, data, source: memResult.source });

                // Auto-categorize
                if (query.includes('resource') || query.includes('material')) {
                    memories.resources.push(data);
                } else if (query.includes('where') || query.includes('location')) {
                    memories.locations.push(data);
                } else if (query.includes('last time') || query.includes('happened')) {
                    memories.experiences.push(data);
                } else if (query.includes('who') || query.includes('enemy') || query.includes('mob')) {
                    memories.entities.push(data);
                } else if (query.includes('have') || query.includes('weapon') || query.includes('tool')) {
                    memories.items.push(data);
                }
            }
        }

        console.log(`[AgenticQueryGenerator] Retrieved ${memories.raw.length} memory results`);
        return memories;
    }

    /**
     * Generate a condensed context from memories
     * @param {object} memories - Retrieved memories
     * @returns {string} - Condensed context string
     */
    condenseMemories(memories) {
        const lines = [];

        if (memories.locations.length > 0) {
            lines.push('📍 Known Locations: ' +
                memories.locations.slice(0, 3).map(l =>
                    typeof l === 'string' ? l : JSON.stringify(l)
                ).join(', ')
            );
        }

        if (memories.resources.length > 0) {
            lines.push('📦 Resources: ' +
                memories.resources.slice(0, 3).map(r =>
                    typeof r === 'string' ? r : JSON.stringify(r)
                ).join(', ')
            );
        }

        if (memories.experiences.length > 0) {
            lines.push('📝 Past Experience: ' +
                memories.experiences.slice(0, 2).map(e =>
                    typeof e === 'string' ? e : JSON.stringify(e)
                ).join('; ')
            );
        }

        if (memories.items.length > 0) {
            lines.push('🎒 Inventory Notes: ' +
                memories.items.slice(0, 3).map(i =>
                    typeof i === 'string' ? i : JSON.stringify(i)
                ).join(', ')
            );
        }

        return lines.join('\n');
    }

    /**
     * Clear query cache
     */
    clearCache() {
        this.queryCache.clear();
        console.log('[AgenticQueryGenerator] Cache cleared');
    }
}
