import { MissionDirector } from '../../src/agent/core/MissionDirector.js';
import AdvancementLadder from '../../src/agent/core/AdvancementLadder.js'; // Default export
import { NetherStrategy } from '../../src/agent/core/NetherStrategy.js';
import { EndStrategy } from '../../src/agent/core/EndStrategy.js';

// Mock dependencies
const mockAgent = {
    name: 'TestBot',
    bot: {
        entity: { position: { x: 0, y: 0, z: 0 } },
        inventory: { items: () => [] },
        food: 20,
        pathfinder: { goto: async () => { } }
    },
    brain: {
        memory: {
            completed_milestones: [],
            getPlace: () => null,
            absorb: () => { }
        }
    },
    running: true,
    state: 'ready',
    scheduler: { schedule: () => { } },
    getInventoryItemCount: () => 0
};

// Mock Strategies - Override the classes or prototypes
// Since we import the classes, we can modify their prototypes
const originalNetherExecute = NetherStrategy.prototype.execute;
NetherStrategy.prototype.execute = async function (task) {
    console.log(`[MockNether] Executing ${task}`);
    this.active = true;
};
NetherStrategy.prototype.tick = async function () {
    if (this.active) console.log('[MockNether] Ticking...');
};

const originalEndExecute = EndStrategy.prototype.execute;
EndStrategy.prototype.execute = async function (task) {
    console.log(`[MockEnd] Executing ${task}`);
    this.active = true;
};

async function testIntegration() {
    console.log('--- Testing MissionDirector Strategy Integration ---');

    // Create director
    const director = new MissionDirector(mockAgent);
    // director.init() tries to load files from disk, might fail if paths don't exist in test env
    // Stub methods that touch FS
    director._load = () => { };
    director._save = () => { };
    director.spawnBaseManager = { init: () => { } }; // mocking spawnBaseManager

    // Inject mock ladder if needed, but constructor uses default.
    // We can swap it out after construction or mock the prototype methods of AdvancementLadder
    director.advancementLadder.getNextMilestone = () => null; // Default none

    // 1. Test Nether Strategy Trigger
    console.log('\nTest 1: Trigger Nether Strategy');
    // Mock getNextMilestone to return a Nether milestone
    director.advancementLadder.getNextMilestone = () => ({
        id: 'enter_nether',
        category: 'nether',
        taskPlan: [{ name: 'enter_nether' }]
    });

    await director._executeAdvancementProgress();

    if (director.netherStrategy.active) {
        console.log('✅ NetherStrategy activated successfully.');
    } else {
        console.error('❌ NetherStrategy failed to activate.');
        process.exit(1);
    }

    // 2. Test End Strategy Trigger
    console.log('\nTest 2: Trigger End Strategy');
    director.netherStrategy.active = false; // Reset
    director.advancementLadder.getNextMilestone = () => ({
        id: 'locate_stronghold',
        category: 'end',
        taskPlan: [{ name: 'locate_structure', params: { structure: 'stronghold' } }]
    });

    await director._executeAdvancementProgress();

    if (director.endStrategy.active) {
        console.log('✅ EndStrategy activated successfully.');
    } else {
        console.error('❌ EndStrategy failed to activate.');
        process.exit(1);
    }

    console.log('\n✅ Integration Tests Passed!');
}

testIntegration().catch(console.error);
