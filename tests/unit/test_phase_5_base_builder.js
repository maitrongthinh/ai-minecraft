import { SpawnBaseManager } from '../../src/agent/core/SpawnBaseManager.js';
import { DefenseController } from '../../src/agent/core/DefenseController.js';
import fs from 'fs';
import path from 'path';

// Mock Agent
const mockAgent = {
    name: 'test_builder_bot',
    memory: {
        places: new Map(),
        getPlace: (key) => mockAgent.memory.places.get(key),
        setPlace: (key, val) => mockAgent.memory.places.set(key, val)
    },
    bot: {
        entity: { position: { x: 100, y: 64, z: 100 }, floored: () => ({ x: 100, y: 64, z: 100 }) },
        health: 20,
        food: 20
    },
    actionAPI: {
        moveto: async () => true,
        place: async () => true,
        ensure_item: async () => true,
        eat_if_hungry: async () => true,
        hold_position: async () => true
    },
    combatReflex: {
        findNearbyHostiles: () => [],
        inCombat: false,
        enterCombat: () => { }
    }
};

async function runTests() {
    console.log('🧪 Testing Phase 5: Base Builder & Defense...');

    // Test 1: Blueprint Loading
    console.log('Test 1: Blueprint Loading');
    const baseManager = new SpawnBaseManager(mockAgent);
    if (!fs.existsSync(baseManager.blueprintPath)) throw new Error('Blueprint file not found');
    const blueprint = JSON.parse(fs.readFileSync(baseManager.blueprintPath, 'utf8'));
    if (!blueprint.blocks || blueprint.blocks.length === 0) throw new Error('Invalid blueprint');
    console.log(`✅ Blueprint loaded: ${blueprint.name} (${blueprint.blocks.length} blocks)`);

    // Test 2: Build Logic (Mocked)
    console.log('Test 2: Build Execution');
    const result = await baseManager._buildBlueprint({ x: 0, y: 60, z: 0 });
    if (!result) throw new Error('Build failed');
    console.log('✅ Build execution passed');

    // Test 3: Defense Patrol
    console.log('Test 3: Defense Patrol');
    const defense = new DefenseController(mockAgent);
    mockAgent.memory.setPlace('base_center', { x: 100, y: 64, z: 100 });
    mockAgent.memory.setPlace('farm_center', { x: 110, y: 64, z: 110 });

    defense.start();
    if (defense.locations.length !== 2) throw new Error(`Expected 2 patrol points, got ${defense.locations.length}`);

    // Simulate tick
    await defense.tick(); // Patrol point 1
    defense.lastHoldAt = 0; // Reset timer
    await defense.tick(); // Patrol point 2

    console.log('✅ Patrol logic passed');

    console.log('🎉 All Phase 5 tests passed');
}

runTests().catch(e => {
    console.error('❌ Test Failed:', e);
    process.exit(1);
});
