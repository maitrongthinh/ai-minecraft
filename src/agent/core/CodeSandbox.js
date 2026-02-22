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
    { pattern: /\.exit\s*\(/, reason: 'exit() is forbidden' },
    { pattern: /__proto__/, reason: 'Access to __proto__ is forbidden' },
    { pattern: /prototype/, reason: 'Access to prototype is forbidden' },
    { pattern: /constructor/, reason: 'Access to constructor is forbidden' },
    { pattern: /global\./, reason: 'Access to global is forbidden' }
];

export class CodeSandbox {
    constructor(options = {}) {
        this.timeout = options.timeout || 5000;
        this.memoryLimit = 64; // 64MB strictly enforced
    }

    createEnhancedMock() {
        return {
            entity: { position: { x: 0, y: 64, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 },
            health: 20,
            food: 20,
            username: 'Bot',
            inventory: {
                items: [],
                count: 0,
                findInventoryItem: () => null
            },
            pathfinder: {
                setGoal: () => { },
                setMovements: () => { },
                isMoving: () => false
            },
            pvp: {
                attack: () => { },
                stop: () => { }
            },
            chat: () => { },
            look: () => Promise.resolve(),
            lookAt: () => Promise.resolve()
        };
    }

    /**
     * Run a generated skill + test in the sandbox
     */
    async runTest(skillCode, testCode) {
        const fullScript = `
        (async () => {
            // 1. Inject Skill
            ${skillCode}
            
            // 2. Mock Test Framework
            let testsPassed = 0;
            let testsFailed = 0;
            const failures = [];
            
            function assert(condition, message) {
                if (!condition) {
                    testsFailed++;
                    failures.push(message);
                    throw new Error(message);
                } else {
                    testsPassed++;
                }
            }
            
            // 3. Inject Test Code
            try {
                // Wrap test code to ensure it uses the 'bot' global
                ${testCode}
            } catch (e) {
                throw new Error("Test execution failed: " + e.message);
            }
            
            return { passed: testsPassed, failed: testsFailed, failures };
        })();
        `;

        // Use execute but with deep mock
        const isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
        try {
            const context = await isolate.createContext();
            const jail = context.global;

            await jail.set('log', function (...args) { /* console.log('[SandboxTest]', ...args); */ });

            // Deep Mock
            const mockBot = this.createEnhancedMock();

            // Inject globals manually since ExternalCopy has limits with methods
            await context.evalClosure(`
                globalThis.bot = {
                    health: $0.health,
                    food: $0.food,
                    entity: $0.entity,
                    username: $0.username,
                    inventory: { items: () => [], findInventoryItem: () => null },
                    pathfinder: { setGoal: () => {}, setMovements: () => {} },
                    pvp: { attack: () => {} },
                    chat: (msg) => log(msg)
                };
                globalThis.skills = {};
                globalThis.Vec3 = class Vec3 { constructor(x,y,z){this.x=x;this.y=y;this.z=z;} };
            `, [mockBot], { arguments: { copy: true } });

            const script = await isolate.compileScript(fullScript);
            const result = await script.run(context, { promise: true, timeout: this.timeout, result: { copy: true, promise: true } });

            return { success: true, ...result };

        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            isolate.dispose();
        }
    }

    scanForDanger(code) {
        const dangers = [];
        for (const { pattern, reason } of DANGER_PATTERNS) {
            if (pattern.test(code)) dangers.push(reason);
        }
        return { safe: dangers.length === 0, dangers };
    }

    async execute(codeString, contextData = {}, actionAPI = null, skillLibrary = null) {
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

            // Bridge for real actions
            if (actionAPI) {
                const dispatchRef = new ivm.Reference(async (type, params) => {
                    try {
                        const res = await actionAPI.dispatch({ type, params: JSON.parse(params) });
                        const safeRes = JSON.parse(JSON.stringify(res || { success: true }));
                        return new ivm.ExternalCopy(safeRes).copyInto();
                    } catch (e) {
                        return new ivm.ExternalCopy({ success: false, error: e.message }).copyInto();
                    }
                });
                await jail.set('_jail_dispatch_ref', dispatchRef);
                await context.evalClosure(`
                    globalThis._jail_dispatch = function(type, params) {
                        return _jail_dispatch_ref.apply(undefined, [type, params], { promise: true, arguments: { copy: true } });
                    };
                `);
            }

            // Bridge for library skills
            if (skillLibrary) {
                const skillDispatchRef = new ivm.Reference(async (name, ...args) => {
                    try {
                        const skillFn = skillLibrary[name];
                        if (typeof skillFn !== 'function') throw new Error(`Skill ${name} not found in library`);

                        const res = await skillFn(actionAPI.agent, ...args);
                        const safeRes = JSON.parse(JSON.stringify(res || { success: true }));
                        return new ivm.ExternalCopy(safeRes).copyInto();
                    } catch (e) {
                        return new ivm.ExternalCopy({ success: false, error: e.message }).copyInto();
                    }
                });
                await jail.set('_jail_skill_dispatch_ref', skillDispatchRef);
                await context.evalClosure(`
                    globalThis._jail_skill_dispatch = function(name, ...args) {
                        return _jail_skill_dispatch_ref.apply(undefined, [name, ...args], { promise: true, arguments: { copy: true } });
                    };
                `);
            }


            await jail.set('contextData', new ivm.ExternalCopy(contextData).copyInto());

            // Reconstruct Bot Object (Using Enhanced Mock if not provided)
            const botData = contextData.botState || this.createEnhancedMock();

            // We use evalClosure to create the bot object with methods matching the API
            await context.evalClosure(`
                globalThis.bot = {
                    health: $0.health,
                    food: $0.food,
                    entity: $0.entity,
                    inventory: {
                        items: () => [], 
                        count: 0
                    },
                    username: $0.username || 'Bot',
                    chat: (msg) => log('[Sandbox:Chat]', msg),
                    navigate: (dest) => log('[Sandbox:Navigate]', dest),
                    __call_action__: (type, params) => {
                        if (typeof _jail_dispatch !== 'undefined') {
                            return _jail_dispatch(type, JSON.stringify(params));
                        }
                        throw new Error('Action bridge not available');
                    },
                    __call_skill__: (name, ...args) => {
                        if (typeof _jail_skill_dispatch !== 'undefined') {
                            return _jail_skill_dispatch(name, ...args);
                        }
                        throw new Error('Skill bridge not available');
                    },
                    time: $0.time || { timeOfDay: 0, day: 0, isDay: true },
                    game: $0.game || { gameMode: 'survival', difficulty: 'easy', dimension: 'overworld' }
                };
                globalThis.Vec3 = class Vec3 { constructor(x,y,z){this.x=x;this.y=y;this.z=z;} };
            `, [botData], { arguments: { copy: true } });

            // Reconstruct skills object
            await context.eval(`globalThis.skills = {};`);
            const skillsSource = contextData.skillsSource || {};
            for (const [name, source] of Object.entries(skillsSource)) {
                try {
                    let cleanSource = source.replace(/^export\s+/, '').trim();
                    if (cleanSource.length > 0) {
                        await jail.set('_tmp_source_' + name, cleanSource);
                        await context.eval(`
                            (function() {
                                try {
                                    // Wrap in parens to ensure it evaluates as an expression
                                    const fn = eval('(' + _tmp_source_${name} + ')'); 
                                    globalThis.skills['${name}'] = fn;
                                    globalThis['${name}'] = fn; 
                                    delete globalThis['_tmp_source_${name}']; 
                                } catch(e) {
                                    log('[Sandbox] Error evaling skill ${name}: ' + e.message);
                                }
                            })();
                        `);
                    }
                } catch (e) {
                    console.log('[CodeSandbox] Failed to inject skill:', name, e.message);
                }
            }

            // Reconstruct actions object (nested)
            await context.eval(`globalThis.actions = {};`);
            const actionsSource = contextData.actionsSource || {};
            for (const [name, source] of Object.entries(actionsSource)) {
                try {
                    await jail.set('_tmp_source_action_' + name, source);
                    await context.eval(`
                        (function() {
                            try {
                                const fn = eval('(' + _tmp_source_action_${name} + ')'); 
                                globalThis.actions['${name}'] = fn;
                                delete globalThis['_tmp_source_action_${name}']; 
                            } catch(e) {
                                log('[Sandbox] Error evaling action ${name}: ' + e.message);
                            }
                        })();
                    `);
                } catch (e) {
                    console.log('[CodeSandbox] Failed to inject action:', name, e.message);
                }
            }

            const wrappedCode = `
            (async () => {
                ${codeString}
            })();
            `;

            const script = await isolate.compileScript(wrappedCode);
            const result = await script.run(context, {
                promise: true,
                result: { copy: true, promise: true },
                timeout: this.timeout
            });

            return { success: true, result };
        } catch (e) {
            let errorMsg = e.message;
            if (e.message && e.message.includes('Script execution timed out')) {
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
