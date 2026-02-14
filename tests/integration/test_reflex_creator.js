
import { ReflexCreatorEngine } from '../../src/agent/core/ReflexCreatorEngine.js';
import { DynamicReflex } from '../../src/agent/core/DynamicReflex.js';
import { EvolutionEngine } from '../../src/agent/core/EvolutionEngine.js';
import { globalBus, SIGNAL } from '../../src/agent/core/SignalBus.js';

// Mock Agent
const mockAgent = {
    name: 'TestBot',
    bot: {
        username: 'TestBot',
        on: () => { },
        removeListener: () => { },
        _client: { on: () => { }, removeListener: () => { } }
    },
    brain: {
        generateReflexCode: async () => 'async (bot, agent) => { console.log("Reflex Executed"); }'
    },
    evolution: null, // Will be set
    core: { reflexSystem: { registerDynamicReflex: () => { } } }
};

async function testReflexCreator() {
    console.log('--- Testing Reflex Creator Integration ---');

    // 1. Setup
    const evolution = new EvolutionEngine(mockAgent);
    mockAgent.evolution = evolution;

    // Mock init
    if (evolution.reflexCreator) {
        // Override storage path to avoid writing to real bot folder
        evolution.reflexCreator.storagePath = './temp_reflexes.json';
    }

    // 2. Simulate Death Analysis
    console.log('Simulating Death Event...');
    const deathEvent = {
        cause: 'fall_damage',
        timestamp: Date.now()
    };

    // Mock analyzeAndCreate to verify call
    let analyzeCalled = false;
    evolution.reflexCreator.analyzeAndCreate = async (analysis) => {
        console.log('ReflexCreator.analyzeAndCreate called with:', analysis);
        analyzeCalled = true;

        // Simulate creation
        const def = {
            id: 'test_reflex',
            trigger: { signal: SIGNAL.ENV_CLIFF_AHEAD },
            action: { type: 'inline_code', code: 'console.log("Action");' }
        };
        await evolution.reflexCreator.registerReflex(def);
    };

    await evolution._handleDeathAnalysis(deathEvent);

    if (!analyzeCalled) {
        console.error('❌ ReflexCreator was NOT called.');
        process.exit(1);
    }
    console.log('✅ ReflexCreator called successfully.');

    // 3. Test Dynamic Reflex Execution
    console.log('Testing DynamicReflex execution...');
    const reflex = new DynamicReflex({
        id: 'test_reflex',
        trigger: { signal: SIGNAL.ENV_CLIFF_AHEAD },
        action: { type: 'inline_code', code: 'console.log("Dynamic Code Running"); payload.executed = true;' }
    });

    const payload = { executed: false };
    await reflex.execute(mockAgent.bot, mockAgent, payload);

    if (payload.executed) {
        console.log('✅ Dynamic Reflex executed code.');
    } else {
        console.error('❌ Dynamic Reflex code failed.');
        process.exit(1);
    }

    console.log('ALL TESTS PASSED');
    process.exit(0);
}

testReflexCreator().catch(console.error);
