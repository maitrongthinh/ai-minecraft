/**
 * CodeSandbox.js - Safety Sandbox for AI-Generated Code (Hardened v2.5)
 */

import ivm from 'isolated-vm';

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
        this.timeout = options.timeout || 5000;
        this.memoryLimit = 64; // 64MB strictly enforced
    }

    createMockBotState() {
        return {
            entity: { position: { x: 0, y: 64, z: 0 } },
            health: 20,
            food: 20,
            inventory: { count: 0 }
        };
    }

    scanForDanger(code) {
        const dangers = [];
        for (const { pattern, reason } of DANGER_PATTERNS) {
            if (pattern.test(code)) dangers.push(reason);
        }
        return { safe: dangers.length === 0, dangers };
    }

    async execute(codeString, contextData = {}) {
        const dangerScan = this.scanForDanger(codeString);
        if (!dangerScan.safe) {
            return { success: false, error: `Dangerous code: ${dangerScan.dangers.join(', ')}` };
        }

        const isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
        try {
            const context = await isolate.createContext();
            const jail = context.global;

            await jail.set('log', function (...args) {
                console.log('[Sandbox]', ...args);
            });

            const globals = ['Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean'];
            for (const g of globals) {
                await jail.set(g, new ivm.ExternalCopy(global[g]).copyInto());
            }

            await jail.set('contextData', new ivm.ExternalCopy(contextData).copyInto());

            const mockBot = this.createMockBotState();
            await jail.set('bot', new ivm.ExternalCopy(mockBot).copyInto());

            const script = await isolate.compileScript(codeString);
            const result = await script.run(context, { timeout: this.timeout });

            return { success: true, result };
        } catch (e) {
            let errorMsg = e.message;
            if (e.message.includes('Script execution timed out')) {
                errorMsg = `Timeout: Code took longer than ${this.timeout}ms`;
            }
            return { success: false, error: `Execution error: ${errorMsg}` };
        } finally {
            isolate.dispose();
        }
    }

    async validate(code) {
        const startTime = Date.now();
        const execution = await this.execute(code);
        return {
            valid: execution.success,
            checks: { execution },
            duration: Date.now() - startTime
        };
    }
}

export default CodeSandbox;
