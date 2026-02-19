export const STATE_PRIORITY = {
    CRITICAL: 100,
    HIGH: 80,
    NORMAL: 50,
    LOW: 20,
    BACKGROUND: 10
};

function normalizePriority(input) {
    if (Number.isFinite(input)) return Number(input);
    if (typeof input !== 'string') return STATE_PRIORITY.NORMAL;

    const key = input.trim().toUpperCase();
    if (STATE_PRIORITY[key] !== undefined) return STATE_PRIORITY[key];
    return STATE_PRIORITY.NORMAL;
}

export class StateStack {
    constructor(agent) {
        this.agent = agent;
        this.stack = [];
    }

    push(name, priorityOrMeta = STATE_PRIORITY.NORMAL, meta = {}) {
        if (!name) return null;

        let priority = priorityOrMeta;
        let metadata = meta;

        // Support both signatures:
        // push(name, priority, meta) and push(name, { priority, ...meta })
        if (priorityOrMeta && typeof priorityOrMeta === 'object' && !Array.isArray(priorityOrMeta)) {
            priority = priorityOrMeta.priority;
            metadata = { ...priorityOrMeta };
            delete metadata.priority;
        }

        const normalizedName = String(name).trim();
        const state = {
            name: normalizedName,
            priority: normalizePriority(priority),
            meta: metadata && typeof metadata === 'object' ? { ...metadata } : {},
            timestamp: Date.now()
        };

        // Keep only one active state per name to avoid unbounded growth.
        this.stack = this.stack.filter(s => s.name.toLowerCase() !== normalizedName.toLowerCase());
        this.stack.push(state);
        this.stack.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.timestamp - a.timestamp;
        });

        return state;
    }

    has(name) {
        if (!name) return false;
        const needle = String(name).toLowerCase();
        return this.stack.some(s => s.name.toLowerCase() === needle);
    }

    peek() {
        return this.stack[0] || null;
    }

    current() {
        return this.peek()?.name || null;
    }

    pop(name = null) {
        if (this.stack.length === 0) return null;
        if (!name) return this.stack.shift() || null;

        const needle = String(name).toLowerCase();
        const idx = this.stack.findIndex(s => s.name.toLowerCase() === needle);
        if (idx === -1) return null;
        const [removed] = this.stack.splice(idx, 1);
        return removed || null;
    }

    clear() {
        this.stack = [];
    }

    toJSON() {
        return this.stack.map(s => ({
            name: s.name,
            priority: s.priority,
            meta: { ...s.meta },
            timestamp: s.timestamp
        }));
    }

    restore(states) {
        if (!Array.isArray(states)) return;
        this.stack = [];
        for (const state of states) {
            if (!state?.name) continue;
            this.push(state.name, state.priority, state.meta || {});
        }
    }
}
