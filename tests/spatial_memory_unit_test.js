
import { SpatialMemory } from '../src/memory/SpatialMemory.js';
import { Vec3 } from 'vec3';

async function runTest() {
    console.log('🧪 Starting SpatialMemory Unit Test...');

    const mockAgent = {};
    const mem = new SpatialMemory(mockAgent);

    // 1. Update
    const obs = [{
        type: 'entity',
        name: 'zombie_1',
        position: new Vec3(10, 64, 10),
        confidence: 1.0
    }];

    await mem.update(obs);

    // 2. Search
    console.log('🔍 Searching for "zombie"...');
    const results = mem.search('zombie');

    console.log('📊 Results:', JSON.stringify(results, null, 2));

    if (results.length === 1 && results[0].name === 'zombie_1') {
        console.log('✅ Unit Test Passed');
        process.exit(0);
    } else {
        console.log('❌ Unit Test Failed');
        process.exit(1);
    }
}

runTest();
