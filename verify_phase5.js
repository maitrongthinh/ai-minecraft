
import { Agent } from './src/agent/agent.js';
import EventEmitter from 'events';

// Mock Agent and dependencies
class MockBot extends EventEmitter {
    constructor() {
        super();
        this.food = 20;
        this.health = 20;
        this.entity = { position: { x: 0, y: 0, z: 0 } };
        this.time = { timeOfDay: 6000 };
        // Plugins
        this.pathfinder = { setGoal: () => { } };
        this.autoEat = { eat: async () => console.log('Mock: Eating food.') };
        this.modes = { exists: () => true, isOn: () => false, setOn: () => { } };
        this.players = {};
    }
    chat(msg) { console.log('Bot Chat:', msg); }
    quit() { }
    emit(event, ...args) {
        super.emit(event, ...args);
        // console.log(`[MockBot] Event: ${event}`);
    }
}

async function verify() {
    console.log('Verifying Phase 5: Integration & Survival...');

    // Mock the agent heavily since we don't have MC server
    const mockAgent = {
        name: 'SurvivalBot',
        bot: new MockBot(),
        prompter: {
            profile: { npc: { goals: [], built: {} } },
            init: async () => { },
            chat: async (hist) => "Dream summary"
        },
        actions: {
            isBusy: () => false,
            runAction: async (name, fn) => {
                console.log(`Action: ${name}`);
                if (name === 'npc:moveAway') {
                    console.log('Skipping execution of npc:moveAway (requires physics)');
                    return {};
                }
                await fn();
                return {};
            },
            stop: async () => console.log('Actions Stopped.'),
            cancelResume: () => { }
        },
        history: { save: () => { }, getHistory: () => [] },
        cleanKill: () => { },
        convoManager: { inConversation: () => false, initAgent: () => { } },
        isIdle: () => true
    };

    // Load Modules manually (like Agent constructor)
    const { HumanManager } = await import('./src/human_core/HumanManager.js');
    mockAgent.humanManager = new HumanManager(mockAgent);

    const { BlueprintManager } = await import('./src/blueprints/BlueprintManager.js');
    mockAgent.blueprintManager = new BlueprintManager();

    const { Dreamer } = await import('./src/agent/Dreamer.js');
    mockAgent.dreamer = new Dreamer(mockAgent);
    mockAgent.dreamer.init = async () => { };
    mockAgent.dreamer.vectorStore = { init: async () => { }, add: async () => { } };

    const { NPCContoller } = await import('./src/agent/npc/controller.js');
    mockAgent.npc = new NPCContoller(mockAgent);
    mockAgent.npc.init(); // Note: we disabled the idle loop here

    const { Arbiter } = await import('./src/agent/Arbiter.js');
    mockAgent.arbiter = new Arbiter(mockAgent);

    // Test 1: Instincts
    console.log('--- Test 1: Instincts ---');
    mockAgent.bot.food = 10;
    mockAgent.bot.emit('health'); // Should trigger HumanManager.findFood

    // Test 2: Arbiter Loop (Survival Mode OFF)
    console.log('--- Test 2: Arbiter Idle (Survival OFF) ---');
    await mockAgent.arbiter.onIdle();
    // Expect: Dreamer (probabilistic) or nothing.

    // Test 3: Arbiter Loop (Survival Mode ON)
    console.log('--- Test 3: Arbiter Idle (Survival ON) ---');
    mockAgent.arbiter.setSurvivalMode(true);
    await mockAgent.arbiter.onIdle();
    // Expect: Dreamer (since we didn't implement wandering yet, just placeholders)

    // Test 4: Goal Injection
    console.log('--- Test 4: Goal Execution ---');
    mockAgent.npc.data.curr_goal = { name: 'simple_house', quantity: 1 };
    await mockAgent.arbiter.onIdle();
    // Expect: NPCController executeNext (Action: npc:moveAway etc.)

    console.log('Phase 5 Verification Complete.');
}

verify().catch(console.error);
