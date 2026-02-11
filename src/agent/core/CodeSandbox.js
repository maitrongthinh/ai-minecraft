/**
 * CodeSandbox.js - Safety Sandbox for AI-Generated Code
 * 
 * Phase 2: Evolution Engine
 * 
 * Uses Node's built-in vm module to run AI code in isolated context.
 * Protects against: infinite loops, dangerous APIs, malformed code.
 */

import ivm from 'isolated-vm';

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
        this.timeout = options.timeout || 500; // ms - bit more generous for isolated-vm
        this.memoryLimit = options.memoryLimit || 128; // 128MB as per strategic audit
    }

    /**
     * Create a mock bot for sandbox testing
     * Note: In isolated-vm, we pass a simplified state rather than complex objects
     */
    createMockBotState() {
        return {
            entity: { position: { x: 0, y: 64, z: 0 } },
            health: 20,
            food: 20,
            inventory: { count: 0 }
        };
    }

    /**
     * Scan code for dangerous patterns before execution
     */
    scanForDanger(code) {
        const dangers = [];
        for (const { pattern, reason } of DANGER_PATTERNS) {
            if (pattern.test(code)) dangers.push(reason);
        }
        return { safe: dangers.length === 0, dangers };
    }

    /**
     * Run code in isolated-vm sandbox
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

        const isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
        try {
            const context = isolate.createContextSync();
            const jail = context.global;

            // Setup global environment
            jail.setSync('global', jail.derefInto());

            // Inject basic mocks and globals
            // Note: complex bot interaction is usually handled via SignalBus outside sandbox
            // but for simple skill validation, we provide minimal mocks
            const mockBot = this.createMockBotState();
            jail.setSync('bot', new ivm.ExternalCopy(mockBot).copyInto());

            // Add standard globals
            const globals = ['Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean'];
            globals.forEach(g => {
                jail.setSync(g, new ivm.ExternalCopy(global[g]).copyInto());
            });

            const script = isolate.compileScriptSync(code);
            const result = script.runSync(context, { timeout: this.timeout });

            return { success: true, result };
        } catch (e) {
            let errorMsg = e.message;
            if (e.message.includes('Script execution timed out')) {
                errorMsg = `Timeout: Code took longer than ${this.timeout}ms`;
            }
            return {
                success: false,
                error: `Execution error: ${errorMsg}`
            };
        } finally {
            // Crucial: Clean up the isolate to reclaim memory immediately
            isolate.dispose();
        }
    }

    /**
     * Full validation pipeline
     */
    validate(code) {
        const startTime = Date.now();
        const dangerScan = this.scanForDanger(code);

        let execution;
        if (dangerScan.safe) {
            execution = this.execute(code);
        } else {
            execution = { success: false, skipped: true };
        }

        return {
            valid: dangerScan.safe && execution.success,
            checks: {
                dangerScan,
                execution
            },
            duration: Date.now() - startTime
        };
    }
}

export default CodeSandbox;
