
import { VectorStore } from '../memory/VectorStore.js';

export class Dreamer {
    constructor(agent) {
        this.agent = agent;
        this.vectorStore = new VectorStore(agent);
        this.isDreaming = false;
    }

    async init() {
        await this.vectorStore.init();
    }

    async dream(reason = 'Routine Maintenance') {
        if (this.isDreaming) return;
        this.isDreaming = true;
        console.log(`[Dreamer] Entering REM sleep (${reason})...`);

        try {
            // 1. Retrieve Recent History
            const history = this.agent.history.getHistory();
            if (history.length < 5) {
                console.log('[Dreamer] Not enough history to dream.');
                // unpause handled in finally
                return;
            }

            if (this.agent.bot && this.agent.bot.modes) {
                this.agent.bot.modes.pause('all');
            }

            // 2. Synthesize Memories (Summarization)
            const prompt = [
                { role: 'system', content: 'You are the subconscious of the bot. Summarize the following session history into concise, important memories (facts, locations, achievements). Ignore commands and chatter. Return a JSON array of strings.' },
                ...history,
                { role: 'user', content: 'Extract key memories as JSON list.' }
            ];

            // Use DualBrain (Fast Model preferred for summarization)
            let response = '';

            if (this.agent.brain) {
                response = await this.agent.brain.chat(prompt);
            } else {
                response = await this.agent.prompter.chat(prompt);
            }

            // 3. Store Memories
            let memories = [];
            try {
                // Try to find JSON array
                const jsonMatch = response.match(/\[.*\]/s);
                if (jsonMatch) {
                    memories = JSON.parse(jsonMatch[0]);
                } else {
                    // Fallback: split by newlines
                    memories = response.split('\n').filter(l => l.trim().length > 0);
                }
            } catch (e) {
                console.warn('[Dreamer] Failed to parse summary:', response);
            }

            for (const mem of memories) {
                if (typeof mem === 'string' && mem.length > 5)
                    await this.vectorStore.add(mem, { source: 'dream' });
            }

            // 4. Archive & Clean
            this.agent.history.save(); // ensure saved.
            this.agent.bot.chat('I feel refreshed. Memories updated.');
            console.log(`[Dreamer] Processed ${memories.length} memories.`);

        } catch (err) {
            console.error('[Dreamer] Nightmare (Error):', err);
        } finally {
            this.isDreaming = false;
            if (this.agent.bot && this.agent.bot.modes)
                this.agent.bot.modes.unPauseAll();
        }
    }

    async searchMemories(query) {
        return await this.vectorStore.search(query);
    }

    // Phase 2 Fix: API Compatibility with MemorySystem
    async search(query, limit = 5) {
        return await this.vectorStore.search(query, limit);
    }
}
