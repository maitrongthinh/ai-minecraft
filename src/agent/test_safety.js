/**
 * Test: Task 15 - Arbiter Safety
 * 
 * Run: node src/agent/test_safety.js
 */

import { Arbiter } from './Arbiter.js';

console.log('='.repeat(60));
console.log('  Task 15: Arbiter Safety Test');
console.log('='.repeat(60) + '\n');

// Mock Agent
const mockAgent = {
    bot: {
        entity: {},
        health: 20,
        food: 20,
        on: () => { }
    },
    actions: { isBusy: () => false },
    convoManager: { inConversation: () => false },
    npc: { data: { goals: [] } }
};

const arbiter = new Arbiter(mockAgent);

// Test 1: Safe Health/Food -> Allow All
console.log('[1/3] Testing Healthy State...');
const r1 = arbiter.checkSafety('kill');
if (r1.safe) {
    console.log('  ✓ Allowed action in healthy state');
} else {
    console.log('  ✗ Failed: Blocked valid action');
    console.log(r1);
}

// Test 2: Starvation -> Block Non-Food
console.log('\n[2/3] Testing Starvation State...');
mockAgent.bot.food = 5; // Starving
const r2_fail = arbiter.checkSafety('build');
const r2_pass = arbiter.checkSafety('eat');

if (!r2_fail.safe && r2_fail.reason.includes('STARVING')) {
    console.log('  ✓ Correctly BLOCKED non-food action (build)');
} else {
    console.log('  ✗ Failed to block non-food action');
}

if (r2_pass.safe) {
    console.log('  ✓ Correctly ALLOWED food action (eat)');
} else {
    console.log('  ✗ Failed to allow food action');
}

// Test 3: Critical Health -> Block Dangerous
console.log('\n[3/3] Testing Critical Health State...');
mockAgent.bot.food = 20; // Restore food
mockAgent.bot.health = 5; // Critical

const r3_fail = arbiter.checkSafety('kill');
const r3_pass = arbiter.checkSafety('hide');

if (!r3_fail.safe && r3_fail.reason.includes('CRITICAL')) {
    console.log('  ✓ Correctly BLOCKED dangerous action (kill)');
} else {
    console.log('  ✗ Failed to block dangerous action');
}

if (r3_pass.safe) {
    console.log('  ✓ Correctly ALLOWED safe action (hide)');
} else {
    console.log('  ✗ Failed to allow safe action');
}

console.log('\n' + '='.repeat(60));
console.log('  TEST COMPLETE');
console.log('='.repeat(60));
