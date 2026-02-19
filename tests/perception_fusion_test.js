
import { Agent } from '../src/agent/agent.js';
import { PerceptionManager } from '../src/agent/perception/PerceptionManager.js';
import { VisionScheduler } from '../src/agent/perception/VisionScheduler.js';
import { SpatialMemory } from '../src/memory/SpatialMemory.js';
import { globalBus, SIGNAL } from '../src/agent/core/SignalBus.js';
import { Vec3 } from 'vec3';

/**
 * Perception Fusion Integration Test
 * 
 * Verifies:
 * 1. PerceptionManager starts/stops correctly.
 * 2. PerceptionManager receives signals from SignalBus.
 * 3. PerceptionManager updates SpatialMemory.
 * 4. SpatialMemory retention and search logic work.
 */
async function runTest() {
    console.log('🧪 Starting Perception Fusion Test...');

    // 1. Setup Mock Agent
    const mockAgent = {
        bot: { username: 'Tester' },
        memory: {},
        spatialMemory: null,
        perceptionManager: null
    };

    // 2. Initialize Components
    console.log('🔹 Initializing Components...');
    mockAgent.spatialMemory = new SpatialMemory(mockAgent);
    mockAgent.perceptionManager = new PerceptionManager(mockAgent);
    mockAgent.perceptionManager.visionScheduler = new VisionScheduler(mockAgent);
    mockAgent.spatialMemory.retentionTime = 24 * 60 * 60 * 1000; // 24 hours to prevent test flakes
    mockAgent.perceptionManager.start();

    // 3. Test: Entity Detection -> Spatial Memory
    console.log('🔹 Test: Signal -> Spatial Memory (Entity)');

    const testEntity = {
        action: 'swing',
        entity: 'zombie_1',
        position: new Vec3(10, 64, 10),
        distance: 5
    };

    globalBus.emitSignal(SIGNAL.ENV_ENTITY_ACTION, testEntity);

    // Wait for async processing
    await new Promise(r => setTimeout(r, 100));

    // Verify Memory
    const results = mockAgent.spatialMemory.search('zombie');
    if (results.length === 1 && results[0].name === 'zombie_1') {
        console.log('✅ Entity correctly stored in Spatial Memory.');
    } else {
        console.error('❌ Entity storage failed:', results);
        process.exit(1);
    }

    // 4. Test: Block Change -> Spatial Memory
    console.log('🔹 Test: Signal -> Spatial Memory (Block)');

    const testBlock = {
        old: 'air',
        new: 'diamond_ore',
        position: new Vec3(12, 10, 12),
        distance: 3
    };

    globalBus.emitSignal(SIGNAL.ENV_BLOCK_CHANGE, testBlock);
    await new Promise(r => setTimeout(r, 100));

    const blockResults = mockAgent.spatialMemory.search('diamond');
    if (blockResults.length === 1 && blockResults[0].name === 'diamond_ore') {
        console.log('✅ Block correctly stored in Spatial Memory.');
    } else {
        console.error('❌ Block storage failed:', blockResults);
        process.exit(1);
    }

    // 5. Test: Memory Expiration
    console.log('🔹 Test: Memory Expiration');
    // Force short retention for test
    mockAgent.spatialMemory.retentionTime = 50; // 50ms retention

    // Wait for expiration
    await new Promise(r => setTimeout(r, 100));

    // Search again (trigger cleanup)
    const expiredResults = mockAgent.spatialMemory.search('zombie');
    if (expiredResults.length === 0) {
        console.log('✅ Expired memory correctly pruned.');
    } else {
        console.error('❌ Expiration failed, item still exists:', expiredResults);
        process.exit(1);
    }

    console.log('\n🎉 All Perception Fusion Tests Passed!');
    process.exit(0);
}

runTest().catch(console.error);
