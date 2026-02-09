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
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.TASK_COMPLETE, async (event) => {
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

    // ... (RAM methods remain) ...

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
            const data = JSON.parse(readFileSync(this.memory_fp, 'utf8'));
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
