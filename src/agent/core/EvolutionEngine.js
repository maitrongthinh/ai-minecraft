import fs from 'fs';
import path from 'path';

/**
 * EvolutionEngine.js - The Self-Correction Loop
 * 
 * Converts failures into new skills and optimizes combat parameters.
 * 
 * 4-Step Evolution Process:
 * 1. Detection  - Capture full context when task fails
 * 2. Analysis   - Check if similar error was solved before (UnifiedMemory)
 * 3. Sanitization - Validate AI-generated code in sandbox
 * 4. Hot-Swap   - Load new skill into memory without restart
 * 
 * + Phase 2: Genetic Learning - Optimizes combat parameters based on win/loss.
 */

import { SafetySandwich } from '../safety/SafetySandwich.js';
import { RollbackManager } from '../safety/RollbackManager.js';
import { CODER_SYSTEM_PROMPT } from '../../prompts/CoderPrompt.js';
import { globalBus, SIGNAL } from './SignalBus.js';
import { ToolCreatorEngine } from './ToolCreatorEngine.js';
import { ReflexCreatorEngine } from '../../evolution/ReflexCreatorEngine.js';

// Error signature for deduplication
function hashError(error, intent) {
    const normalized = `${intent}:${error.replace(/[0-9]+/g, 'N')}`;
    return Buffer.from(normalized).toString('base64').slice(0, 16);
}

export class EvolutionEngine {
    constructor(agent) {
        this.agent = agent;
        this.safety = new SafetySandwich(agent);
        this.rollbackManager = new RollbackManager(agent);

        // Track pending fixes to avoid duplicate requests
        this.pendingFixes = new Map();
        this.errorHistory = new Map();
        this.system2Failures = [];
        this.maxFailureHistory = 50;

        // Phase 2: Action Optimization Registry
        this.actionStats = new Map();

        // Genome Path
        this.genomePath = path.join(process.cwd(), 'data', 'genome.json');

        // Phase 2: Genetic Memory (Instincts) - Default values
        this.genome = {
            // Survival Instincts
            survival_health_threshold: 6, // HP to flee
            survival_panic_distance: 10,  // Blocks to run
            survival_drowning_tolerance: 10, // Oxygen level to panic
            // Combat Genetics
            combat_strafe_distance: 2.5,
            combat_attack_urgency: 1.0,
            combat_reach_distance: 3.0
        };

        // Load persisted genome
        this.loadGenome();

        // Phase 4: Dynamic Reflex Creator
        this.reflexCreator = new ReflexCreatorEngine(agent);

        // Phase 7: MCP Tool Creator
        this.toolCreator = new ToolCreatorEngine(agent);

        // Phase 4.5: Auto-Correction Listener
        globalBus.subscribe(SIGNAL.TASK_FAILED, async (event) => {
            console.log('[EvolutionEngine] 👂 Heard TASK_FAILED. Analyzing...');
            const snapshot = this.captureSnapshot(event.payload.task, event.payload.error);
            await this.requestFix(snapshot);
        });

        // Phase 3: Death Analysis (Adaptive Mind)
        globalBus.subscribe(SIGNAL.DEATH, async (event) => {
            console.log('[EvolutionEngine] 💀 Death detected. Initiating Retrospective Analysis...');
            this.mutateSurvivalGenome('death');

            // Phase 3 & 4: Dual Analysis (Replay + Reflex)
            await Promise.all([
                this._analyzeDeathReplay(event.payload),
                this._proposeDeathReflex(event.payload)
            ]);
        });

        // Phase 3.1: Survival Reflex Evolution — mutate on near-death
        globalBus.subscribe(SIGNAL.HEALTH_CRITICAL, async () => {
            this.mutateSurvivalGenome('near_death');
        });

        // Phase 6: System 2 Integration
        globalBus.subscribe(SIGNAL.SYSTEM2_DEGRADED, async (event) => {
            console.log('[EvolutionEngine] 👂 System 2 DEGRADED. Recording failure pattern...');
            await this._trackSystem2Failure(event.payload);
        });

        // Fix: Use correct SIGNAL from SignalBus
        globalBus.subscribe(SIGNAL.SKILL_FAILED, async (event) => {
            console.log('[EvolutionEngine] 👂 Skill FAILED. Analyzing for evolution...');
            const snapshot = this.captureSnapshot(
                { name: event.payload.skillName || event.payload.name, params: event.payload.params },
                new Error(event.payload.error)
            );
            await this.requestFix(snapshot);
        });


        // Phase 7: Tool Creator Trigger
        globalBus.subscribe(SIGNAL.TOOL_NEEDED, async (event) => {
            console.log(`[EvolutionEngine] 🛠️ TOOL_NEEDED: "${event.payload.desc}"`);
            if (this.toolCreator) {
                await this.toolCreator.createTool(event.payload.desc, event.payload.reason);
            }
        });

        // Phase 2 Fix: Connecting the Learning Loop
        globalBus.subscribe(SIGNAL.CODE_GENERATED, async (event) => {
            if (event.payload.success) {
                console.log(`[Evolution] 🧬 Code generated. Evolving...`);
                // Potential for reflex integration or just logging for now
                if (event.payload.type === 'reflex') {
                    // Reflexes are auto-loaded by ReflexSystem usually, but we can track stats
                }
            }
        });


        // Stats for monitoring
        this.stats = {
            capturedErrors: 0,
            generatedSkills: 0,
            failedGenerations: 0,
            usedCachedSkills: 0,
            registeredToToolRegistry: 0,
            system2FailuresTracked: 0,
            combatWins: 0,
            combatLosses: 0
        };

        console.log('[EvolutionEngine] ⚡ Initialized - Ready to evolve');
    }

    // ... (Getters and Helper methods remain unchanged) ...

    async validateCode(code) {
        return this.safety.validate(code);
    }

    async deploySkill(name, code, snapshot) {
        try {
            const skillLibrary = this.agent.skillLibrary;
            if (!skillLibrary) return false;

            // Phase 5.4: Semantic Review (Deduplication)
            const summary = await skillLibrary.getSummary();
            const reviewPrompt = `
            Task: ${snapshot.taskName}
            New Code:
            ${code.substring(0, 500)}
            
            Existing Skills:
            ${summary}
            
            Analyze: Is this new code redundant with an existing skill?
            Return JSON: {"isDuplicate": boolean, "mergeWith": "name_or_null", "reason": "string"}
            `;

            let decision = { isDuplicate: false };
            try {
                const response = await this.agent.brain.ask(reviewPrompt);
                const cleanResponse = response.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
                decision = JSON.parse(cleanResponse);
            } catch (e) {
                console.warn('[EvolutionEngine] Semantic review failed, proceeding with safety default.');
            }

            if (decision.isDuplicate) {
                console.log(`[EvolutionEngine] 🛑 Skill redundant with ${decision.mergeWith}. Reason: ${decision.reason}`);
                return true;
            }

            // Phase 6: Backup before overwrite
            // If the skill already exists, we must back it up
            // Note: skillLibrary.getSkill().path could be used if available
            // For now, let rollback manager handle backup if source exists
            // await this.rollbackManager.backupSkill(name, existingPath); 
            // (RollbackManager needs path, but we might not know it easily without registry. 
            // Ideally ToolRegistry handles this via event, but we can do it proactively here if we know the path)

            if (typeof skillLibrary.hotSwap === 'function') {
                await skillLibrary.hotSwap(name, code, `Fix for ${snapshot.errorMessage}`);
            } else {
                skillLibrary.addSkill(name, code, `Fix for ${snapshot.errorMessage}`);
            }
            await this.registerWithToolRegistry(name, code, snapshot);
            globalBus.emitSignal(SIGNAL.SKILL_LEARNED, { name, source: 'evolution' });
            return true;
        } catch (e) { return false; }
    }

    async registerWithToolRegistry(name, code, snapshot) {
        if (!this.agent.toolRegistry) return false;
        try {
            const metadata = { name, description: `Evolved fix: ${snapshot.errorMessage}`, parameters: { type: 'object', properties: {} }, returns: { type: 'object' } };
            const executor = async (agent, params) => {
                // CodeSandbox.execute now correctly only takes code
                // Complex object passing is handled via external hooks if needed, 
                // but for now we follow the "Reflex" pattern of isolated execution.
                const result = await this.sandbox.execute(code);
                return { success: true, result };
            };
            await this.agent.toolRegistry.registerDynamicSkill(name, metadata, executor);
            return true;
        } catch (e) { return false; }
    }

    async _trackSystem2Failure(payload) {
        this.system2Failures.push({ ...payload, timestamp: Date.now() });
        if (this.system2Failures.length > this.maxFailureHistory) this.system2Failures.shift();

        // Phase 7: Tool Creation Trigger
        if (payload.reason === 'no_tool_available' || (payload.error && payload.error.includes('No tool'))) {
            console.log('[EvolutionEngine] 💡 Missing tool detected. Triggering Tool Creator...');
            if (this.toolCreator) {
                await this.toolCreator.createTool(payload.task, payload.context);
            }
        }
    }

    /**
     * Phase 3: Analyze death events using ReplayBuffer
     */
    async _analyzeDeathReplay(payload) {
        if (!this.agent.replayBuffer) return;

        // 1. Freeze and Export state
        this.agent.replayBuffer.freeze();
        const replayPath = await this.agent.replayBuffer.exportToDisk();

        const history = this.agent.replayBuffer.getFormattedHistory();
        const prompt = `
[RETROSPECTIVE ANALYSIS]
The bot has died. Replay log exported to: ${replayPath}

History (last 30s):
${history}

MISSION:
Identify the cause of death and suggest a specific tactical improvement or "Lesson Learned".
Format your response as a single, concise factual sentence for memory storage.
Example: "I died because I was overwhelmed by 3 skeletons while having low health; I should retreat earlier when outnumbered."
`.trim();

        console.log('[EvolutionEngine] 🧠 Consulting brain for death analysis...');
        let analysis = null;
        if (this.agent.brain) {
            analysis = await this.agent.brain.generateReflexCode(prompt); // Reusing generator for text
        } else if (this.agent.prompter) {
            analysis = await this.agent.prompter.promptCoding([{ role: 'user', content: prompt }]);
        }

        if (analysis) {
            const fact = analysis.replace(/```/g, '').trim();
            console.log(`[EvolutionEngine] 🎓 Lesson Learned: ${fact}`);

            // Store in Unified Memory (via MemorySystem)
            if (this.agent.memory) {
                await this.agent.memory.absorb('experience', {
                    facts: [fact],
                    metadata: { type: 'evolution_lesson', cause: 'death_retrospective' }
                });
            }

            // Phase 3: Trigger Skill Refactoring if a specific skill was active
            const lastSnapshot = this.agent.replayBuffer.buffer[this.agent.replayBuffer.buffer.length - 1];
            const offendingSkillName = lastSnapshot?.activeSkill;

            if (offendingSkillName) {
                console.log(`[EvolutionEngine] 🛠️ Offending skill identified: ${offendingSkillName}. Triggering Self-Refactor...`);
                await this._triggerSkillRefactor(offendingSkillName, fact, history);
            }
        }
    }

    /**
     * Phase 3: LLM Self-Refactoring Loop
     * Automatically improves skill code based on failure analysis.
     */
    async _triggerSkillRefactor(skillName, analysis, history) {
        const skill = this.agent.skillLibrary?.getSkill(skillName);
        if (!skill) return;

        const prompt = `
[SKILL SELF-REFACTORING]
The skill "${skillName}" was active when the bot died. 
Analysis of death: ${analysis}

Short-term Replay History:
${history}

CURRENT CODE for "${skillName}":
\`\`\`javascript
${skill.code}
\`\`\`

MISSION:
Rewrite this skill to be more robust and avoid the cause of death identified above.
Maintain the same function signature and dependencies.
Return ONLY the improved JavaScript code block.
`.trim();

        console.log(`[EvolutionEngine] 🤖 Requesting refactored code for ${skillName}...`);
        let refactoredCodeRaw = null;
        if (this.agent.brain) {
            refactoredCodeRaw = await this.agent.brain.generateReflexCode(prompt);
        } else if (this.agent.prompter) {
            refactoredCodeRaw = await this.agent.prompter.promptCoding([{ role: 'user', content: prompt }]);
        }

        if (refactoredCodeRaw) {
            const newCode = this._extractCodeBlock(refactoredCodeRaw);
            if (newCode) {
                const validation = await this.validateCode(newCode);
                if (validation.valid) {
                    await this.agent.skillLibrary.hotSwap(skillName, newCode, `Refactored after death: ${analysis}`);
                    console.log(`[EvolutionEngine] ✨ Skill ${skillName} evolved and hot-swapped!`);
                } else {
                    console.warn(`[EvolutionEngine] ❌ Refactored code validation failed for ${skillName}`);
                }
            }
        }
    }
}

export default EvolutionEngine;
