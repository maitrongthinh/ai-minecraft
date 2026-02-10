import { DeathRecovery } from '../../src/agent/reflexes/DeathRecovery.js';
import EventEmitter from 'events';
import fs from 'fs';

// Mock Agent
const mockBot = new EventEmitter();
mockBot.entity = { position: { x: 10, y: 64, z: 10, clone: function () { return { x: 10, y: 64, z: 10 }; } } };
mockBot.game = { dimension: 'overworld' };
mockBot.pathfinder = { setGoal: async () => { console.log('Pathfinder setGoal called'); } };

const mockAgent = {
    bot: mockBot,
    cogneeMemory: { storeExperience: async () => { console.log('Cognee storeExperience called'); } },
    world_id: 'test-world-id'
};

async function testDeathRecovery() {
    console.log('🚀 Starting DeathRecovery Unit Test...');

    // Cleanup state file
    if (fs.existsSync('reflex_state.json')) fs.unlinkSync('reflex_state.json');

    const dr = new DeathRecovery(mockAgent);

    // 1. Test: onDeath
    console.log('\n--- Test 1: onDeath ---');
    dr.onDeath('fell from a high place');

    if (fs.existsSync('reflex_state.json')) {
        console.log('✅ State saved to reflex_state.json');
        const state = JSON.parse(fs.readFileSync('reflex_state.json', 'utf8'));
        console.log('Death Position:', state.position);
    } else {
        throw new Error('reflex_state.json NOT created');
    }

    // 2. Test: loadState
    console.log('\n--- Test 2: loadState ---');
    const dr2 = new DeathRecovery(mockAgent);
    if (dr2.lastDeath && dr2.lastDeath.cause === 'fell from a high place') {
        console.log('✅ State successfully reloaded across instances');
    } else {
        throw new Error('State NOT reloaded');
    }

    // 3. Test: onSpawn (Recovery Trigger)
    console.log('\n--- Test 3: onSpawn ---');
    await dr2.onSpawn();
    // (Should log Initiating Death Recovery Sequence)

    // 4. Test: Unrecoverable death
    console.log('\n--- Test 4: Unrecoverable Death ---');
    dr2.onDeath('tried to swim in lava');
    if (!dr2.lastDeath.recoverable) {
        console.log('✅ Lava death marked as unrecoverable');
    } else {
        throw new Error('Lava death should be unrecoverable');
    }

    console.log('\n🎉 DeathRecovery Verification Successful!');
    process.exit(0);
}

testDeathRecovery().catch(err => {
    console.error('❌ Test Failed:', err);
    process.exit(1);
});
