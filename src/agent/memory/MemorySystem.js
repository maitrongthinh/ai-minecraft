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

        console.log('[MemorySystem] Backends connected:', {
            Graph: !!this.cognee,
            Vector: !!this.dreamer
        });

        this._setupListeners();
    }

    _setupListeners() {
        globalBus.subscribe(SIGNAL.ENVIRONMENT_SCAN, async (event) => {
            if (event.payload.analysis) {
                await this.absorb(DATA_TYPE.EXPERIENCE, {
                    facts: [event.payload.analysis],
                    metadata: { source: 'vision', timestamp: event.payload.timestamp }
                });
            }
        });
    }

    // ==================== RAM (MemoryBank) METHODS ====================
    rememberPlace(name, x, y, z) {
        this.ram[name.toLowerCase()] = [x, y, z];
        console.log(`[MemorySystem] 📍 Remembered ${name} at [${x}, ${y}, ${z}]`);
    }

    recallPlace(name) {
        return this.ram[name.toLowerCase()];
    }

    getKeys() {
        return Object.keys(this.ram).join(', ');
    }

    getJson() { return this.ram; }
    loadJson(json) { this.ram = json; }

    // ==================== MASTER QUERY & ABSORB ====================

    async query(question, options = {}) {
        this.stats.queries++;
        const cacheKey = question.toLowerCase().trim();
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            this.stats.hits.CACHE++;
            return { source: 'CACHE', data: cached.data };
        }

        // 1. RAM Check
        const placeMatch = question.match(/where is (.+)\??/i) || question.match(/(.+) location/i);
        if (placeMatch) {
            const pos = this.recallPlace(placeMatch[1]);
            if (pos) {
                this.stats.hits.RAM++;
                return { source: SOURCE.RAM, data: { type: 'location', pos } };
            }
        }

        // 2. Graph Check (Cognee)
        if (this.cognee && this.worldId) {
            try {
                const graphResult = await this.cognee.recall(this.worldId, question, options.limit || 10);
                if (graphResult?.results?.length > 0) {
                    this.stats.hits.GRAPH++;
                    return { source: SOURCE.GRAPH, data: graphResult.results };
                }
            } catch (e) { console.warn('[MemorySystem] Graph fail:', e.message); }
        }

        // 3. Vector Check (Dreamer)
        if (this.dreamer) {
            try {
                const vectorResult = await this.dreamer.searchMemories(question);
                if (vectorResult?.length > 0) {
                    this.stats.hits.VECTOR++;
                    return { source: SOURCE.VECTOR, data: vectorResult };
                }
            } catch (e) { console.warn('[MemorySystem] Vector fail:', e.message); }
        }

        return { source: null, data: null };
    }

    async absorb(type, data) {
        this.stats.absorbs++;
        try {
            switch (type) {
                case DATA_TYPE.LOCATION:
                    const { name, x, y, z } = data;
                    this.rememberPlace(name, x, y, z);
                    if (this.cognee) await this.cognee.storeExperience(this.worldId, [`Location "${name}" is at (${x}, ${y}, ${z})`], { type: 'location' });
                    break;
                case DATA_TYPE.EXPERIENCE:
                    if (this.cognee) await this.cognee.storeExperience(this.worldId, data.facts, data.metadata);
                    break;
                case DATA_TYPE.CHAT:
                    if (this.cognee) await this.cognee.storeExperience(this.worldId, [`${data.sender}: ${data.message}`], { type: 'chat', timestamp: Date.now() });
                    break;
                default:
                    if (this.cognee) await this.cognee.storeExperience(this.worldId, [typeof data === 'string' ? data : JSON.stringify(data)], { type: 'generic' });
            }
            globalBus.emitSignal(SIGNAL.MEMORY_STORED, { type, data });
        } catch (e) {
            console.error('[MemorySystem] Absorb fail:', e.message);
        }
    }

    // ==================== HISTORY & PERSISTENCE ====================

    getHistory() {
        return JSON.parse(JSON.stringify(this.turns));
    }

    async addChat(name, content) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        } else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({ role, content });

        // Vector Memory Absorb
        await this.absorb(DATA_TYPE.CHAT, { sender: name, message: content });

        // Rolling Window & Summarization
        if (this.turns.length > 50) {
            this.turns = this.turns.slice(-50);
        }

        if (this.turns.length >= this.max_messages) {
            let chunk = this.turns.splice(0, this.summary_chunk_size);
            while (this.turns.length > 0 && this.turns[0].role === 'assistant')
                chunk.push(this.turns.shift());

            await this.summarizeMemories(chunk);
        }

        this.triggerBackgroundSave();
    }

    // Legacy method alias for Agent.js (this.history.add)
    async add(name, content) { return this.addChat(name, content); }

    async summarizeMemories(turns) {
        if (!this.agent.prompter) return;
        console.log("[MemorySystem] Summarizing memories...");
        const newSummary = await this.agent.prompter.promptMemSaving(turns);
        this.memory = newSummary;

        if (this.memory.length > 500) {
            this.memory = this.memory.slice(0, 500) + '...(truncated)';
        }
    }


    // Error Tracking
    addError(action, error, context = {}) {
        this.errors.push({ action, error, context, timestamp: Date.now() });
        if (this.errors.length > this.maxErrors) this.errors.shift();
        console.log(`[MemorySystem] Reported Error: ${action} - ${error}`);
        this.triggerBackgroundSave();
    }

    getRecentErrors(n = 3) {
        return this.errors.slice(-n);
    }

    // Persistence
    triggerBackgroundSave() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        const interval = this.agent.config.profile?.system_intervals?.memory_save || 60000;

        this._saveTimer = setTimeout(() => {
            this.persistToDisk().catch(err => {
                console.error('[MemorySystem] Critical Background Save Failure:', err.message);
            });
        }, 5000); // Debounce
    }

    shutdown() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        // Force save on shutdown? Maybe dangerous if corrupted.
        // Let's just clear the timer as requested.
        console.log('[MemorySystem] 🛑 Shutdown: Timer cleared.');
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
