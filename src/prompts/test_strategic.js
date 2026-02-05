/**
 * Test: Task 13 - Strategic Prompts
 * 
 * Run: node src/prompts/test_strategic.js
 */

import { getStrategicPrompt } from './StrategicPrompts.js';

console.log('='.repeat(60));
console.log('  Task 13: Strategic Prompts Test');
console.log('='.repeat(60) + '\n');

// Mock Bot Objects
const healthyDayBot = {
    entity: {},
    health: 20,
    food: 20,
    time: { timeOfDay: 1000 },
    isRaining: false,
    inventory: {
        items: () => [
            { name: 'diamond_sword' },
            { name: 'iron_pickaxe' }
        ]
    }
};

const criticalNightBot = {
    entity: {},
    health: 5,
    food: 4,
    time: { timeOfDay: 18000 },
    isRaining: true,
    inventory: {
        items: () => [] // Empty inventory
    }
};

const sunsetBot = {
    entity: {},
    health: 15,
    food: 15,
    time: { timeOfDay: 12500 },
    isRaining: false,
    inventory: {
        items: () => [{ name: 'torch' }]
    }
};

// Test 1: Healthy Day Bot
console.log('[1/3] Testing Healthy Day Bot...');
const p1 = getStrategicPrompt(healthyDayBot);
if (p1.includes('It is DAY') && p1.includes('Combat Ready') && !p1.includes('WARNING')) {
    console.log('  ✓ Correctly identified safe state');
} else {
    console.log('  ✗ Failed to identify safe state');
    console.log(p1);
}

// Test 2: Critical Night Bot
console.log('\n[2/3] Testing Critical Night Bot...');
const p2 = getStrategicPrompt(criticalNightBot);
if (p2.includes('CRITICAL WARNING: Health is LOW') &&
    p2.includes('CRITICAL WARNING: Starving') &&
    p2.includes('It is NIGHT') &&
    p2.includes('VULNERABLE (No Weapon)')) {
    console.log('  ✓ Correctly identified CRITICAL state');
} else {
    console.log('  ✗ Failed to identify critical state');
    console.log(p2);
}

// Test 3: Sunset Bot
console.log('\n[3/3] Testing Sunset Bot...');
const p3 = getStrategicPrompt(sunsetBot);
if (p3.includes('Sunset is approaching') && !p3.includes('DARKNESS DANGER')) {
    console.log('  ✓ Correctly identified sunset');
} else {
    console.log('  ✗ Failed to identify sunset');
    console.log(p3);
}

console.log('\n' + '='.repeat(60));
console.log('  TEST COMPLETE');
console.log('='.repeat(60));
