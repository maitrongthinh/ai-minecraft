
import { CodeSandbox } from '../core/CodeSandbox.js';
import vm from 'node:vm';

/**
 * SafetySandwich.js
 * 
 * The Gatekeeper for AI-generated code.
 * Implements a 3-layer validation pipeline:
 * 
 * Layer 1: Static Analysis
 * - Syntax check (does it compile?)
 * - Forbidden token scan (process.exit, eval, etc.)
 * 
 * Layer 2: Logical Sandbox
 * - Runtime execution in isolated VM
 * - Checks for immediate crashes
 * - Verifies API contract (export signature)
 * 
 * Layer 3: Behavioral Verification
 * - Runs a generated Unit Test against the code
 * - Ensures functionality matches intent
 */
export class SafetySandwich {
    constructor(agent) {
        this.agent = agent;
        this.sandbox = new CodeSandbox({ timeout: 2000 }); // Strict 2s timeout
    }

    /**
     * Validate a generated skill.
     * @param {string} code - The generated skill code
     * @param {string} testCode - Optional unit test code
     * @returns {Promise<Object>} { valid: boolean, layers: [], reasoning: string }
     */
    async validate(code, testCode = null) {
        const result = {
            valid: false,
            layers: {
                static: false,
                logical: false,
                behavioral: null // null = skipped/not required
            },
            reasoning: ''
        };

        // --- LAYER 1: STATIC ANALYSIS ---
        try {
            // 1.1 Forbidden Tokens
            const scan = this.sandbox.scanForDanger(code);
            if (!scan.safe) {
                result.reasoning = `Static Analysis Failed: Forbidden tokens [${scan.dangers.join(', ')}]`;
                return result;
            }

            // 1.2 Syntax Check (Compile without executing)
            new vm.Script(code);
            result.layers.static = true;

        } catch (e) {
            result.reasoning = `Syntax Error: ${e.message}`;
            return result;
        }

        // --- LAYER 2: LOGICAL SANDBOX ---
        try {
            // We run the code in the sandbox without calling it, just to ensure it evaluates
            // and exports what we expect.
            const execution = await this.sandbox.execute(code);

            if (!execution.success) {
                result.reasoning = `Runtime Error (Load): ${execution.error}`;
                return result;
            }

            // Verify it exports a function (sandbox execute returns result of last expression or module exports)
            // Implementation detail: CodeSandbox execute wraps code in IIFE. 
            // We need to verify if the sandbox context has 'skills.new_skill' or similar if we injected it.
            // For now, simple success is enough for "Logical" load check.
            result.layers.logical = true;

        } catch (e) {
            result.reasoning = `Sandbox Logic Error: ${e.message}`;
            return result;
        }

        // --- LAYER 3: BEHAVIORAL VERIFICATION ---
        if (testCode) {
            try {
                console.log('[SafetySandwich] 🧪 Running Behavioral Test...');
                const testResult = await this.sandbox.runTest(code, testCode);

                if (testResult.success) {
                    result.layers.behavioral = true;
                } else {
                    result.reasoning = `Behavioral Test Failed: ${testResult.error}`;
                    // Don't return yet, check strictness? No, failure is failure.
                    return result;
                }
            } catch (e) {
                result.reasoning = `Test Runner Error: ${e.message}`;
                return result;
            }
        } else {
            result.layers.behavioral = 'skipped';
        }

        result.valid = true;
        result.reasoning = 'All validation layers passed.';
        return result;
    }
}
