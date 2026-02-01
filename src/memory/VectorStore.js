
import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';

const MEMORY_FILE = './memories.json';

export class VectorStore {
    constructor(agent) {
        this.agent = agent;
        this.memories = [];
        this.extractor = null;
        this.model_loaded = false;
        this.use_api = false;
        this.load();
    }

    async init() {
        if (this.model_loaded) return;
        console.log('[VectorStore] Loading embedding model...');
        try {
            this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            this.model_loaded = true;
            console.log('[VectorStore] Local model loaded (Xenova).');
        } catch (err) {
            console.warn('[VectorStore] Failed to load local embedding model. Falling back to API.', err);
            this.use_api = true;
            this.model_loaded = true;
        }
    }

    async getEmbedding(text) {
        if (this.use_api) {
            // Use Agent's embedding model (via prompter)
            if (this.agent && this.agent.prompter && this.agent.prompter.embedding_model) {
                // Ensure the model supports embedding or we mock it/use chat model feature?
                // Prompter has embedding_model. Assuming it has embed(text) or consistent interface.
                // Inspecting Prompter.js: it creates `embedding_model` from `_model_map`.
                // We assume it provides an `embed` method.
                try {
                    return await this.agent.prompter.embedding_model.embed(text);
                } catch (e) {
                    console.error('[VectorStore] API Embedding failed:', e);
                    return null;
                }
            } else {
                console.error('[VectorStore] No embedding model available.');
                return null;
            }
        } else {
            // Xenova
            const output = await this.extractor(text, { pooling: 'mean', normalize: true });
            return Array.from(output.data);
        }
    }

    load() {
        try {
            if (fs.existsSync(MEMORY_FILE)) {
                this.memories = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
                console.log(`[VectorStore] Loaded ${this.memories.length} memories.`);
            }
        } catch (err) {
            console.error('[VectorStore] Failed to load memories:', err);
            this.memories = [];
        }
    }

    save() {
        try {
            fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memories, null, 2));
        } catch (err) {
            console.error('[VectorStore] Failed to save memories:', err);
        }
    }

    async add(text, metadata = {}) {
        if (!this.model_loaded) await this.init();
        if (!text || text.trim().length === 0) return;

        try {
            const vector = await this.getEmbedding(text);
            if (!vector) return;

            const entry = {
                id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                text: text,
                vector: vector,
                metadata: metadata
            };

            this.memories.push(entry);
            this.save();
            console.log(`[VectorStore] Memorized: "${text.substring(0, 50)}..."`);
        } catch (err) {
            console.error('[VectorStore] Error adding memory:', err);
        }
    }

    async search(query, k = 5) {
        if (!this.model_loaded) await this.init();
        if (this.memories.length === 0) return [];

        try {
            const queryVector = await this.getEmbedding(query);
            if (!queryVector) return [];

            const scored = this.memories.map(mem => ({
                ...mem,
                score: this.cosineSimilarity(queryVector, mem.vector)
            }));

            // Sort by score DESC
            scored.sort((a, b) => b.score - a.score);

            return scored.slice(0, k).map(m => ({
                text: m.text,
                metadata: m.metadata,
                score: m.score,
                timestamp: m.timestamp
            }));
        } catch (err) {
            console.error('[VectorStore] Search error:', err);
            return [];
        }
    }

    cosineSimilarity(vecA, vecB) {
        // Dot product
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
