
import { globalBus, SIGNAL } from '../../src/agent/core/SignalBus.js';
import EvolutionEngine from '../../src/agent/core/EvolutionEngine.js';
import { ToolRegistry } from '../../src/agent/core/ToolRegistry.js';

// Mock Agent
class MockAgent {
    constructor() {
        this.bus = globalBus;
        this.toolRegistry = new ToolRegistry(this);
        // Mock Sandbox for EvolutionEngine
        this.brain = {
            generateReflexCode: async () => `
                // Code block
                console.log("Hello");
                const action = async (agent, params) => { return { success: true }; };
            `
        };
        this.prompter = {};
        this.skillLibrary = {
            addSkill: (name, code) => console.log(`[MockLibrary] Added skill ${name}`),
            hotSwap: (name, code) => console.log(`[MockLibrary] Hot-swapped skill ${name}`)
        };
        this.cogneeMemory = {
            store: async () => { }
        };
        this.bot = {}; // Mock bot
    }
}

async function testEvolutionIntegration() {
    console.log('🧪 Starting Evolution Integration Test...');

    const agent = new MockAgent();
    // Initialize ToolRegistry (partial)
    agent.toolRegistry.skills = new Map();
    agent.toolRegistry.tags = new Map();
    agent.toolRegistry.usageStats = new Map();

    // Initialize Evolution Engine
    const evolution = new EvolutionEngine(agent);

    console.log('✅ EvolutionEngine initialized');

    // 1. Test Failure Tracking
    console.log('Test 1: System2 Failure Tracking');

    // Emit degraded signal
    globalBus.emitSignal(SIGNAL.SYSTEM2_DEGRADED, {
        goal: 'build house',
        reason: 'missing resources',
        details: { resource: 'wood' }
    });

    // Check if recorded
    if (evolution.system2Failures.length === 1) {
        console.log('✅ System2 failure recorded successfully');
    } else {
        console.error('❌ Failed to record System2 failure');
        process.exit(1);
    }

    // 2. Test Skill Registration
    console.log('Test 2: ToolRegistry Integration');

    await evolution.registerWithToolRegistry('fix_missing_wood', 'console.log("fix")', {
        taskName: 'build house',
        errorMessage: 'missing wood'
    });

    const skill = agent.toolRegistry.findSkill('fix_missing_wood');
    if (skill && skill.dynamic) {
        console.log('✅ Evolved skill registered in ToolRegistry');
    } else {
        console.error('❌ Failed to register skill in ToolRegistry');
        process.exit(1);
    }

    // 3. Test deploySkill
    console.log('Test 3: deploySkill Integration');

    const success = await evolution.deploySkill('test_skill', 'console.log("test")', {
        taskName: 'test',
        errorMessage: 'error'
    });

    if (success) {
        const registered = agent.toolRegistry.findSkill('test_skill');
        if (registered) {
            console.log('✅ deploySkill successfully registered to ToolRegistry');
        } else {
            console.error('❌ deploySkill failed to register to ToolRegistry');
            process.exit(1);
        }
    } else {
        console.error('❌ deploySkill returned false');
        process.exit(1);
    }

    console.log('🎉 All Evolution Integration Tests Passed!');
}

testEvolutionIntegration().catch(console.error);
