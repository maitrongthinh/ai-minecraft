import fs from 'fs';
import path from 'path';

export class GeneEngine {
    constructor(agent) {
        this.agent = agent;
        this.profilePath = agent.prompts.getProfilePath();

        // Genes file specific to this bot's profile
        this.genesFilePath = path.join(this.profilePath, 'genes.json');

        // Base defaults if the file does not exist (New born bot)
        this.baseGenes = {
            "combat": {
                "retreatHealth": 6,         // Health threshold to start retreating
                "attackRange": 2.5,         // Distance to swing sword
                "shieldDelayMs": 350,       // Ms to keep shield down while attacking
                "shieldCooldownMs": 1000,   // General cooldown before re-raising shield
                "hitAndRunDistance": 3      // Blocks to retreat when low
            },
            "survival": {
                "eatHealthThreshold": 14,   // Health threshold to prioritize food
                "eatFoodThreshold": 14,     // Hunger threshold to prioritize food
                "fallDamageLockMs": 2000    // MLG water bucket delay lock
            },
            "fitness": {
                "score": 0,
                "generation": 1,
                "kills": 0,
                "survivalTimeTicks": 0
            }
        };

        this.genes = JSON.parse(JSON.stringify(this.baseGenes));
        this.loadGenes();
    }

    /**
     * Load genes from profile file
     */
    loadGenes() {
        try {
            if (fs.existsSync(this.genesFilePath)) {
                const data = fs.readFileSync(this.genesFilePath, 'utf8');
                const loaded = JSON.parse(data);

                // Deep merge loaded genes over base genes
                this._merge(this.genes, loaded);
                console.log(`[GeneEngine] Loaded Generation ${this.genes.fitness.generation} genes with Fitness: ${this.genes.fitness.score.toFixed(1)}`);
            } else {
                console.log('[GeneEngine] First spawn. Generating base genes.');
                this.saveGenes();
            }
        } catch (err) {
            console.error('[GeneEngine] Failed to load genes. Using defaults.', err.message);
        }
    }

    /**
     * Save current genes to file
     */
    saveGenes() {
        try {
            // Ensure dir exists
            const dir = path.dirname(this.genesFilePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(this.genesFilePath, JSON.stringify(this.genes, null, 2));
        } catch (err) {
            console.error('[GeneEngine] Failed to save genes:', err.message);
        }
    }

    /**
     * Get a specific gene value
     * @param {string} category - e.g. 'combat'
     * @param {string} trait - e.g. 'attackRange'
     * @returns {number|null} 
     */
    getTrait(category, trait) {
        if (this.genes[category] && this.genes[category][trait] !== undefined) {
            return this.genes[category][trait];
        }
        return null;
    }

    /**
     * Update fitness stats during runtime
     */
    addKills(count = 1) {
        this.genes.fitness.kills += count;
        this.genes.fitness.score += count * 10; // 10 points per kill
        this.saveGenes();
    }

    addSurvivalTime(ticks) {
        this.genes.fitness.survivalTimeTicks += ticks;
        // 1 point per 20 ticks (1 second)
        this.genes.fitness.score += (ticks / 20);
        this.saveGenes();
    }

    /**
     * Deep merge helper
     */
    _merge(target, source) {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                Object.assign(source[key], this._merge(target[key], source[key]));
            }
        }
        Object.assign(target || {}, source);
        return target;
    }
}
