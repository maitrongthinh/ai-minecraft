
/**
 * DynamicReflex.js
 * 
 * Represents a runtime-generated reflex that can be loaded/unloaded 
 * without restarting the bot.
 */
export class DynamicReflex {
    constructor(definition) {
        this.id = definition.id;
        this.version = definition.version || 1;
        this.trigger = definition.trigger || {}; // { signal: '...', conditions: {} }
        this.action = definition.action || {};   // { type: 'inline_code', code: '...' }
        this.metadata = definition.metadata || {};
    }

    /**
     * Checks if this reflex should trigger based on the signal and data.
     */
    matchesSignal(signalType, signalData) {
        if (signalType !== this.trigger.signal) return false;

        if (!this.trigger.conditions) return true;

        for (const [key, rule] of Object.entries(this.trigger.conditions)) {
            // Support nested keys like 'payload.depth'
            const val = this._getValue(signalData, key);

            if (val === undefined) return false;

            // Operators: gt, lt, eq, neq, contains
            if (rule.operator === 'gt' && !(val > rule.value)) return false;
            if (rule.operator === 'lt' && !(val < rule.value)) return false;
            if (rule.operator === 'gte' && !(val >= rule.value)) return false;
            if (rule.operator === 'lte' && !(val <= rule.value)) return false;
            if (rule.operator === 'eq' && val != rule.value) return false;
            if (rule.operator === 'neq' && val == rule.value) return false;
        }

        return true;
    }

    _getValue(obj, path) {
        return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
    }

    /**
     * Executes the reflex action.
     */
    async execute(bot, agent, signalPayload) {
        if (this.action.type === 'inline_code') {
            try {
                // Determine parameters based on signature of code
                // Code is expected to be an async function body
                // Warning: eval/Function is dangerous, but required for self-modification
                const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
                const func = new AsyncFunction('bot', 'agent', 'payload', this.action.code);

                console.log(`[DynamicReflex:${this.id}] Executing...`);
                await func(bot, agent, signalPayload);

                this._recordOutcome(true);
            } catch (err) {
                console.error(`[DynamicReflex:${this.id}] Execution failed:`, err);
                this._recordOutcome(false);
            }
        }
    }

    _recordOutcome(success) {
        if (!this.metadata.stats) this.metadata.stats = { success: 0, fail: 0 };
        if (success) this.metadata.stats.success++;
        else this.metadata.stats.fail++;
    }

    toJSON() {
        return {
            id: this.id,
            version: this.version,
            trigger: this.trigger,
            action: this.action,
            metadata: this.metadata
        };
    }
}
