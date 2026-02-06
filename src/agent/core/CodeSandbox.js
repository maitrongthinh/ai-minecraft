/**
 * CodeSandbox.js - Safety Sandbox for AI-Generated Code
 * 
 * Phase 2: Evolution Engine
 * 
 * Uses Node's built-in vm module to run AI code in isolated context.
 * Protects against: infinite loops, dangerous APIs, malformed code.
 */

import vm from 'vm';

// Dangerous patterns that should never appear in generated code
const DANGER_PATTERNS = [
    { pattern: /process\./, reason: 'Access to process is forbidden' },
    { pattern: /require\s*\(/, reason: 'require() is forbidden' },
    { pattern: /import\s+/, reason: 'import statements are forbidden' },
    { pattern: /eval\s*\(/, reason: 'eval() is forbidden' },
    { pattern: /Function\s*\(/, reason: 'Function constructor is forbidden' },
    { pattern: /while\s*\(\s*true\s*\)/, reason: 'Infinite loops are forbidden' },
    { pattern: /for\s*\(\s*;\s*;\s*\)/, reason: 'Infinite loops are forbidden' },
    { pattern: /fs\./, reason: 'Filesystem access is forbidden' },
    { pattern: /child_process/, reason: 'Child process is forbidden' },
    { pattern: /\.exit\s*\(/, reason: 'exit() is forbidden' }
];

export class CodeSandbox {
    constructor(options = {}) {
        this.timeout = options.timeout || 100; // ms - very strict
        this.memoryLimit = options.memoryLimit || 10 * 1024 * 1024; // 10MB
    }

    /**
     * Create a mock bot for sandbox testing
     * Returns success for all operations
     */
    createMockBot() {
        const noop = () => Promise.resolve(true);
        const mockEntity = {
            position: { x: 0, y: 64, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            yaw: 0,
            pitch: 0
        };

        return {
            entity: mockEntity,
            health: 20,
            food: 20,

            // Movement
            pathfinder: {
                setGoal: noop,
                setMovements: noop,
                goto: noop,
                isMoving: () => false,
                stop: noop
            },

            // Actions
            dig: noop,
            placeBlock: noop,
            equip: noop,
            activateItem: noop,
            deactivateItem: noop,
            attack: noop,
            useOn: noop,

            // Inventory
            inventory: {
                items: () => [],
                findInventoryItem: () => null,
                count: () => 0
            },

            // World
            blockAt: () => ({ name: 'stone', type: 1 }),
            findBlock: () => null,
            findBlocks: () => [],

            // Chat
            chat: console.log,
            whisper: console.log,

            // Control
            setControlState: noop,
            clearControlStates: noop,
            look: noop,
            lookAt: noop,

            // Events (no-op for sandbox)
            on: () => { },
            once: () => { },
            removeListener: () => { }
        };
    }

    /**
     * Scan code for dangerous patterns before execution
     * @param {string} code - Code to scan
     * @returns {Object} { safe: boolean, dangers: string[] }
     */
    scanForDanger(code) {
        const dangers = [];

        for (const { pattern, reason } of DANGER_PATTERNS) {
            if (pattern.test(code)) {
                dangers.push(reason);
            }
        }

        return {
            safe: dangers.length === 0,
            dangers
        };
    }

    /**
     * Validate code syntax without execution
     * @param {string} code - Code to validate
     * @returns {Object} { valid: boolean, error?: string }
     */
    validateSyntax(code) {
        try {
            new vm.Script(code);
            return { valid: true };
        } catch (e) {
            return { valid: false, error: e.message };
        }
    }

    /**
     * Run code in sandbox with timeout
     * @param {string} code - Code to execute
     * @returns {Object} { success: boolean, result?: any, error?: string }
     */
    execute(code) {
        // Step 1: Scan for dangerous patterns
        const dangerScan = this.scanForDanger(code);
        if (!dangerScan.safe) {
            return {
                success: false,
                error: `Dangerous code detected: ${dangerScan.dangers.join(', ')}`
            };
        }

        // Step 2: Validate syntax
        const syntaxCheck = this.validateSyntax(code);
        if (!syntaxCheck.valid) {
            return {
                success: false,
                error: `Syntax error: ${syntaxCheck.error}`
            };
        }

        // Step 3: Execute in sandbox
        const context = vm.createContext({
            bot: this.createMockBot(),
            vec3: (x, y, z) => ({ x, y, z }),
            console: {
                log: () => { },
                warn: () => { },
                error: () => { }
            },
            setTimeout: () => { },
            setInterval: () => { },
            Promise: Promise,
            Math: Math,
            Date: Date,
            JSON: JSON,
            Array: Array,
            Object: Object,
            String: String,
            Number: Number,
            Boolean: Boolean
        });

        try {
            const result = vm.runInContext(code, context, {
                timeout: this.timeout,
                breakOnSigint: true
            });

            return { success: true, result };
        } catch (e) {
            if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
                return {
                    success: false,
                    error: `Timeout: Code took longer than ${this.timeout}ms`
                };
            }
            return {
                success: false,
                error: `Runtime error: ${e.message}`
            };
        }
    }

    /**
     * Full validation pipeline
     * @param {string} code - AI-generated code to validate
     * @returns {Object} Validation result
     */
    validate(code) {
        const startTime = Date.now();

        // Run all checks
        const dangerScan = this.scanForDanger(code);
        const syntaxCheck = this.validateSyntax(code);
        const execution = dangerScan.safe && syntaxCheck.valid
            ? this.execute(code)
            : { success: false, skipped: true };

        return {
            valid: dangerScan.safe && syntaxCheck.valid && execution.success,
            checks: {
                dangerScan,
                syntaxCheck,
                execution
            },
            duration: Date.now() - startTime
        };
    }
}

export default CodeSandbox;
