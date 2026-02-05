/**
 * Test: Task 14 - Strategy Planner
 * 
 * Run: node src/agent/test_strategy.js
 */

import { StrategyPlanner } from './StrategyPlanner.js';

console.log('='.repeat(60));
console.log('  Task 14: Strategy Planner Test');
console.log('='.repeat(60) + '\n');

// Mock Agent
const mockAgent = {
    running: true,
    bot: {
        entity: { position: { x: 0, y: 60, z: 0 } },
        health: 20,
        food: 20,
        time: { timeOfDay: 1000 },
        blockAt: () => ({ light: 15 })
    },
    handleMessage: async (source, msg) => {
        console.log(`  [Agent Mock] Received: ${msg}`);
    }
};

const planner = new StrategyPlanner(mockAgent);

// Test 1: Goal Queue Priority
console.log('[1/3] Testing Goal Priority Sorting...');
planner.addGoal("Gather Wood", planner.PRIORITY.LOW); // 20
planner.addGoal("Find Diamond", planner.PRIORITY.MEDIUM); // 50
planner.addGoal("Kill Zombie", planner.PRIORITY.HIGH); // 80

if (planner.goals[0].description === "Kill Zombie" &&
    planner.goals[1].description === "Find Diamond" &&
    planner.goals[2].description === "Gather Wood") {
    console.log('  ✓ Goals sorted correctly by priority');
} else {
    console.log('  ✗ Goal sorting failed');
    console.log(planner.goals);
}

// Test 2: Goal Selection
console.log('\n[2/3] Testing Goal Selection...');
await planner.update();
if (planner.currentGoal.description === "Kill Zombie") {
    console.log('  ✓ Highest priority goal selected');
} else {
    console.log('  ✗ Failed to select highest priority goal');
}

// Test 3: Survival Interrupt
console.log('\n[3/3] Testing Survival Interrupt...');
mockAgent.bot.health = 5; // Simulate critical health
await planner.update();

if (planner.currentGoal.description.includes("CRITICAL: Health low") &&
    planner.currentGoal.priority === planner.PRIORITY.CRITICAL) {
    console.log('  ✓ Survival interrupt triggered correctly');
    console.log('  ✓ Previous goal pushed back to queue');
    if (planner.goals[0].description === "Kill Zombie") {
        console.log('  ✓ Previous goal preserved in queue');
    } else {
        console.log('  ✗ Previous goal lost');
    }
} else {
    console.log('  ✗ Survival interrupt failed');
    console.log(planner.currentGoal);
}

console.log('\n' + '='.repeat(60));
console.log('  TEST COMPLETE');
console.log('='.repeat(60));
