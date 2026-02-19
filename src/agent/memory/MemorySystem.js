/**
 * MemorySystem.js - Unified Memory & Perception System
 * 
 * Handles RAM (Places), Graph (Relationships), and Vector (Semantic Search).
 */

import { globalBus, SIGNAL } from '../core/SignalBus.js';
import fs from 'fs';
import settings from '../../../settings.js';

const SOURCE = {
    RAM: 'RAM',
    GRAPH: 'GRAPH',
    VECTOR: 'VECTOR'
};

const DATA_TYPE = {
    LOCATION: 'location',
    EXPERIENCE: 'experience',
    CHAT: 'chat',
    ENTITY: 'entity',
    ITEM: 'item',
    ERROR: 'error'
};

export class MemorySystem {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;

        // RAM Persistence
        this.memory_fp = `./bots/${this.name}/data/memory.json`;
        this.turns = []; // Chat history (RAM)
        this.memory = ''; // Long-term summary (RAM)
        this.errors = []; // Error tracking
        this.maxErrors = 10;
        this.max_messages = settings.max_messages || 20;
        this.summary_chunk_size = 5;
        this._saveTimer = null;
        this._savePending = false;

        // Internal RAM (Legacy MemoryBank)
        this.ram = {};

        // Backend references
        this.dreamer = null;
        this.queryGenerator = null;
        this.worldId = null;

        this.cache = new Map();
        this.cacheTimeout = 30000;
        this.stats = {
            queries: 0,
            hits: { RAM: 0, GRAPH: 0, VECTOR: 0, CACHE: 0 },
            absorbs: 0
        };

        console.log('[MemorySystem] 🧠 Master memory system initialized');
    }

    getHistory() {
        return [...this.turns]; // Return copy to prevent external mutation
    }

    updateName(name) {
        this.name = name;
        this.memory_fp = `./bots/${this.name}/data/memory.json`;
    }

    initialize() {
        this.dreamer = this.agent.dreamer;
        this.worldId = this.agent.world_id;
        this._unsubscribers = [];

        console.log('[MemorySystem] Backends connected:', {
            Graph: false,
            Vector: !!this.dreamer
        });

        this._setupListeners();
    }

    _setupListeners() {
        // Environment Scan
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.ENVIRONMENT_SCAN, async (event) => {
            if (event.payload.analysis) {
                await this.absorb(DATA_TYPE.EXPERIENCE, {
                    facts: [event.payload.analysis],
                    metadata: { source: 'vision', timestamp: event.payload.timestamp }
                });
            }
        }));

        // Task Completion (Success)
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.TASK_COMPLETED, async (event) => {
            const { taskId, taskName } = event.payload || {};
            if (taskName) {
                console.log(`[MemorySystem] 🧠 Memorizing success: ${taskName}`);
                await this.absorb(DATA_TYPE.EXPERIENCE, {
                    facts: [`Successfully completed task: ${taskName}`],
                    metadata: { source: 'action', status: 'success', taskId }
                });
            }
        }));

        // Task Failure
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.TASK_FAILED, async (event) => {
            const { task, error } = event.payload || {};
            if (task) {
                console.log(`[MemorySystem] 🧠 Memorizing failure: ${task}`);
                this.addError(task, error); // Also add to error log
                await this.absorb(DATA_TYPE.EXPERIENCE, {
                    facts: [`Failed task: ${task}. Reason: ${error}`],
                    metadata: { source: 'action', status: 'failed', error }
                });
            }
        }));

        // Phase 3 Fix: Wire up SOCIAL_INTERACTION
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.SOCIAL_INTERACTION, async (event) => {
            const { entity, message, sentiment } = event.payload || {};
            if (entity && message) {
                // Don't memorize own thoughts usually, but this event comes from SocialEngine interacting with others
                console.log(`[MemorySystem] 🧠 Memorizing social: ${entity}`);
                await this.absorb(DATA_TYPE.CHAT, {
                    role: entity,
                    content: message
                });

                // Also store as experience if significant
                if (sentiment && sentiment !== 'neutral') {
                    await this.absorb(DATA_TYPE.EXPERIENCE, {
                        facts: [`User ${entity} said "${message}" with ${sentiment} sentiment.`],
                        metadata: { source: 'social', entity, sentiment }
                    });
                }
            }
        }));
    }

    add(role, content) {
        if (typeof content === 'string' && content.includes('[BRAIN_DISCONNECTED]')) {
            console.log(`[MemorySystem] ⚠️ Skip adding disconnection marker to history.`);
            return;
        }

        // Ensure content is always a string (prevents [object Object] in history)
        let processedContent = content;
        if (typeof content !== 'string') {
            try {
                // If it's a plan object, extract the chat message
                if (content && content.chat) {
                    processedContent = content.chat;
                } else {
                    processedContent = JSON.stringify(content);
                }
            } catch (e) {
                processedContent = String(content);
            }
        }

        this.turns.push({ role, content: processedContent });
        if (this.turns.length > this.max_messages) {
            this.turns.shift();
        }
        this._savePending = false;
        this.save();
    }

    save() {
        if (this._savePending) return;
        this._savePending = true;

        if (this._saveTimer) clearTimeout(this._saveTimer);

        this._saveTimer = setTimeout(async () => {
            try {
                const data = {
                    memory: this.memory,
                    turns: this.turns,
                    errors: this.errors,
                    ram: this.ram
                };

                // Ensure directory exists
                const dir = this.memory_fp.substring(0, this.memory_fp.lastIndexOf('/'));
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                await fs.promises.writeFile(this.memory_fp, JSON.stringify(data, null, 2));
                this._savePending = false;
                // console.log('[MemorySystem] 💾 Saved memory to disk');
            } catch (err) {
                console.error('[MemorySystem] ❌ Save failed:', err);
                this._savePending = false;
            }
        }, 1000); // Debounce 1s
    }

    addError(task, error) {
        this.errors.push({ task, error, timestamp: Date.now() });
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }
        this.save();
    }

    async absorb(type, data) {
        // Simple absorb logic for Chat/Experience
        if (type === DATA_TYPE.CHAT) {
            this.add(data.role, data.content);
        } else if (type === DATA_TYPE.EXPERIENCE) {
            this.memory += (this.memory ? '\n' : '') + data.facts.join(' ');
            this.save();
        }
    }

    async query(queryStr, options = {}) {
        const limit = options.limit || 5;
        this.stats.queries++;

        // 1. Check RAM (Short-term/Task context)
        if (this.ram[queryStr]) {
            this.stats.hits.RAM++;
            return { source: SOURCE.RAM, data: this.ram[queryStr] };
        }

        // 2. Check Vector Memory (VectorStore)
        if (this.dreamer) {
            try {
                const results = await this.dreamer.search(queryStr, limit);
                if (results && results.length > 0) {
                    this.stats.hits.VECTOR++;
                    return { source: SOURCE.VECTOR, data: results };
                }
            } catch (err) {
                console.warn('[MemorySystem] Vector query failed:', err.message);
            }
        }

        return { source: 'NONE', data: null };
    }

    getPlace(id) {
        return this.ram[id] || null;
    }

    setPlace(id, data) {
        this.ram[id] = data;
        this.save();
    }

    load() {
        try {
            if (!fs.existsSync(this.memory_fp)) return null;
            const rawData = fs.readFileSync(this.memory_fp, 'utf8').trim();
            if (!rawData) {
                console.warn('[MemorySystem] Memory file is empty.');
                return null;
            }
            const data = JSON.parse(rawData);
            this.memory = data.memory || '';
            this.turns = data.turns || [];
            this.errors = data.errors || [];
            this.ram = data.ram || {};
            console.log(`[MemorySystem] Loaded ${this.turns.length} turns, ${this.errors.length} errors.`);
            return data;
        } catch (error) {
            console.error('[MemorySystem] Load failed:', error);
            return null;
        }
    }

    clear() {
        this.turns = [];
        this.memory = '';
        this.errors = [];
        this.ram = {};
    }

    // Agentic RAG helpers
    async getMemoryContext(goal) {
        if (!this.queryGenerator) {
            const { AgenticQueryGenerator } = await import('./AgenticQueryGenerator.js');
            this.queryGenerator = new AgenticQueryGenerator(this.agent);
        }
        const memories = await this.queryGenerator.fetchProactiveMemories(goal);
        return this.queryGenerator.condenseMemories(memories);
    }
}

export { SOURCE, DATA_TYPE };
