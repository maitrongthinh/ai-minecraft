
/**
 * ContextAssembler
 * 
 * Responsible for assembling the dynamic context window for the AI models.
 * It pulls data from the KnowledgeStore (Manifest, ActionDocs) and
 * constructs the system prompt sections that give the AI awareness of:
 * 1. its tools (ActionAPI + Dynamic)
 * 2. its current strategy & step
 * 3. its learned reflexes
 * 4. relevant memories
 */
export class ContextAssembler {
    constructor(agent) {
        this.agent = agent;
    }

    /**
     * Assemble the full context for a planning request (High-IQ)
     * @param {Object} bot - Bot instance
     * @param {string} query - The current task or thought query for RAG
     * @returns {string} The context string to be injected into the prompt
     */
    async assembleForPlan(bot, query = '') {
        const knowledge = this.agent.knowledge;
        if (!knowledge) return '';

        // Phase 13 EAI: Adaptive Stress Check
        const isStressed = bot.health <= 10 || (bot.oxygen && bot.oxygen <= 10);
        if (isStressed) {
            console.warn('[ContextAssembler] 🚨 High Stress Detected! Trimming context to survival essentials.');
        }

        const manifest = knowledge.getManifest();
        if (!manifest) return '';

        let context = '\n\n--- AGENT KNOWLEDGE CONTEXT ---\n';

        // 1. Available Tools (Primitive + Dynamic)
        context += await this._assembleToolsSection(knowledge, query);

        // 2. Current Strategy State
        context += this._assembleStrategySection(knowledge);

        // 3. Learned Reflexes (Security/Safety)
        context += this._assembleReflexesSection(manifest);

        // 4. Important Memories (Persistent params) - Skip under high stress
        if (!isStressed) {
            context += this._assembleMemorySection(manifest);
        } else {
            context += '\n[NOTE]: Memories suppressed to focus on immediate survival.\n';
        }

        context += '\n---------------------------------\n';

        return context;
    }

    /**
     * Assemble context for chat/social interaction (Fast model)
     */
    async assembleForChat(bot) {
        const knowledge = this.agent.knowledge;
        if (!knowledge) return '';

        // Smaller context for chat
        const manifest = knowledge.getManifest();
        const activeStrategy = manifest?.strategies?.active || 'none';
        const skillCount = this.agent.skillManager ? Object.keys(this.agent.skillManager.getAllSkills()).length : 0;

        return `\n[Context: You are currently executing strategy "${activeStrategy}". You have ${skillCount} custom tools learned in your Skill Library.]`;
    }

    // --- Private Assembly Methods ---

    async _assembleToolsSection(knowledge, query) {
        let section = '\n[AVAILABLE ACTIONS & TOOLS]\n';

        // A. Read ActionAPI docs (Primitives)
        try {
            const apiDocsPath = knowledge.apiDocsPath;
            if (apiDocsPath) {
                // Phase 13 EAI: RAG Pruning. Only load Top K dynamic skills based on query
                let dynamicToolsObj = {};
                if (this.agent.skillManager) {
                    // Pull top 10 relevant skills (or just 3 if stressed)
                    const skillLimit = (bot.health <= 10) ? 3 : 10;
                    dynamicToolsObj = await this.agent.skillManager.searchSkills(query, skillLimit);
                }
                const dynamicTools = Object.entries(dynamicToolsObj);

                section += '1. PRIMITIVE ACTIONS (Native):\n';
                section += '   (See ActionAPI Reference for details)\n';
                section += '   - actions.mine(target, options)\n';
                section += '   - actions.craft(item, count)\n';
                section += '   - actions.place(block, pos)\n';
                section += '   - actions.move_to(pos)\n';
                section += '   - actions.attack(entity)\n';
                section += '   - actions.equip(item, dest)\n';
                section += '   - actions.smelt(item, count)\n';
                section += '   - actions.gather_nearby(target, count)\n';

                if (dynamicTools.length > 0) {
                    section += '\n2. RELEVANT LEARNED TOOLS (Dynamic Skill Library):\n';
                    dynamicTools.forEach(([name, data]) => {
                        section += `   - active_skills.${name}(params) : ${data.description} (Success Rate: ${(data.successRate * 100).toFixed(0)}%)\n`;
                    });

                    const totalSkillCount = Object.keys(this.agent.skillManager.getAllSkills()).length;
                    if (totalSkillCount > dynamicTools.length) {
                        section += `   ... and ${totalSkillCount - dynamicTools.length} other skills not shown to save context.\n`;
                    }
                } else {
                    section += '\n2. LEARNED TOOLS: None yet.\n';
                }
            }
        } catch (e) {
            section += 'Error loading tools.\n';
        }

        return section;
    }

    _assembleStrategySection(knowledge) {
        const manifest = knowledge.getManifest();
        const strategyId = manifest?.strategies?.active;
        if (!strategyId) return '\n[CURRENT STRATEGY]: Idle\n';

        let section = `\n[CURRENT STRATEGY]: "${strategyId}"\n`;

        // Attempt to get the specific step instruction via StrategyRunner (if available)
        // Or read from knowledge store if we sync granular state there.
        // For Phase C, we rely on the manifest's 'active_step'
        const stepId = manifest.strategies.active_step || 'unknown';
        section += `Current Step ID: ${stepId}\n`;

        // If we can access the actual instruction text (requires loading the strategy file)
        // We'll rely on the MissionDirector/StrategyRunner to inject the specific instruction text
        // This section just gives global awareness.

        return section;
    }

    _assembleReflexesSection(manifest) {
        const learned = manifest.reflexes?.learned || [];
        if (learned.length === 0) return '';

        let section = '\n[ACTIVE REFLEXES]\n';
        section += 'Built-in: Combat, Fall Damage, Self-Preservation\n';
        section += 'Learned:\n';
        learned.forEach(r => {
            section += ` - ${r.name} (Trigger: ${r.trigger}): ${r.description}\n`;
        });
        return section;
    }

    _assembleMemorySection(manifest) {
        const mem = manifest.memories || {};
        const deathCount = mem.death_count || 0;

        let section = '\n[MEMORY SNAPSHOT]\n';
        section += `Death Count: ${deathCount}\n`;

        if (mem.important_locations && Object.keys(mem.important_locations).length > 0) {
            section += 'Locations: ' + Object.keys(mem.important_locations).join(', ') + '\n';
        }

        return section;
    }
}
