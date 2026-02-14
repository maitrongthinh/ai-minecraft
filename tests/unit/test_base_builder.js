
import { SpawnBaseManager } from '../../src/agent/core/SpawnBaseManager.js';

// Mock Agent
const mockAgent = {
    name: 'TestBot',
    memory: {
        getPlace: () => ({ x: 100, y: 64, z: 100 }),
        setPlace: () => { }
    },
    actionAPI: {
        ensure_item: async () => true,
        place: async () => true
    }
};

async function testBaseBuilder() {
    console.log('--- Testing Spawn Base Manager ---');

    const builder = new SpawnBaseManager(mockAgent);
    builder.init(); // Might fail if dirs don't exist, but we mock fs? 
    // Actually, integration test uses real fs for blueprints usually.

    // 1. Test Blueprint Loading
    console.log('Testing buildFromBlueprint(basic_house)...');

    // Mock the actual building loop to avoid 100ms delays in test if possible,
    // or just let it run (it's smallhouse).
    // We want to verify it parses and calls actionAPI.

    let blocksPlaced = 0;
    mockAgent.actionAPI.place = async (params) => {
        blocksPlaced++;
        // console.log(`[Mock] Placed ${params.blockType} at`, params.position);
        return true;
    };

    const success = await builder.buildFromBlueprint('basic_house');

    if (success) {
        console.log(`✅ buildFromBlueprint returned true.`);
    } else {
        console.error(`❌ buildFromBlueprint failed.`);
        process.exit(1);
    }

    if (blocksPlaced > 50) {
        console.log(`✅ Placed ${blocksPlaced} blocks (Expected > 50).`);
    } else {
        console.error(`❌ Placed only ${blocksPlaced} blocks. Expected more.`);
        process.exit(1);
    }

    console.log('ALL TESTS PASSED');
    process.exit(0);
}

testBaseBuilder().catch(console.error);
