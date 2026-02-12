/**
 * StateStack.js
 * 
 * Brain Refactor Phase B: Multi-tasking via State Stack
 * 
 * Instead of a single mode variable, bot maintains a STACK of states.
 * When interrupted (combat, hunger), current state is PAUSED, new state PUSHED.
 * When interrupt resolves, old state is POPPED and RESUMED.
 * 
 * Example:
 *   Stack: ['Idle']
 *   User: "Build a house" → Push 'Build' → Stack: ['Idle', 'Build']
 *   Monster appears → Push 'Combat' → Stack: ['Idle', 'Build', 'Combat']
 *   Combat done → Pop 'Combat' → Stack: ['Idle', 'Build'] → Resume building
 */

import { ActionLogger } from '../utils/ActionLogger.js';

// State priority levels (higher = more urgent)
export const STATE_PRIORITY = {
    CRITICAL: 100,   // Near-death, drowning
    COMBAT: 80,      // Active combat
    SURVIVAL: 60,    // Hunger, shelter
    TASK: 40,        // User-assigned tasks
    IDLE: 0          // Default state
};

export class StateStack {
    constructor(agent) {
        this.agent = agent;
        this.stack = [];
        this.maxDepth = 10; // Prevent stack overflow

        // Initialize with Idle state
        this.push('Idle', STATE_PRIORITY.IDLE, {});

        ActionLogger.action('state_stack_init', { depth: this.stack.length });
    }

    /**
     * Push a new state onto the stack
     * @param {string} name - State name (e.g., 'Build', 'Combat', 'Eat')
     * @param {number} priority - State priority level
     * @param {object} context - State-specific data to preserve
     * @returns {boolean} - Whether push succeeded
     */
    push(name, priority = STATE_PRIORITY.TASK, context = {}) {
        // Prevent stack overflow
        if (this.stack.length >= this.maxDepth) {
            console.warn('[StateStack] Max depth reached! Cannot push:', name);
            ActionLogger.error('state_stack_overflow', { attempted: name });
            return false;
        }

        // Check if this state already exists in stack
        const existingIndex = this.stack.findIndex(s => s.name === name);
        if (existingIndex >= 0) {
            // Pause current state if it's not the one being promoted
            if (this.stack.length > 0 && this.peek().name !== name) {
                const current = this.peek();
                current.pausedAt = Date.now();
                console.log(`[StateStack] Pausing ${current.name} for promotion of ${name}`);
            }

            // Move to top instead of duplicating
            const existing = this.stack.splice(existingIndex, 1)[0];
            existing.context = { ...existing.context, ...context };
            existing.pausedAt = null;
            this.stack.push(existing);
            console.log(`[StateStack] Promoted ${name} to top`);
            return true;
        }

        const state = {
            name,
            priority,
            context,
            startTime: Date.now(),
            pausedAt: null
        };

        // Pause current state if exists
        if (this.stack.length > 0) {
            const current = this.peek();
            current.pausedAt = Date.now();
            console.log(`[StateStack] Pausing ${current.name} for ${name}`);
        }

        this.stack.push(state);
        ActionLogger.action('state_push', {
            name,
            priority,
            depth: this.stack.length,
            context: Object.keys(context)
        });
        console.log(`[StateStack] Pushed ${name} (P:${priority}). Depth: ${this.stack.length}`);

        return true;
    }

    /**
     * Pop the current state, resume previous
     * @returns {object|null} - The popped state, or null if only Idle remains
     */
    pop() {
        // Never pop below Idle
        if (this.stack.length <= 1) {
            console.log('[StateStack] Cannot pop: only Idle remains');
            return null;
        }

        const popped = this.stack.pop();
        const duration = Date.now() - popped.startTime;

        ActionLogger.action('state_pop', {
            name: popped.name,
            durationMs: duration,
            depth: this.stack.length
        });
        console.log(`[StateStack] Popped ${popped.name} (duration: ${(duration / 1000).toFixed(1)}s)`);

        // Resume previous state
        const current = this.peek();
        if (current) {
            current.pausedAt = null;
            console.log(`[StateStack] Resuming ${current.name}`);
        }

        return popped;
    }

    /**
     * Get current (top) state without removing
     * @returns {object|null}
     */
    peek() {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    }

    /**
     * Get current state name
     * @returns {string}
     */
    current() {
        const state = this.peek();
        return state ? state.name : 'Unknown';
    }

    /**
     * Get current state priority
     * @returns {number}
     */
    currentPriority() {
        const state = this.peek();
        return state ? state.priority : 0;
    }

    /**
     * Check if a state with given name exists anywhere in stack
     * @param {string} name 
     * @returns {boolean}
     */
    has(name) {
        return this.stack.some(s => s.name === name);
    }

    /**
     * Interrupt current state with higher priority state
     * Only succeeds if new priority > current priority
     * @param {string} name 
     * @param {number} priority 
     * @param {object} context 
     * @returns {boolean} - Whether interrupt succeeded
     */
    interrupt(name, priority, context = {}) {
        const current = this.peek();
        if (current && priority <= current.priority) {
            console.log(`[StateStack] Interrupt rejected: ${name}(P:${priority}) <= ${current.name}(P:${current.priority})`);
            return false;
        }
        return this.push(name, priority, context);
    }

    /**
     * Complete current state and pop
     * @param {boolean} success - Whether state completed successfully
     * @param {string} result - Optional result message
     */
    complete(success = true, result = '') {
        const current = this.peek();
        if (current && current.name !== 'Idle') {
            ActionLogger.action('state_complete', {
                name: current.name,
                success,
                result: result.substring(0, 100)
            });

            if (!success && this.agent.history) {
                // Record failure for history-aware planning
                this.agent.history.addError(current.name, result, current.context);
            }

            this.pop();
        }
    }

    /**
     * Clear all states except Idle
     */
    reset() {
        while (this.stack.length > 1) {
            this.pop();
        }
        console.log('[StateStack] Reset to Idle');
    }

    /**
     * Get debug info
     * @returns {object}
     */
    getStatus() {
        return {
            current: this.current(),
            depth: this.stack.length,
            stack: this.stack.map(s => `${s.name}(P:${s.priority})`).reverse()
        };
    }

    /**
     * Get context of current state
     * @returns {object}
     */
    getContext() {
        const state = this.peek();
        return state ? state.context : {};
    }

    /**
     * Update context of current state
     * @param {object} updates 
     */
    updateContext(updates) {
        const state = this.peek();
        if (state) {
            state.context = { ...state.context, ...updates };
        }
    }
}
