
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globalBus, SIGNAL } from './SignalBus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ToolCreatorEngine: Phase 7 Dynamic Skill Generation
 * 
 * Orchestrates the creation of new MCP-compatible skills/tools
 * using the UnifiedBrain's high-IQ model.
 */
export class ToolCreatorEngine {
    constructor(agent) {
        this.agent = agent;
        // Phase 11 EAI: Save dynamic skills to the profile-specific library persistent path
        this.dynamicSkillsPath = agent.prompts ? path.join(agent.prompts.getProfilePath(), 'skill_library/dynamic') : path.join(__dirname, '../../../src/skills/library/dynamic');

        // Ensure directory exists
        if (!fs.existsSync(this.dynamicSkillsPath)) {
            fs.mkdirSync(this.dynamicSkillsPath, { recursive: true });
        }

        // Phase 13: Dreaming Queue
        this.queue = [];
        this.isDreaming = false;

        console.log('[ToolCreator] Initialized (Dreaming Mode Ready)');
    }

    /**
     * Queue a new tool creation request (Phase 13 Asynchronous Dreaming)
     * @param {string} need - Description of what the tool should do
     * @param {string} context - Context about why it's needed
     * @returns {void}
     */
    async createTool(need, context = '', maxRetries = 3) {
        console.log(`[ToolCreator] 🛌 Adding request to Dreaming Queue: "${need}"`);
        this.queue.push({ need, context, maxRetries });
        this._startDreaming();
    }

    /**
     * Process the queue in the background
     */
    async _startDreaming() {
        if (this.isDreaming) return;
        this.isDreaming = true;

        while (this.queue.length > 0) {
            const task = this.queue.shift();
            try {
                // Yield thread to ensure bot keeps ticking
                await new Promise(resolve => setTimeout(resolve, 100));
                await this._generateToolInternal(task.need, task.context, task.maxRetries);
            } catch (err) {
                console.error(`[ToolCreator] ❌ Dreaming task failed for '${task.need}':`, err.message);
            }
        }

        this.isDreaming = false;
        console.log(`[ToolCreator] 🌅 Woke up from dreaming. Queue is empty.`);
    }

    /**
     * Internal implementation of the Self-Verification Loop
     */
    async _generateToolInternal(need, context = '', maxRetries = 3) {
        let currentContext = context;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`[ToolCreator] 🧠 Dreaming about tool for: "${need}" (Attempt ${attempt}/${maxRetries})`);

            try {
                // Phase 12 EAI: Self-Verification Error Injection
                let promptContext = currentContext;
                if (lastError) {
                    promptContext += `\n\n[CRITICAL FEEDBACK FROM PREVIOUS ATTEMPT]\nYour previous code failed with this error:\n${lastError}\n\nPlease fix the code and rewrite it accurately. Pay attention to syntax and API usage.`;
                }

                // 1. Generate Tool Definition via Brain
                const toolDef = await this.agent.brain.generateTool(need, promptContext);

                if (!toolDef || !toolDef.schema || !toolDef.code) {
                    throw new Error('Brain returned invalid tool definition');
                }

                const { schema, code } = toolDef;
                const name = schema.name;

                // 2. Validate Tool Name
                if (!/^[a-z0-9_]+$/.test(name)) {
                    throw new Error(`Invalid tool name "${name}". Must be snake_case.`);
                }

                // 3. Safety Sandwich Validation (Phase 6)
                if (this.agent.evolution?.safety) {
                    console.log(`[ToolCreator] 🛡️ Validating code for ${name}...`);
                    const validation = await this.agent.evolution.safety.validate(code);
                    if (!validation.valid) {
                        throw new Error(`Safety Validation Failed: ${validation.reasoning}`);
                    }
                }

                // 4. Construct File Content
                const fileContent = this._buildFileContent(schema, code);

                // 5. Save to Disk
                const filePath = path.join(this.dynamicSkillsPath, `${name}.js`);
                fs.writeFileSync(filePath, fileContent);
                console.log(`[ToolCreator] 💾 Saved learned skill to ${filePath}`);

                // 6. Register with ToolRegistry (Hot Reload & Syntax Check)
                try {
                    await this.agent.toolRegistry._loadSkill(filePath);

                    // Phase 13 Hot-reload signaling
                    this.agent.bot.chat(`Eureka! I just figured out how to: ${name}!`);

                    // Dispatch HOT_RELOAD to event bus.
                    try {
                        globalBus.emitSignal(SIGNAL.SKILL_READY, { skillName: name, path: filePath });
                    } catch (e) {
                        console.warn('[ToolCreator] Could not emit SKILL_READY signal', e.message);
                    }

                    // Phase 11 EAI: Persistent Skill Tracker
                    if (this.agent.skillManager) {
                        this.agent.skillManager.addSkill(name, schema.description, filePath, ['dynamic']);
                    }

                    // Register with KnowledgeStore
                    if (this.agent.knowledge) {
                        this.agent.knowledge.registerTool(name, schema.description, {
                            source: 'tool_creator',
                            path: filePath
                        });
                    }

                    return true; // Success!

                } catch (regErr) {
                    console.error(`[ToolCreator] Registration failed on attempt ${attempt}:`, regErr.message);
                    // Rollback (Delete broken file)
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    throw new Error(`Syntax or Registration Error: ${regErr.message}`);
                }

            } catch (error) {
                console.warn(`[ToolCreator] ⚠️ Attempt ${attempt} failed: ${error.message}`);
                lastError = error.message;

                if (attempt === maxRetries) {
                    console.error('[ToolCreator] ❌ Max retries reached. Tool generation failed.');
                    this.agent.bot.chat(`I tried dreaming up a tool for that, but couldn't quite get it right after ${maxRetries} attempts.`);
                    return false;
                }

                // Yield event loop between expensive generation tasks
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return false;
    }

    _buildFileContent(schema, code) {
        // Clean code (remove async if double wrapping occurs)
        let cleanCode = code.trim();
        if (cleanCode.startsWith('async (agent, params) =>')) {
            // format is good
        } else if (cleanCode.startsWith('async function')) {
            // might be named, convert to arrow or anonymous
        }

        // We wrap the code implementation in a default export

        return `
/**
 * ${schema.description}
 * Generated by ToolCreatorEngine
 */

export const metadata = {
    name: '${schema.name}',
    description: '${schema.description}',
    parameters: ${JSON.stringify(schema.parameters, null, 4)},
    tags: ['dynamic', 'generated'],
    usageCount: 0
};

export default ${cleanCode};
`;
    }
}
