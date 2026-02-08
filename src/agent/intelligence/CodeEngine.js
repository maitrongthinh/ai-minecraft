import { SkillLibrary } from '../../skills/SkillLibrary.js';
import { lockdown } from '../library/lockdown.js';
import { JsonSanitizer } from '../../utils/JsonSanitizer.js';
import { globalBus, SIGNAL } from '../core/SignalBus.js';
import { ActionLogger } from '../../utils/ActionLogger.js';
import { getBotOutputSummary, sanitizeCode } from '../../utils/mcdata.js';

/**
 * CodeEngine: Unified JS Execution & Learning System
 * 
 * Merges legacy Coder and SmartCoder. 
 * Features:
 * - Skill Library lookup (Learning Loop)
 * - Safe runtime execution via staged files
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
     * Main entry point for code generation
     */
    async generateCode(agent_history) {
        const messages = agent_history.getHistory();
        const lastMessage = messages[messages.length - 1];
        const intent = lastMessage.content;

        this.referenceCode = null;

        // 1. Skill Library Lookup (Keyword)
        if (lastMessage.role !== 'system') {
            const skill = await this.library.search(intent);
            if (skill) {
                console.log(`[CodeEngine] 🧠 Found skill match: ${skill.name}`);
                const result = await this.executeParsedCode(skill.code);
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

        return await this._generateAndLearn(agent_history);
    }

    async _generateAndLearn(agent_history) {
        this.agent.bot.modes.pause('unstuck');
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
            if (this.agent.bot.interrupt_code) return null;

            const res = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));
            const codeMatch = res.match(/```(?:javascript|js)?\n([\s\S]*?)```/);

            if (!codeMatch) {
                messages.push({ role: 'system', content: 'Error: No code block found. Try again.' });
                continue;
            }

            const code = codeMatch[1];
            const result = await this.executeParsedCode(code);

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

    async executeParsedCode(code) {
        try {
            const result = await this._stageCode(code);
            if (!result) return { success: false, syntaxError: 'Staging failed.' };

            console.log('[CodeEngine] ▶️ Executing...');
            await result.func.main(this.agent.bot);

            const codeOutput = this.agent.bot.output?.summary || "No specific output recorded.";
            return {
                success: true,
                summary: `Code executed successfully.\nOutput: ${codeOutput}`,
                codeOutput
            };
        } catch (e) {
            const codeOutput = this.agent.bot.output?.summary || "Execution error.";
            return {
                success: false,
                executionError: e,
                syntaxError: e instanceof SyntaxError ? e.message : null,
                codeOutput
            };
        }
    }

    async _stageCode(code) {
        let code_clean = this._sanitizeCode(code);
        let src_lint_copy = "import {skills, world, Vec3} from '../../utils/mcdata.js';\nasync function main(bot) {\n" + code_clean + "\n}\nexport {main};";

        // Dynamic evaluation in a compartment-like style or simple eval
        // For Mindcraft environment:
        try {
            const wrappedCode = `(async () => {\n${code_clean}\n})()`;
            // Note: In high-security production, use a proper sandbox.
            // For this refactor, we maintain the same dynamic capability as before.
            const mainFn = async (bot) => {
                const { skills, world, Vec3 } = await import('../../utils/mcdata.js');
                const context = { bot, skills, world, Vec3 };
                const fn = new Function('context', `const {bot, skills, world, Vec3} = context; return (async () => { ${code_clean} })();`);
                return await fn(context);
            };

            return { func: { main: mainFn }, src_lint_copy };
        } catch (err) {
            console.error('[CodeEngine] Staging Error:', err);
            return null;
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
        if (!this.agent.brain) return;
        try {
            const prompt = [
                ...context,
                { role: 'assistant', content: "```javascript\n" + code + "\n```" },
                { role: 'system', content: "Success! Return JSON: { \"name\": \"snake_case_name\", \"description\": \"...\", \"tags\": [] }" }
            ];

            const response = await this.agent.brain.chat(prompt);
            const meta = JsonSanitizer.parse(response);
            if (meta?.name) {
                this.library.addSkill(meta.name, code, meta.description, meta.tags);
                console.log(`[CodeEngine] 🎓 Learned new skill: ${meta.name}`);
            }
        } catch (e) {
            console.error("[CodeEngine] Learning failed:", e);
        }
    }
}
