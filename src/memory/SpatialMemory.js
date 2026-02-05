
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

            this.memory.set(key, entry);
            newItems++;
        }

        if (newItems > 0) {
            console.log(`[SpatialMemory] Updated ${newItems} items in short-term memory.`);
            // Simplify console output
            // console.log(Array.from(this.memory.values()).map(m => `${m.name} @ ${m.position}`));
        }

        // Auto-consolidate to Cognee if important
        await this._consolidateImportantMemories();
    }

    /**
     * Search for items in memory
     * @param {string} query - Item name or type (e.g., "chest", "iron_ore")
     * @param {Vec3} center - Optional center position to sort by distance
     * @returns {Array} - List of matching memory entries
     */
    search(query, center = null) {
        const results = [];
        const lowerQuery = query.toLowerCase();

        for (const entry of this.memory.values()) {
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
     * Get string representation for context injection
     * @param {number} maxItems 
     */
    getShortTermMemoryContext(maxItems = 10) {
        const recent = Array.from(this.memory.values())
            .sort((a, b) => b.last_seen - a.last_seen)
            .slice(0, maxItems);

        if (recent.length === 0) return "No recent visual memories.";

        return "Recent Visual Memories:\n" + recent.map(m =>
            `- ${m.name} at (${Math.floor(m.position.x)}, ${Math.floor(m.position.y)}, ${Math.floor(m.position.z)})`
        ).join('\n');
    }

    _generateKey(obs) {
        // Round coordinates to avoid duplicates for same block
        const x = Math.floor(obs.position.x);
        const y = Math.floor(obs.position.y);
        const z = Math.floor(obs.position.z);
        return `${obs.name}_${x}_${y}_${z}`;
    }

    async _consolidateImportantMemories() {
        // Send important items (rare ores, chests, structures) to Cognee
        // This prevents spamming Cognee with "grass_block"
        const IMPORTANT_KEYWORDS = ['chest', 'diamond', 'spawner', 'portal', 'village', 'structure', 'player'];

        const now = Date.now();
        // Only trigger every 5 mins or so to batch? No, do it immediately for "Important" stuff if first time seen

        for (const entry of this.memory.values()) {
            // Check if important AND not recently consolidated
            if (IMPORTANT_KEYWORDS.some(kw => entry.name.includes(kw)) && !entry.consolidated) {
                if (this.agent.cogneeMemory) {
                    await this.agent.cogneeMemory.storeExperience(
                        this.agent.world_id,
                        `I saw a ${entry.name} at coordinates ${entry.position}`,
                        'spatial_memory'
                    );
                    entry.consolidated = true; // Mark as sent
                    console.log(`[SpatialMemory] Consolidated to Cognee: ${entry.name}`);
                }
            }
        }
    }
}
