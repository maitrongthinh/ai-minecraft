/**
 * MemorySystem.js - Unified Memory & Perception System
 * 
 * Handles RAM (Places), Graph (Relationships), and Vector (Semantic Search).
 */

import { globalBus, SIGNAL } from '../core/SignalBus.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
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
        this.memory_fp = `./bots/${this.name}/memory.json`;
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
        this.cognee = null;
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
        return this.turns;
    }

    updateName(name) {
        this.name = name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
    }

    init() {
        this.cognee = this.agent.cogneeMemory;
        this.dreamer = this.agent.dreamer;
        this.worldId = this.agent.world_id;
        this._unsubscribers = [];

        console.log('[MemorySystem] Backends connected:', {
            Graph: !!this.cognee,
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

        // 2. Check Graph Memory (Cognee)
        if (this.cognee) {
            try {
                const results = await this.cognee.recall(this.worldId, queryStr, limit);
                const memories = Array.isArray(results)
                    ? results
                    : (results?.success ? (results.results || []) : []);
                if (memories.length > 0) {
                    this.stats.hits.GRAPH++;
                    return { source: SOURCE.GRAPH, data: memories };
                }
            } catch (err) {
                console.warn('[MemorySystem] Graph query failed:', err.message);
            }
        }

        // 3. Check Vector Memory (VectorStore)
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

    shutdown() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }

        // Unsubscribe all listeners
        if (this._unsubscribers) {
            this._unsubscribers.forEach(unsub => unsub());
            this._unsubscribers = [];
        }

        console.log('[MemorySystem] 🛑 Shutdown: Timer cleared & Listeners removed.');
    }

    async persistToDisk() {
        if (this._savePending) return;
        this._savePending = true;
        try {
            const data = JSON.stringify({
                memory: this.memory,
                turns: this.turns,
                errors: this.errors,
                ram: this.ram, // Save RAM too
                self_prompting_state: this.agent.self_prompter?.state,
                last_update: Date.now()
            }, null, 2);
            await writeFile(this.memory_fp, data, 'utf8');
            // console.log('[MemorySystem] Saved to disk.');
        } catch (err) {
            console.error('[MemorySystem] Save failed:', err.message);
        } finally {
            this._savePending = false;
        }
    }

    async save() { await this.persistToDisk(); }

    load() {
        try {
            if (!existsSync(this.memory_fp)) return null;
            const rawData = readFileSync(this.memory_fp, 'utf8').trim();
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
