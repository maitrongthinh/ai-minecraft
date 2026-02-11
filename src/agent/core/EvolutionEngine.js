/**
 * EvolutionEngine.js - The Self-Correction Loop
 * 
 * Converts failures into new skills and optimizes combat parameters.
 * 
 * 4-Step Evolution Process:
 * 1. Detection  - Capture full context when task fails
 * 2. Analysis   - Check if similar error was solved before (Cognee)
 * 3. Sanitization - Validate AI-generated code in sandbox
 * 4. Hot-Swap   - Load new skill into memory without restart
 * 
 * + Phase 2: Genetic Learning - Optimizes combat parameters based on win/loss.
 */

import { CodeSandbox } from './CodeSandbox.js';
import { CODER_SYSTEM_PROMPT } from '../../prompts/CoderPrompt.js';
import { globalBus, SIGNAL } from './SignalBus.js';

// Error signature for deduplication
function hashError(error, intent) {
    const normalized = `${intent}:${error.replace(/[0-9]+/g, 'N')}`;
    return Buffer.from(normalized).toString('base64').slice(0, 16);
}

export class EvolutionEngine {
    constructor(agent) {
        this.agent = agent;
        this.sandbox = new CodeSandbox({ timeout: 100 });

        // Track pending fixes to avoid duplicate requests
        this.pendingFixes = new Map();
        this.errorHistory = new Map();
        this.system2Failures = [];
        this.maxFailureHistory = 50;

        // Phase 4.5: Auto-Correction Listener
        globalBus.subscribe(SIGNAL.TASK_FAILED, async (event) => {
            console.log('[EvolutionEngine] 👂 Heard TASK_FAILED. Analyzing...');
            const snapshot = this.captureSnapshot(event.payload.task, event.payload.error);
            await this.requestFix(snapshot);
        });

        // Phase 3: Death Analysis (Adaptive Mind)
        globalBus.subscribe(SIGNAL.DEATH, async (event) => {
            console.log('[EvolutionEngine] 💀 Death detected. Initiating Retrospective Analysis...');
            await this._handleDeathAnalysis(event.payload);
        });

        // Phase 6: System 2 Integration
        globalBus.subscribe(SIGNAL.SYSTEM2_DEGRADED, async (event) => {
            console.log('[EvolutionEngine] 👂 System 2 DEGRADED. Recording failure pattern...');
            await this._trackSystem2Failure(event.payload);
        });

        globalBus.subscribe(SIGNAL.SKILL_FAILED, async (event) => {
            console.log('[EvolutionEngine] 👂 Skill FAILED. Analyzing for evolution...');
            const snapshot = this.captureSnapshot(
                { name: event.payload.skillName || event.payload.name, params: event.payload.params },
                new Error(event.payload.error)
            );
            await this.requestFix(snapshot);
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

        // Phase 2: Combat Genetic Parameters
        this.combatParams = {
            strafeDistance: 2.5,
            retreatHealth: 6,
            attackUrgency: 1.0
        };

        console.log('[EvolutionEngine] ⚡ Initialized - Ready to evolve');
    }

    captureSnapshot(task, error) {
        const bot = this.agent.bot;
        const errorMessage = typeof error === 'string' ? error : (error?.message || 'Unknown error');
        const errorStack = typeof error === 'string' ? [] : (error?.stack?.split('\n').slice(0, 5) || []);

        const snapshot = {
            taskName: task?.name || 'unknown_task',
            errorMessage,
            errorStack,
            errorHash: hashError(errorMessage, task?.name || ''),
            position: bot?.entity?.position ? {
                x: Math.floor(bot.entity.position.x),
                y: Math.floor(bot.entity.position.y),
                z: Math.floor(bot.entity.position.z)
            } : null,
            health: bot?.health || 0,
            food: bot?.food || 0,
            inventory: this._getInventorySummary(),
            surroundings: this._getSurroundings(),
            timestamp: Date.now()
        };

        this.stats.capturedErrors++;
        return snapshot;
    }

    _getInventorySummary() {
        try {
            const items = this.agent.bot?.inventory?.items() || [];
            const summary = {};
            for (const item of items) {
                if (item?.name) summary[item.name] = (summary[item.name] || 0) + item.count;
            }
            return summary;
        } catch (e) { return {}; }
    }

    _getSurroundings() {
        try {
            const bot = this.agent.bot;
            if (!bot?.entity?.position) return [];
            const pos = bot.entity.position;
            const blocks = new Set();
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        const block = bot.blockAt(pos.offset(dx, dy, dz));
                        if (block && block.name !== 'air') blocks.add(block.name);
                    }
                }
            }
            return Array.from(blocks).slice(0, 10);
        } catch (e) { return []; }
    }

    async requestFix(snapshot) {
        const { errorHash, taskName } = snapshot;
        if (this.errorHistory.has(errorHash)) return { success: true, skillName: this.errorHistory.get(errorHash), cached: true };
        if (this.pendingFixes.has(errorHash)) return { success: false, reason: 'already_processing' };

        this.pendingFixes.set(errorHash, Date.now());
        try {
            const skillName = this._generateSkillName(taskName, snapshot.errorMessage);
            const prompt = this._buildGenerationPrompt(snapshot);
            let generatedCode = null;

            if (this.agent.brain) {
                generatedCode = await this.agent.brain.generateReflexCode(prompt);
            } else if (this.agent.prompter) {
                generatedCode = await this.agent.prompter.promptCoding([
                    { role: 'system', content: CODER_SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ]);
            }

            if (!generatedCode) return { success: false, reason: 'no_code_generated' };
            const code = this._extractCodeBlock(generatedCode);
            if (!code) return { success: false, reason: 'no_code_block' };

            const validation = await this.validateCode(code);
            if (!validation.valid) return { success: false, reason: 'validation_failed', details: validation };

            const deployed = await this.deploySkill(skillName, code, snapshot);
            if (!deployed) return { success: false, reason: 'deploy_failed' };

            this.errorHistory.set(errorHash, skillName);
            this.stats.generatedSkills++;
            return { success: true, skillName, code };
        } finally {
            this.pendingFixes.delete(errorHash);
        }
    }

    _generateSkillName(taskName, errorMessage) {
        let name = taskName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
        if (errorMessage.includes('path')) name += '_pathfix';
        else if (errorMessage.includes('inventory')) name += '_itemfix';
        else name += '_fix';
        return name;
    }

    _buildGenerationPrompt(snapshot) {
        return `FAILURE CONTEXT:\n- Task: ${snapshot.taskName}\n- Error: ${snapshot.errorMessage}\n- Position: ${JSON.stringify(snapshot.position)}\n- Health: ${snapshot.health}/20\n- Inventory: ${JSON.stringify(snapshot.inventory)}\n- Nearby blocks: ${snapshot.surroundings.join(', ')}\n\nMISSION:\nWrite a JavaScript function that handles this situation and prevents this error. Functional signature: async function skillName(bot) { ... }`;
    }

    _extractCodeBlock(response) {
        if (!response) return null;

        // Phase 5.2: Try parsing as ReAct JSON first
        try {
            // Remove markdown code blocks if present
            const cleanResponse = response.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
            const parsed = JSON.parse(cleanResponse);
            if (parsed.thought) console.log(`[EvolutionEngine] 🧠 AI Reasoning: ${parsed.thought}`);
            if (parsed.code) return parsed.code.trim();
        } catch (e) {
            // Fallback: Continue to regex extraction if not valid JSON
        }

        const match = response.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
        return match ? match[1].trim() : (response.includes('async function') ? response.trim() : null);
    }

    async validateCode(code) { return this.sandbox.validate(code); }

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
                // In production, we'd merge here. For now, we skip saving to prevent pollution.
                return true;
            }

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
    }

    /**
     * Phase 3: Analyze death events using ReplayBuffer
     */
    async _handleDeathAnalysis(payload) {
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

            // Store in Cognee Memory
            if (this.agent.cogneeMemory && this.agent.world_id) {
                await this.agent.cogneeMemory.storeExperience(this.agent.world_id, [fact], {
                    type: 'evolution_lesson',
                    timestamp: Date.now(),
                    cause: 'death_retrospective'
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

    recordCombatResult(won) {
        if (won) {
            this.stats.combatWins++;
            this.combatParams.strafeDistance += (Math.random() - 0.4) * 0.1;
        } else {
            this.stats.combatLosses++;
            this.combatParams.strafeDistance += (Math.random() - 0.5) * 0.5;
            this.combatParams.retreatHealth = Math.min(10, this.combatParams.retreatHealth + 0.5);
        }
        this.combatParams.strafeDistance = Math.max(1.5, Math.min(5.0, this.combatParams.strafeDistance));
        this.combatParams.retreatHealth = Math.max(4, Math.min(12, this.combatParams.retreatHealth));

        if (this.agent.combatReflex) this.agent.combatReflex.updateGeneticParams(this.combatParams);
    }

    getStats() { return { ...this.stats, combatParams: this.combatParams }; }
}

export default EvolutionEngine;
