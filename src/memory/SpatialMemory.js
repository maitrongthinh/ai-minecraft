
import { Vec3 } from 'vec3';

export class SpatialMemory {
    constructor(agent) {
        this.agent = agent;
        this.memory = new Map(); // Key: "id" or "type_x_y_z", Value: Object data
        this.lastConsolidation = Date.now();
        this.retentionTime = 1000 * 60 * 60; // 1 hour memory by default
    }

    /**
     * Update memory with new observations
     * @param {Array} observations - List of objects { type, name, position: {x,y,z}, distance, confidence }
     */
    async update(observations) {
        if (!Array.isArray(observations)) return;

        let newItems = 0;
        for (const obs of observations) {
            // Validate observation
            if (!obs.name || !obs.position) continue;

            const key = this._generateKey(obs);
            const existing = this.memory.get(key);

            // Create memory entry
            const entry = {
                id: key,
                type: obs.type || 'unknown',
                name: obs.name.toLowerCase(),
                position: new Vec3(obs.position.x, obs.position.y, obs.position.z),
                last_seen: Date.now(),
                confidence: obs.confidence || 1.0,
                // If existing, keep some metadata?
                count: (existing?.count || 0) + 1
            };
            console.log(`[SpatialMemory] Entry created: ${entry.name}, LastSeen: ${entry.last_seen}, Now: ${Date.now()}`);

            this.memory.set(key, entry);
            newItems++;
        }

        if (newItems > 0) {
            console.log(`[SpatialMemory] Updated ${newItems} items in short-term memory.`);
            // Simplify console output
            console.log(Array.from(this.memory.values()).map(m => `${m.name} @ ${m.position}`));
        }

        // Auto-consolidate to Cognee if important
        await this._consolidateImportantMemories();
    }

    /**
     * Search for items in memory (Enhanced)
     * @param {string} query - Item name or type (e.g., "chest", "iron_ore")
     * @param {Vec3} center - Optional center position to sort by distance
     * @param {number} maxAge - Optional max age in ms (default: retentionTime)
     * @returns {Array} - List of matching memory entries
     */
    search(query, center = null, maxAge = null) {
        this._cleanup(); // Lazy cleanup on search

        const results = [];
        const lowerQuery = query.toLowerCase();
        const cutoff = Date.now() - (maxAge || this.retentionTime);
        console.log(`[SpatialMemory] Search Query: "${lowerQuery}", Cutoff: ${cutoff}, Entries: ${this.memory.size}`);

        for (const entry of this.memory.values()) {
            if (entry.last_seen < cutoff) {
                // console.log(`[SpatialMemory] Entry ${entry.name} too old. Seen: ${entry.last_seen}`);
                continue;
            }

            // console.log(`[SpatialMemory] Checking ${entry.name} vs ${lowerQuery}`);
            if (entry.name.includes(lowerQuery) || entry.type.includes(lowerQuery)) {
                results.push(entry);
            }
        }

        if (center) {
            results.sort((a, b) => a.position.distanceTo(center) - b.position.distanceTo(center));
        }

        return results;
    }

    /**
     * Get memory statistics
     */
    getStats() {
        return {
            count: this.memory.size,
            types: [...new Set([...this.memory.values()].map(e => e.type))]
        };
    }

    _generateKey(obs) {
        // Round coordinates to avoid duplicates for same block
        const x = Math.floor(obs.position.x);
        const y = Math.floor(obs.position.y);
        const z = Math.floor(obs.position.z);
        return `${obs.name}_${x}_${y}_${z}`;
    }

    _cleanup() {
        const now = Date.now();
        // Only cleanup every 5 minutes or so to save cycles
        if (now - this.lastConsolidation < 300000) return;

        let removed = 0;
        for (const [key, entry] of this.memory) {
            if (now - entry.last_seen > this.retentionTime) {
                this.memory.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[SpatialMemory] Pruned ${removed} old memories.`);
        }
        this.lastConsolidation = now;
    }

    async _consolidateImportantMemories() {
        // Consolidated to UnifiedMemory (VectorStore) via Dreamer if needed.
        // Legacy Cognee support removed.
    }
}
