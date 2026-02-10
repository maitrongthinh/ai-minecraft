import { SkillLibrary } from '../../skills/SkillLibrary.js';
import { lockdown } from '../library/lockdown.js';
import { JsonSanitizer } from '../../utils/JsonSanitizer.js';
import { globalBus, SIGNAL } from '../core/SignalBus.js';
import { ActionLogger } from '../../utils/ActionLogger.js';
import { getBotOutputSummary } from '../../utils/mcdata.js';

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
        this.referenceCode = null;

        this._setupSignals();
        console.log('[CodeEngine] 💻 Intelligence module armed.');
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
        lockdown();

        let messages = agent_history.getHistory();

        // Inject Context
        let systemPrompt = 'Code generation started. You MUST wrap your code in a javascript codeblock: ```javascript ... ```';
        if (this.referenceCode) {
            systemPrompt += `\n\n📚 REFERENCE CODE (Adapt if useful):\n\`\`\`javascript\n${this.referenceCode.slice(0, 1000)}\n\`\`\``;
        }
        messages.push({ role: 'system', content: systemPrompt });

        const MAX_ATTEMPTS = 3;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            if (this.agent.bot.interrupt_code || signal?.aborted) return null; // Check signal

            const res = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));
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
        let code_clean = this._sanitizeCode(code);

        // Phase 8: AST Sanitization (DoS Prevention)
        try {
            const { CodeSanitizer } = await import('./CodeSanitizer.js');
            code_clean = CodeSanitizer.sanitize(code_clean, 5000); // 5s timeout
        } catch (e) {
            console.warn('[CodeEngine] Sanitizer failed, proceeding with raw code:', e.message);
        }

        let src_lint_copy = "import * as skills from '../../skills/library/index.js';\nimport * as world from '../../skills/library/world.js';\nimport Vec3 from 'vec3';\nasync function main(bot) {\n" + code_clean + "\n}\nexport {main};";

        // Dynamic evaluation in a compartment-like style or simple eval
        // For Mindcraft environment:
        try {
            const wrappedCode = `(async () => {\n${code_clean}\n})()`;

            // SECURITY UPDATE: Use Node.js VM for sandbox execution
            const mainFn = async (bot) => {
                const rawSkills = await import('../../skills/library/index.js');
                const world = await import('../../skills/library/world.js');
                const { default: Vec3 } = await import('vec3');
                const vm = await import('vm');

                const looksLikeBot = (value) =>
                    !!value &&
                    (typeof value.findBlock === 'function' ||
                        typeof value.blockAt === 'function' ||
                        typeof value.chat === 'function');

                const looksLikeAgent = (value) => !!(value && value.bot && looksLikeBot(value.bot));

                const ensureOutcome = (name, result) => {
                    if (result && typeof result === 'object' && result.success === false) {
                        const detail = result.message || result.error || 'failed';
                        throw new Error(`[${name}] ${detail}`);
                    }
                    return result;
                };

                const invokeBoundSkill = (fn, arg1, arg2) => {
                    if (!fn) return Promise.resolve({ success: false, message: 'Skill not available' });
                    if (looksLikeBot(arg1) || looksLikeAgent(arg1)) {
                        return Promise.resolve(fn(arg1, arg2 ?? {})).then(r => ensureOutcome(fn.name || 'skill', r));
                    }
                    if (arg2 !== undefined) {
                        return Promise.resolve(fn(arg1, arg2)).then(r => ensureOutcome(fn.name || 'skill', r));
                    }
                    if (arg1 && typeof arg1 === 'object') {
                        return Promise.resolve(fn(bot, arg1)).then(r => ensureOutcome(fn.name || 'skill', r));
                    }
                    return Promise.resolve(fn(bot, {})).then(r => ensureOutcome(fn.name || 'skill', r));
                };

                const boundSkills = {
                    ...rawSkills,
                    find_shelter: (arg1, arg2) => invokeBoundSkill(rawSkills.find_shelter, arg1, arg2),
                    gather_wood: (arg1, arg2) => invokeBoundSkill(rawSkills.gather_wood, arg1, arg2),
                    gather_resources: (arg1, arg2) => invokeBoundSkill(rawSkills.gather_resources, arg1, arg2),
                    mine_ores: (arg1, arg2) => invokeBoundSkill(rawSkills.mine_ores, arg1, arg2),
                    craft_items: (arg1, arg2) => invokeBoundSkill(rawSkills.craft_items, arg1, arg2),
                    place_blocks: (arg1, arg2) => invokeBoundSkill(rawSkills.place_blocks, arg1, arg2),
                    smelt_items: (arg1, arg2) => invokeBoundSkill(rawSkills.smelt_items, arg1, arg2),
                    StrategicMovement: (arg1, arg2) => invokeBoundSkill(rawSkills.find_shelter, arg1, arg2)
                };

                const skills = new Proxy(boundSkills, {
                    get(target, prop) {
                        if (prop in target) {
                            return target[prop];
                        }
                        if (typeof prop === 'string') {
                            return async () => {
                                throw new Error(`Unknown skill: ${prop}`);
                            };
                        }
                        return undefined;
                    }
                });

                const coreActions = this.agent?.actionAPI;
                const actions = {
                    move_to: async (position, options = {}) => {
                        if (!coreActions) throw new Error('ActionAPI unavailable');
                        return ensureOutcome('move_to', await coreActions.moveTo(position, options));
                    },
                    gather_nearby: async (matching, count = 1, options = {}) => {
                        if (!coreActions) throw new Error('ActionAPI unavailable');
                        return ensureOutcome('gather_nearby', await coreActions.gatherNearby(matching, count, options));
                    },
                    craft_first_available: async (items = [], count = 1, options = {}) => {
                        if (!coreActions) throw new Error('ActionAPI unavailable');
                        return ensureOutcome('craft_first_available', await coreActions.craftFirstAvailable(items, count, options));
                    },
                    ensure_item: async (itemName, targetCount = 1, options = {}) => {
                        if (!coreActions) throw new Error('ActionAPI unavailable');
                        return ensureOutcome('ensure_item', await coreActions.ensureItem(itemName, targetCount, options));
                    },
                    collect_drops: async (options = {}) => {
                        if (!coreActions) throw new Error('ActionAPI unavailable');
                        return ensureOutcome('collect_drops', await coreActions.collectDroppedItems(options));
                    },
                    eat_if_hungry: async (options = {}) => {
                        if (!coreActions) throw new Error('ActionAPI unavailable');
                        return ensureOutcome('eat_if_hungry', await coreActions.eatIfHungry(options));
                    }
                };

                const skillAliases = {
                    find_shelter: (options = {}) => skills.find_shelter?.(bot, options),
                    gather_wood: (options = {}) => skills.gather_wood?.(bot, options),
                    gather_resources: (options = {}) => skills.gather_resources?.(bot, options),
                    mine_ores: (options = {}) => skills.mine_ores?.(bot, options),
                    craft_items: (options = {}) => skills.craft_items?.(bot, options),
                    place_blocks: (options = {}) => skills.place_blocks?.(bot, options),
                    smelt_items: (options = {}) => skills.smelt_items?.(bot, options)
                };

                const sandbox = {
                    bot,
                    skills,
                    actions,
                    world,
                    Vec3,
                    ...skillAliases,
                    console, // Allow logging
                    setTimeout,
                    clearTimeout,
                    setInterval,
                    clearInterval
                };

                vm.createContext(sandbox);

                // Execute with timeout to prevent synchronous infinite loops
                // Note: deeply nested async loops might still persist, but this catches tight loops
                return await vm.runInContext(wrappedCode, sandbox, {
                    timeout: 5000,
                    displayErrors: true
                });
            };

            return { func: { main: mainFn }, src_lint_copy };
        } catch (err) {
            console.error('[CodeEngine] Staging Error:', err);
            return {
                func: null,
                error: {
                    name: err.name,
                    message: err.message,
                    stack: err.stack
                }
            };
        }
    }

    _sanitizeCode(code) {
        code = code.trim();
        const remove_strs = ['Javascript', 'javascript', 'js']
        for (let r of remove_strs) {
            if (code.toLowerCase().startsWith(r)) {
                return code.slice(r.length).trim();
            }
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
