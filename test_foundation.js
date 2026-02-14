
import assert from 'assert';
import AdvancementLadder from './src/agent/core/AdvancementLadder.js';
import MissionDirector from './src/agent/core/MissionDirector.js';
import { PRIORITY } from './src/agent/core/TaskScheduler.js';

// Mock Agent
class MockAgent {
    constructor() {
        this.name = 'TestAgent';
        this.bot = {
            food: 20,
            inventory: {
                items: () => []
            },
            game: {
                dimension: 'overworld'
            },
            experience: {
                level: 0
            }
        };
        this.brain = {
            memory: {
                stronghold_location: null
            }
        };
        this.memory = {
            getPlace: () => null,
            absorb: () => { },
            setPlace: () => { }
        };
        this.actions = {
            eat_if_hungry: async () => { console.log('Mock Action: Eat'); return { success: true }; }
        };
        this.scheduler = {
            schedule: () => { }
        };
        this.running = true;
        this.state = 'ready';
    }

    setInventory(items) {
        this.bot.inventory.items = () => items.map(i => ({ name: i, count: 1 }));
    }
}

async function runTest() {
    console.log('--- Starting Foundation Test ---');
    const agent = new MockAgent();
    const ladder = new AdvancementLadder(agent);
    // Force execution mode to DIRECT to test arbitration
    const director = new MissionDirector(agent, { ladder, executionMode: 'direct_task_execution' });
    director.init();

    // Test 1: Hunger Priority
    console.log('Test 1: Hunger Check');
    agent.bot.food = 5;
    const goal1 = await director._arbitrateGoal();
    assert.strictEqual(goal1.type, 'survival', 'Should prioritize survival when hungry');
    assert.strictEqual(goal1.name, 'eat_food', 'Should choose eat_food');
    console.log('PASS: Hunger Priority');

    // Test 2: Wood Tools (Initial)
    console.log('Test 2: Wood Tools');
    agent.bot.food = 20;
    const goal2 = await director._arbitrateGoal();
    assert.strictEqual(goal2.type, 'progression', 'Should pick progression if healthy');
    assert.strictEqual(goal2.name, 'wood_tools', 'First goal should be wood_tools');
    console.log('PASS: Initial Goal');

    // Test 3: Iron Armor Progression
    console.log('Test 3: Iron Armor Progression');
    // Simulate completing wood, stone, iron_shield AND bucket_food_stability
    director.state.completedMilestones = ['wood_tools', 'stone_tools', 'iron_shield', 'bucket_food_stability'];
    // Agent needs to satisfy prerequisites or ladder check might fail if it re-checks? 
    // AdvancementLadder.evaluate logic checks prerequisites from completedSet but also calls detector?
    // ladder.evaluate checks if NOT in completedSet.
    // ladder.getNextMilestone checks if NOT in completedSet AND prerequisites met.

    // We mocked completedMilestones properly.
    const goal3 = await director._arbitrateGoal();
    assert.strictEqual(goal3.name, 'iron_armor', 'Should recommend iron_armor next');
    console.log('PASS: Iron Armor Goal');

    // Test 4: Diamond Tools (Advance)
    console.log('Test 4: Diamond Tools');
    director.state.completedMilestones.push('iron_armor', 'diamond_prospecting');
    const goal4 = await director._arbitrateGoal();
    assert.strictEqual(goal4.name, 'diamond_tools', 'Should recommend diamond_tools');
    console.log('PASS: Diamond Tools');

    console.log('--- All Tests Passed ---');
}

runTest().catch(console.error);
