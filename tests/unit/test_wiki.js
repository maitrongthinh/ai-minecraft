
import { MinecraftWiki } from '../../src/tools/MinecraftWiki.js';
import assert from 'assert';

async function testWiki() {
    console.log('🧪 Testing MinecraftWiki Tool...');

    const mockAgent = {};
    const wiki = new MinecraftWiki(mockAgent);

    // Test 1: General Search (Creeper)
    console.log('\n🔍 Testing searchGeneral("Creeper")...');
    const creeper = await wiki.searchGeneral('Creeper');
    console.log('Result:', JSON.stringify(creeper, null, 2));
    assert(creeper, 'Should find Creeper info');
    assert(creeper.title.toLowerCase().includes('creeper'), 'Title should be Creeper');
    assert(creeper.summary.length > 50, 'Summary should be substantial');

    // Test 2: Mob Info (Zombie)
    console.log('\n🧟 Testing getMobInfo("Zombie")...');
    const zombie = await wiki.getMobInfo('Zombie');
    console.log('Result:', JSON.stringify(zombie, null, 2));
    assert(zombie, 'Should find Zombie info');
    assert(zombie.hp !== 'Unknown', 'HP should be known');

    // Test 3: Recipe (Piston)
    console.log('\n🛠️ Testing searchRecipe("Piston")...');
    const piston = await wiki.searchRecipe('Piston');
    console.log('Result:', JSON.stringify(piston, null, 2));
    assert(piston, 'Should find Piston recipe');
    assert(piston.recipes.length > 0, 'Should have recipes');

    console.log('\n✅ Wiki Tests Passed!');
}

testWiki().catch(err => {
    console.error('❌ Test Failed:', err);
    process.exit(1);
});
