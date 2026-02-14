
import fs from 'fs';
import path from 'path';
import { DynamicReflex } from './DynamicReflex.js';

export class ReflexCreatorEngine {
    constructor(agent) {
        this.agent = agent;
        this.reflexes = new Map(); // id -> DynamicReflex
        this.storagePath = null;
    }

    async init() {
        // Prepare storage
        const botName = this.agent.name || 'Agent';
        const dir = path.join(process.cwd(), 'bots', botName);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        this.storagePath = path.join(dir, 'dynamic_reflexes.json');

        this.loadReflexes();
    }

    loadReflexes() {
        if (!this.storagePath || !fs.existsSync(this.storagePath)) return [];

        try {
            const raw = fs.readFileSync(this.storagePath, 'utf8');
            const data = JSON.parse(raw);

            const loaded = [];
            for (const def of data) {
                try {
                    const reflex = new DynamicReflex(def);
                    this.reflexes.set(reflex.id, reflex);
                    loaded.push(reflex);
                } catch (e) {
                    console.error(`[ReflexCreator] Failed to load reflex ${def.id}:`, e);
                }
            }
            console.log(`[ReflexCreator] Loaded ${loaded.length} dynamic reflexes.`);
            return loaded;
        } catch (err) {
            console.error('[ReflexCreator] Error loading reflexes:', err);
            return [];
        }
    }

    saveReflexes() {
        if (!this.storagePath) return;

        const data = Array.from(this.reflexes.values()).map(r => r.toJSON());
        fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    }

    /**
     * Analyzes a death event and creates a new reflex if needed.
     * Uses the AI brain to generate reflex definitions.
     * @param {Object} deathAnalysis - Output from EvolutionEngine
     * @returns {DynamicReflex|null} The created reflex, or null
     */
    async analyzeAndCreate(deathAnalysis) {
        if (!deathAnalysis?.cause) {
            console.warn('[ReflexCreator] No death cause provided, skipping.');
            return null;
        }

        const reflexId = `dr_${deathAnalysis.cause.replace(/\s+/g, '_').toLowerCase()}`;

        // Skip if reflex already exists for this cause
        if (this.reflexes.has(reflexId)) {
            console.log(`[ReflexCreator] Reflex "${reflexId}" already exists, skipping.`);
            return null;
        }

        console.log(`[ReflexCreator] Creating reflex for cause: "${deathAnalysis.cause}"`);

        // Try to generate via AI brain
        const brain = this.agent?.brain;
        if (brain && typeof brain.generateCode === 'function') {
            try {
                const prompt = this._buildReflexPrompt(deathAnalysis);
                const response = await brain.generateCode(prompt);
                const reflexDef = this._parseReflexResponse(response, reflexId, deathAnalysis);

                if (reflexDef) {
                    const reflex = await this.registerReflex(reflexDef);
                    console.log(`[ReflexCreator] ✅ Created reflex: ${reflexId}`);
                    return reflex;
                }
            } catch (err) {
                console.error(`[ReflexCreator] AI generation failed: ${err.message}`);
            }
        }

        // Fallback: create a basic avoidance reflex from known patterns
        const fallbackDef = this._buildFallbackReflex(reflexId, deathAnalysis);
        if (fallbackDef) {
            const reflex = await this.registerReflex(fallbackDef);
            console.log(`[ReflexCreator] ✅ Created fallback reflex: ${reflexId}`);
            return reflex;
        }

        console.warn(`[ReflexCreator] Could not create reflex for "${deathAnalysis.cause}"`);
        return null;
    }

    /**
     * Build a prompt for the AI to generate a reflex definition
     */
    _buildReflexPrompt(deathAnalysis) {
        return `You are creating a survival reflex for a Minecraft bot (Mineflayer).

Death Analysis:
- Cause: ${deathAnalysis.cause}
- Context: ${JSON.stringify(deathAnalysis.context || {})}
- Message: ${deathAnalysis.message || 'unknown'}

MISSION:
Create a JSON definition for a DynamicReflex that prevents this death.
 The 'action' must be a JavaScript code snippet (async function body) that executes the survival strategy.
 Available variables in code: 'bot', 'agent', 'payload'.

JSON Format:
{
  "id": "dr_${deathAnalysis.cause.replace(/\s+/g, '_')}",
  "name": "Anti-${deathAnalysis.cause} Reflex",
  "trigger": {
      "signal": "<signal name>",
      "conditions": {} 
  },
  "action": {
      "type": "inline_code",
      "code": "<JavaScript code string>"
  },
  "priority": 5
}

Examples of code:
- "bot.setControlState('back', true); setTimeout(() => bot.setControlState('back', false), 1000);"
- "await bot.lookAt(payload.sourcePosition); bot.attack(payload.target);"

Available signals: THREAT_DETECTED, ENV_CLIFF_AHEAD, HEALTH_LOW, FOOD_LOW, DAMAGE_TAKEN, ENTITY_GONE
Respond with ONLY the JSON object.`;
    }

    /**
     * Parse AI response into reflex definition
     */
    _parseReflexResponse(response, reflexId, deathAnalysis) {
        try {
            const jsonMatch = String(response).match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            const parsed = JSON.parse(jsonMatch[0]);

            return {
                id: parsed.id || reflexId,
                name: parsed.name || `Anti-${deathAnalysis.cause}`,
                trigger: parsed.trigger || { signal: 'THREAT_DETECTED' },
                action: parsed.action || { type: 'inline_code', code: '// No action' },
                priority: parsed.priority || 5,
                createdAt: Date.now(),
                source: 'ai_generated'
            };
        } catch (e) {
            console.warn(`[ReflexCreator] Failed to parse AI response: ${e.message}`);
            return null;
        }
    }

    /**
     * Build a simple fallback reflex from known death patterns
     */
    _buildFallbackReflex(reflexId, deathAnalysis) {
        const cause = deathAnalysis.cause?.toLowerCase() || '';

        const patterns = {
            fall: {
                trigger: { signal: 'ENV_CLIFF_AHEAD' },
                code: "bot.setControlState('back', true); setTimeout(() => bot.setControlState('back', false), 500);",
                priority: 9
            },
            lava: {
                trigger: { signal: 'ENV_LAVA_NEARBY' },
                code: "bot.setControlState('jump', true); bot.setControlState('back', true); setTimeout(() => { bot.setControlState('jump', false); bot.setControlState('back', false); }, 500);",
                priority: 10
            },
            fire: {
                trigger: { signal: 'DAMAGE_TAKEN' },
                code: "const water = bot.findBlock({ matching: b => b.name === 'water', maxDistance: 10 }); if (water) { await bot.lookAt(water.position); bot.setControlState('forward', true); }",
                priority: 8
            },
            drown: {
                trigger: { signal: 'HEALTH_LOW', conditions: { 'val': 10 } }, // Simplified condition 
                code: "bot.setControlState('jump', true);",
                priority: 9
            },
            creeper: {
                trigger: { signal: 'THREAT_DETECTED' },
                code: "bot.setControlState('back', true); bot.setControlState('sprint', true); setTimeout(() => { bot.setControlState('back', false); bot.setControlState('sprint', false); }, 1500);",
                priority: 10
            }
        };

        for (const [key, template] of Object.entries(patterns)) {
            if (cause.includes(key)) {
                return {
                    id: reflexId,
                    name: `Anti-${deathAnalysis.cause} Reflex`,
                    trigger: template.trigger,
                    action: {
                        type: 'inline_code',
                        code: template.code
                    },
                    priority: template.priority,
                    createdAt: Date.now(),
                    source: 'fallback_pattern'
                };
            }
        }

        return null;
    }

    async registerReflex(def) {
        const reflex = new DynamicReflex(def);
        this.reflexes.set(reflex.id, reflex);
        this.saveReflexes();

        // Hot-load into system
        if (this.agent.core && this.agent.core.reflexSystem) {
            this.agent.core.reflexSystem.registerDynamicReflex(reflex);
        }

        return reflex;
    }
}
