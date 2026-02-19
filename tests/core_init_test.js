import { CoreSystem } from '../src/agent/core/CoreSystem.js';
import { Agent } from '../src/agent/agent.js';

async function testCoreInit() {
    console.log('--- CoreSystem.initialize() Isolated Test ---');
    const agent = new Agent();

    // Minimal agent setup to satisfy CoreSystem requirements
    agent.config = { profiles: [], base_profile: 'survival' };

    const core = new CoreSystem(agent);
    agent.core = core;

    try {
        console.log('[Test] Calling core.initialize()...');
        await core.initialize();
        console.log('[Test] ✅ CoreSystem.initialize() completed successfully!');

        const coreModules = [
            'scheduler', 'memory', 'monitor', 'reflexes', 'toolRegistry',
            'social', 'intelligence', 'system2', 'scenarios', 'combatAcademy',
            'contextManager', 'extractor'
        ];

        let allPresent = true;
        for (const mod of coreModules) {
            if (!core[mod]) {
                console.error(`[Test] ❌ Missing bridged module in core: core.${mod}`);
                allPresent = false;
            } else {
                console.log(`[Test] ✅ Bridged module found: core.${mod}`);
            }
        }

        if (allPresent) {
            console.log('[Test] 🎉 SUCCESS: Core wiring is correct.');
            process.exit(0);
        } else {
            console.log('[Test] ❌ FAILURE: Core wiring is incomplete.');
            process.exit(1);
        }
    } catch (error) {
        console.error('[Test] 💥 FATAL ERROR during core initialization:', error);
        process.exit(1);
    }
}

testCoreInit();
