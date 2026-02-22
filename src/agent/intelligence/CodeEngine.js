import { SkillLibrary } from '../library/skill_library.js';
import { initLockdown } from '../library/lockdown.js';
import { JsonSanitizer } from '../../utils/JsonSanitizer.js';
import { globalBus, SIGNAL } from '../core/SignalBus.js';
import { ActionLogger } from '../../utils/ActionLogger.js';
import { getBotOutputSummary } from '../../utils/mcdata.js';
import { CodeSandbox } from '../core/CodeSandbox.js';
import * as skills from '../../skills/library/index.js';

/**
 * CodeEngine: Unified JS Execution & Learning System
 * 
 * Features:
 * - Skill Library lookup (Learning Loop)
 * - Safe runtime execution via ActionManager.safeExec
 * - Semantic recall fallback
 * - Event-driven code requests
 */
export class CodeEngine {
    constructor(agent) {
        this.agent = agent;
        this.library = new SkillLibrary();
        this.sandbox = new CodeSandbox({ timeout: 5000 });
        this.referenceCode = null;

        this._setupSignals();
        console.log('[CodeEngine] 💻 Hardened Intelligence module armed (isolated-vm).');
    }

    _setupSignals() {
        globalBus.subscribe(SIGNAL.CODE_REQUEST, async (payload) => {
            console.log('[CodeEngine] 📨 Signal: CODE_REQUEST');
            const mockHistory = {
                getHistory: () => payload.messages || [{ role: 'user', content: payload.prompt }]
            };

            try {
                const result = await this.generateCode(mockHistory);
                globalBus.emitSignal(SIGNAL.CODE_GENERATED, {
                    success: result && !result.includes('Failed'),
                    result
                });
            } catch (err) {
                globalBus.emitSignal(SIGNAL.CODE_GENERATED, { success: false, error: err.message });
            }
        });
    }

    /**
     * Compatibility alias for Agent.js
     */
    async execute(code, options = {}) {
        return await this.executeParsedCode(code, options);
    }

    /**
     * Main entry point for code generation
     */
    async generateCode(agent_history, options = {}) { // Added options for signal
        const messages = agent_history.getHistory();
        const lastMessage = messages[messages.length - 1];
        const intent = lastMessage.content;
        const { signal } = options;

        this.referenceCode = null;

        // 1. Skill Library Lookup (Keyword)
        if (lastMessage.role !== 'system') {
            const skill = await this.library.search(intent);
            if (skill) {
                console.log(`[CodeEngine] 🧠 Found skill match: ${skill.name}`);
                const result = await this.executeParsedCode(skill.code, { signal }); // Pass signal
                if (result.success) {
                    this.library.markSuccess(skill.name);
                    return `Executed cached skill '${skill.name}':\n${result.summary}`;
                }
                this.referenceCode = skill.code; // Use failed skill as reference
            }

            // 2. Semantic Fallback (Vector Store)
            if (!this.referenceCode && this.agent.dreamer) {
                try {
                    const memories = await this.agent.dreamer.searchMemories(intent);
                    const codeMemory = memories.find(m =>
                        m.metadata?.source === 'skill' || m.text?.includes('async ')
                    );
                    if (codeMemory) {
                        this.referenceCode = codeMemory.text;
                        console.log('[CodeEngine] 📚 Injected semantic code reference.');
                    }
                } catch (e) {
                    console.warn('[CodeEngine] Vector search failed:', e.message);
                }
            }
        }

        return await this._generateAndLearn(agent_history, { signal }); // Pass signal
    }

    async _generateAndLearn(agent_history, { signal } = {}) {
        if (this.agent.bot?.modes && typeof this.agent.bot.modes.pause === 'function') {
            this.agent.bot.modes.pause('unstuck');
        }
        initLockdown();

        let messages = agent_history.getHistory();

        // Inject Context
        let systemPrompt = 'Code generation started. You MUST wrap your code in a javascript codeblock: ```javascript ... ```';

        // Inject Available Skills List to prevent hallucination
        const availableSkills = Object.keys(skills).join(', ');
        systemPrompt += `\n\nAVAILABLE SKILLS: ${availableSkills}`;
        systemPrompt += `\nUse "skills.skillName()" to call them. Do NOT make up new skills.`;

        if (this.referenceCode) {
            systemPrompt += `\n\n📚 REFERENCE CODE (Adapt if useful):\n\`\`\`javascript\n${this.referenceCode.slice(0, 1000)}\n\`\`\``;
        }
        messages.push({ role: 'system', content: systemPrompt });

        const MAX_ATTEMPTS = 3;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            if (this.agent.bot.interrupt_code || signal?.aborted) return null; // Check signal

            // DEBUG: Log prompt for user
            console.log('--- [CodeEngine] Generated Prompt ---');
            console.log(JSON.stringify(messages, null, 2));
            console.log('-------------------------------------');

            const res = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));

            // DEBUG: Log response for user
            console.log('--- [CodeEngine] Raw Response ---');
            console.log(res);
            console.log('---------------------------------');

            const codeMatch = res.match(/```(?:javascript|js)?\n([\s\S]*?)```/);

            if (!codeMatch) {
                messages.push({ role: 'system', content: 'Error: No code block found. Try again.' });
                continue;
            }

            const code = codeMatch[1];
            const result = await this.executeParsedCode(code, { signal }); // Pass signal

            if (result.success) {
                await this._saveSkill(code, messages); // Learning Loop
                return result.summary;
            }

            // Error Recovery
            const errorMsg = result.syntaxError || result.executionError?.message;
            console.warn(`[CodeEngine] Attempt ${i + 1} failed: ${errorMsg}`);
            messages.push({
                role: 'system',
                content: `Error details:\n${errorMsg}\nCode Output:\n${result.codeOutput}\nPlease fix and try again.`
            });
        }

        return "Failed to generate working code after multiple attempts.";
    }

    async executeParsedCode(code, { signal } = {}) {
        try {
            const result = await this._stageCode(code);
            if (!result || !result.func) {
                return {
                    success: false,
                    syntaxError: result?.error?.message || 'Staging failed (Unknown error).'
                };
            }

            console.log('[CodeEngine] ▶️ Executing...');

            // COMBAT AWARENESS: Fail physical actions if in combat and not a reflex
            if (this.agent.combatReflex?.inCombat) {
                console.warn('[CodeEngine] ⚔️ Combat Active! Refusing physical code execution to avoid jitter.');
                return {
                    success: false,
                    executionError: new Error('Cannot execute physical tasks while in combat.'),
                    codeOutput: "Combat active. Movement/Look commands blocked."
                };
            }

            // 10s Timeout for physical action execution (Predictive Safety)
            // Audit Fix: Parameterize timeout
            const timeout = this.agent.config?.profile?.timeouts?.code_execution || 90000;

            this.agent.bot.output = '';

            const executionReturn = await this.agent.actions.safeExec(
                'ai_interaction',
                () => result.func.main(this.agent.bot),
                timeout,
                signal // Pass signal to safeExec
            );

            let codeOutput = (this.agent.bot.output || '').trim();
            if (!codeOutput) {
                codeOutput = getBotOutputSummary(this.agent.bot);
            }
            this.agent.bot.output = '';

            if (executionReturn && typeof executionReturn === 'object' && executionReturn.success === false) {
                const failMessage = executionReturn.message || executionReturn.error || 'Execution returned success=false';
                return {
                    success: false,
                    executionError: {
                        name: 'ActionResultFailure',
                        message: failMessage
                    },
                    codeOutput
                };
            }

            return {
                success: true,
                summary: `Code executed successfully.\nOutput: ${codeOutput}`,
                codeOutput
            };
        } catch (e) {
            let codeOutput = (this.agent.bot.output || '').trim();
            if (!codeOutput) {
                codeOutput = getBotOutputSummary(this.agent.bot);
            }
            this.agent.bot.output = '';
            console.error('[CodeEngine] Execution Failure:', e);

            return {
                success: false,
                executionError: {
                    name: e.name,
                    message: e.message,
                    stack: e.stack
                },
                syntaxError: e instanceof SyntaxError ? e.message : null,
                codeOutput
            };
        }
    }

    async _stageCode(code) {
        const code_clean = this._sanitizeCode(code);

        const mainFn = async (bot) => {
            // Snapshot of Bot State for Sandbox
            const botState = {
                health: bot.health,
                food: bot.food,
                entity: { position: bot.entity.position },
                inventory: {
                    items: bot.inventory.items().map(i => ({ name: i.name, count: i.count, type: i.type, displayName: i.displayName }))
                },
                // Add commonly accessed properties
                username: bot.username,
                // game: bot.game // Too complex/circular for ExternalCopy. 
                // Only pass essential game data if strictly needed (e.g. dimension)
                game: {
                    gameMode: bot.game?.gameMode,
                    difficulty: bot.game?.difficulty,
                    dimension: bot.game?.dimension
                },
                time: {
                    timeOfDay: bot.time?.timeOfDay,
                    day: bot.time?.day,
                    isDay: bot.time?.timeOfDay < 13000 || bot.time?.timeOfDay > 23000
                }
            };

            const skillsSource = {};

            // Add skills from ToolRegistry
            if (this.agent.toolRegistry && this.agent.toolRegistry.skills) {
                for (const [name, metadata] of this.agent.toolRegistry.skills) {
                    if (typeof metadata.execute === 'function') {
                        skillsSource[name] = metadata.execute.toString();
                    }
                }
            }

            // Add built-in and custom skills from library
            for (const [name, fn] of Object.entries(skills)) {
                if (typeof fn === 'function') {
                    // Wrap as a bridge call instead of toString() to avoid scope issues
                    skillsSource[name] = `async (...args) => { return await bot.__call_skill__('${name}', ...args); }`;
                }
            }

            // Add custom skills from SkillLibrary
            if (this.library && this.library.customSkills) {
                for (const [name, code] of Object.entries(this.library.customSkills)) {
                    // Custom skills from the library might be full source, but we can treat them similarly 
                    // or continue to use string-based if they are simple. 
                    // To be safe, let's keep them as source if they were saved as source.
                    skillsSource[name] = code;
                }
            }

            // Add custom skills from agent.customSkills (compatibility)
            if (this.agent.customSkills) {
                for (const key of Object.keys(this.agent.customSkills)) {
                    if (typeof this.agent.customSkills[key] === 'function') {
                        skillsSource[key] = this.agent.customSkills[key].toString();
                    }
                }
            }

            const actionsSource = {};
            // EXTREMELY IMPORTANT: Map ActionAPI methods as well
            if (this.agent.actionAPI) {
                const proto = Object.getPrototypeOf(this.agent.actionAPI);
                for (const name of Object.getOwnPropertyNames(proto)) {
                    if (typeof this.agent.actionAPI[name] === 'function' && name !== 'constructor' && !name.startsWith('_')) {
                        actionsSource[name] = `async (params) => { return await bot.__call_action__('${name}', params); }`;
                    }
                }
            }

            const contextData = {
                botState,
                // Serialize skill functions as strings for the sandbox to eval
                skillsSource: Object.assign({}, skillsSource),
                actionsSource: Object.assign({}, actionsSource),
                bot_health: bot.health,
                bot_food: bot.food,
                bot_position: bot.entity.position
            };

            const result = await this.sandbox.execute(code_clean, contextData, this.agent.actionAPI, skills);

            if (!result.success) {
                throw new Error(result.error);
            }

            return result.result;
        };

        return { func: { main: mainFn } };
    }

    _sanitizeCode(code) {
        code = code.trim();
        if (code.slice(0, 10).toLowerCase() === 'javascript') {
            return code.slice(10).trim();
        }
        if (code.slice(0, 2).toLowerCase() === 'js') {
            return code.slice(2).trim();
        }
        return code;
    }

    async _saveSkill(code, context) {
        // Dependency Check: Brain might not be ready during early init or mock tests
        if (!this.agent.brain) {
            console.warn('[CodeEngine] ⚠️ Cannot save skill: Agent Brain not ready.');
            return;
        }

        try {
            console.log('[CodeEngine] 🧠 analyzing new skill for library...');
            const prompt = [
                ...context,
                { role: 'assistant', content: "```javascript\n" + code + "\n```" },
                { role: 'system', content: "Success! Return JSON: { \"name\": \"snake_case_name\", \"description\": \"...\", \"tags\": [] }" }
            ];

            const response = await this.agent.brain.chat(prompt);
            const meta = JsonSanitizer.parse(response);

            if (meta?.name) {
                this.library.addSkill(meta.name, code, meta.description, meta.tags);
                // Emit signal for other systems (e.g. Dashboard)
                globalBus.emitSignal(SIGNAL.SKILL_LEARNED, { name: meta.name, description: meta.description });
                console.log(`[CodeEngine] 🎓 Learned new skill: ${meta.name}`);
            }
        } catch (e) {
            console.error("[CodeEngine] Learning failed:", e.message);
        }
    }
}
