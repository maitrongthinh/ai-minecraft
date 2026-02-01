
import { Coder } from './coder.js';
import { SkillLibrary } from '../skills/SkillLibrary.js';
import { lockdown } from './library/lockdown.js';

export class SmartCoder extends Coder {
    constructor(agent) {
        super(agent);
        this.library = new SkillLibrary();
    }

    /**
     * Overrides Coder.generateCode to implement Learning Loop
     */
    async generateCode(agent_history) {
        // 1. Identify Intent from History
        const messages = agent_history.getHistory();
        const lastMessage = messages[messages.length - 1];
        const intent = lastMessage.content; // Simplified intent extraction

        // 2. Search Skill Library (Semantic Search)
        // Skip if it's a system error feedback loop
        if (lastMessage.role !== 'system') {
            const skill = this.library.search(intent);
            if (skill) {
                console.log(`[SmartCoder] Found matching skill: ${skill.name}`);
                const result = await this.executeParsedCode(skill.code);
                if (result.success) {
                    this.library.markSuccess(skill.name);
                    return `Executed cached skill '${skill.name}':\n${result.summary}`;
                } else {
                    console.warn(`[SmartCoder] Cached skill '${skill.name}' failed. Falling back to generation.`);
                    // Fallback to generation if cached skill fails (maybe context changed)
                }
            }
        }

        // 3. Generate New Code (using Coder's loop, but we intercept success)
        // We cannot easily hook into super.generateCode's internal loop.
        // So we Re-implement the loop here to add the "Save" step.
        // Or we use super.executeParsedCode inside our own loop.

        return await this._generateAndLearn(agent_history);
    }

    async _generateAndLearn(agent_history) {
        // This is a copy of Coder.generateCode but with "Save Skill" logic
        // and using DualBrain routing if possible (Agent already doing it via prompter)

        this.agent.bot.modes.pause('unstuck');
        lockdown();

        let messages = agent_history.getHistory();
        messages.push({ role: 'system', content: 'Code generation started. Write code in codeblock.' });

        const MAX_ATTEMPTS = 5;
        let no_code_failures = 0;

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            if (this.agent.bot.interrupt_code) return null;

            // Generate
            const res = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));

            // Extract Code
            let code = null;
            if (res.indexOf('```') !== -1) {
                code = res.substring(res.indexOf('```') + 3, res.lastIndexOf('```'));
            } else {
                // handle no code (omitted for brevity, assume similar to Coder)
                messages.push({ role: 'system', content: 'Error: No code block found.' });
                continue;
            }

            // Execute
            const result = await this.executeParsedCode(code);

            if (result.success) {
                // SUCCESS! -> SAVE SKILL
                await this._saveSkill(code, messages);
                return result.summary;
            }

            // Errors
            if (result.lintError) {
                messages.push({ role: 'system', content: `Lint Error: ${result.lintError}` });
            } else if (result.executionError) {
                messages.push({ role: 'system', content: `Runtime Error: ${result.executionError}\nOutput: ${result.codeOutput}` });
            }
        }
        return "Failed to generate working code.";
    }

    async _saveSkill(code, context) {
        try {
            // Ask AI to name and describe the skill
            const prompt = [
                ...context,
                { role: 'assistant', content: "```javascript\n" + code + "\n```" },
                { role: 'system', content: "The code above executed successfully. Return a JSON object with 'name' (snake_case, max 3 words), 'description', and 'tags' (array) to save this to the skill library." }
            ];

            // Use Fast Model for naming if possible, or just standard chat
            // Accessing internal agent.brain if available
            let response = "{}";
            if (this.agent.brain) {
                response = await this.agent.brain.chat(prompt); // Ask brain to name it
            } else {
                response = await this.agent.prompter.chat(prompt);
            }

            // Extract JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const meta = JSON.parse(jsonMatch[0]);
                this.library.addSkill(meta.name, code, meta.description, meta.tags);
            }
        } catch (e) {
            console.error("[SmartCoder] Failed to save skill:", e);
        }
    }
}
