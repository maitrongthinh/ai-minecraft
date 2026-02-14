
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Mock ReflexSystem to avoid circular deps and heavy init
class MockReflexSystem {
    constructor(agent) {
        this.agent = agent;
        this.dynamicReflexes = new Map();
    }
    connect(bot) { }
    registerDynamicReflex(reflex) {
        // Same logic as real one for testing the REGISTRATION
        if (!reflex || !reflex.id) return;
        reflex._listener = async (data) => {
            if (reflex.matchesSignal(reflex.trigger.signal, data)) {
                await reflex.execute(this.agent.bot, this.agent, data);
            }
        };
        globalBus.subscribe(reflex.trigger.signal, reflex._listener);
        this.dynamicReflexes.set(reflex.id, reflex);
        console.log(`[ReflexSystem] 🧠 Dynamic Reflex Registered: ${reflex.id}`);
    }
}

import { ReflexCreatorEngine } from '../../src/agent/core/ReflexCreatorEngine.js';
// Replace real ReflexSystem with Mock
const ReflexSystem = MockReflexSystem;

import { globalBus, SIGNAL } from '../../src/agent/core/SignalBus.js';
import fs from 'fs';
import path from 'path';

// Mock Agent
const mockBot = {
    on: () => { },
    removeListener: () => { },
    _client: { on: () => { }, removeListener: () => { } },
    entity: { position: { x: 0, y: 0, z: 0 } },
    setControlState: (ctrl, state) => console.log(`[MockBot] Control: ${ctrl} = ${state}`)
};

const mockAgent = {
    name: 'TestBot',
    bot: mockBot,
    evolution: null, // Circular dependency mock
    brain: {
        generateCode: async (prompt) => {
            console.log('[MockBrain] Generating reflex code...');
            return JSON.stringify({
                id: 'dr_creeper_blast',
                name: 'Anti-Creeper Reflex',
                trigger: { signal: 'THREAT_DETECTED' },
                action: {
                    type: 'inline_code',
                    code: "console.log('Reflex Executed!'); bot.setControlState('back', true);"
                },
                priority: 8
            });
        }
    }
};

async function testDynamicEvolution() {
    console.log('--- Testing Dynamic Reflex Evolution ---');

    // 1. Setup
    const reflexSystem = new ReflexSystem(mockAgent);
    const creator = new ReflexCreatorEngine(mockAgent);
    mockAgent.evolution = { reflexCreator: creator };

    // Initialize Creator (Storage)
    await creator.init();

    // Clear any existing test reflex
    const testReflexId = 'dr_creeper_blast';
    if (creator.reflexes.has(testReflexId)) {
        creator.reflexes.delete(testReflexId);
    }
    // Also clear from disk if present
    // (Actual file deletion handled at end)

    // Hook up systems
    reflexSystem.connect(mockBot);

    // 2. Simulate Death Analysis Input
    const deathAnalysis = {
        cause: 'creeper_blast',
        context: { distance: 3 },
        message: 'Blew up by Creeper'
    };

    // 3. Trigger Creation
    console.log('[Test] Triggering analyzeAndCreate...');
    const reflex = await creator.analyzeAndCreate(deathAnalysis);

    if (!reflex) {
        console.error('❌ Failed to create reflex.');
        // Don't exit process manually, let node finish
        return;
    }

    console.log(`✅ Reflex Created: ${reflex.id}`);

    // 4. Register with System 
    reflexSystem.registerDynamicReflex(reflex);

    // 5. Verify Execution
    console.log('[Test] Emitting THREAT_DETECTED signal...');

    // Mock signal data
    globalBus.emitSignal(SIGNAL.THREAT_DETECTED, { type: 'creeper' });

    // Wait a bit for async execution
    await new Promise(r => setTimeout(r, 500));

    // Cleanup
    const filePath = creator.storagePath;
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('[Test] Cleaned up test file.');
    }
}

testDynamicEvolution().catch(console.error);
