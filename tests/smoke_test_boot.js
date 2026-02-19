import { Agent } from '../src/agent/agent.js';
import process from 'process';

async function runSmokeTest() {
    console.log('--- MIND-SYNC Smoke Test: Boot Sequence ---');
    const agent = new Agent();

    // Mock _connectToMinecraft to avoid real network attempts
    agent._connectToMinecraft = async () => {
        console.log('[SmokeTest] Mocked _connectToMinecraft called.');
        agent.isReady = true;
        return true;
    };

    try {
        console.log('[SmokeTest] Calling agent.start()...');
        // We might need to mock settings or environment variables if start() fails early
        await agent.start();

        console.log('[SmokeTest] Checking core modules...');
        const requiredModules = [
            'scheduler', 'memory', 'social', 'intelligence',
            'scenarios', 'contextManager', 'evolution',
            'toolRegistry', 'system2', 'combatAcademy', 'extractor'
        ];

        let allPresent = true;
        for (const mod of requiredModules) {
            if (!agent[mod]) {
                console.error(`[SmokeTest] ❌ Missing module: agent.${mod}`);
                allPresent = false;
            } else {
                console.log(`[SmokeTest] ✅ Module found: agent.${mod}`);
            }
        }

        if (allPresent) {
            console.log('[SmokeTest] 🎉 SUCCESS: All core modules initialized and bridged.');
            process.exit(0);
        } else {
            console.log('[SmokeTest] ❌ FAILURE: Some core modules are missing.');
            process.exit(1);
        }
    } catch (error) {
        console.error('[SmokeTest] 💥 FATAL ERROR during boot:');
        console.error(error);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

runSmokeTest();
