
import settings from '../agent/settings.js';

/**
 * DualBrain: The Central Nervous System
 * Routes tasks between High IQ (Expensive) and Fast (Cheap) models.
 * Implements strict Rate Limiting to ensure budget survival.
 */
export class DualBrain {
    constructor(prompter) {
        this.prompter = prompter;
        this.modelHigh = settings.models?.high_iq || { provider: 'openai', model: 'gpt-4o' };
        this.modelFast = settings.models?.fast || { provider: 'google', model: 'gemini-flash' };

        // Rate Limiter State
        this.requestCount = 0;
        this.windowStart = Date.now();
        // Default: 200 requests per 12 hours (43200000 ms)
        this.limit = settings.models?.high_iq?.rate_limit || 200;
        this.windowSize = 12 * 60 * 60 * 1000;
    }

    /**
     * CHAT: Uses the Fast Model (Cheap/Unlimited)
     * For casual conversation, simple questions.
     */
    async chat(messages) {
        console.log('[DualBrain] Routing to FAST model (Chat)');
        // In a real implementation, we would swap the 'profile' model temporarily
        // or pass specific params to prompter. For now, we assume Prompter supports model override.
        return await this.prompter.chat(messages, this.modelFast);
    }

    /**
     * PLAN: Uses the High IQ Model (Expensive/Limited)
     * For complex reasoning, goal setting, strategy.
     */
    async plan(context) {
        if (!this._checkBudget()) {
            console.warn('[DualBrain] Budget exceeded! Falling back to Fast Model for Planning.');
            return await this._fallbackPlan(context);
        }

        console.log('[DualBrain] Routing to HIGH IQ model (Plan)');
        try {
            const res = await this.prompter.chat(context, this.modelHigh);
            this._consumeBudget();
            return res;
        } catch (error) {
            console.error('[DualBrain] HighIQ Failed:', error);
            return await this._fallbackPlan(context);
        }
    }

    /**
     * CODE: Uses the High IQ Model (Expensive/Limited)
     * For generating JavaScript, fixing bugs.
     */
    async code(prompt) {
        if (!this._checkBudget()) {
            throw new Error('Budget Exceeded for Coding. Cannot verify code safety with Fast Model.');
        }

        console.log('[DualBrain] Routing to HIGH IQ model (Coding)');
        try {
            // Ensure JSON mode or strict code generation prompt
            const res = await this.prompter.generateCode(prompt, this.modelHigh);
            this._consumeBudget();
            return res;
        } catch (error) {
            console.error('[DualBrain] Coding Failed:', error);
            throw error; // Coding error should propagate, don't fallback to dumb model for code
        }
    }

    _checkBudget() {
        const now = Date.now();
        if (now - this.windowStart > this.windowSize) {
            // Reset window
            this.requestCount = 0;
            this.windowStart = now;
            console.log('[DualBrain] Budget Window Reset.');
        }

        if (this.requestCount >= this.limit) {
            console.warn(`[DualBrain] Budget LIMIT Reached (${this.requestCount}/${this.limit})`);
            return false;
        }
        return true;
    }

    _consumeBudget() {
        this.requestCount++;
        console.log(`[DualBrain] Budget Used: ${this.requestCount}/${this.limit}`);
    }

    async _fallbackPlan(context) {
        console.log('[DualBrain] Executing Fallback Plan (Fast Model)');
        // Add a system instruction to keep it simple
        const fallbackContext = [
            { role: 'system', content: 'You are in Low-Power Mode. Give a simple, safe, and robust plan. Do not attempt complex strategies.' },
            ...context
        ];
        return await this.prompter.chat(fallbackContext, this.modelFast);
    }
}
