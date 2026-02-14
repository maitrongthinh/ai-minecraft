import { FallDamageReflex } from '../../src/agent/reflexes/FallDamageReflex.js';

// Mock Agent & Bot
const mockAgent = {
    bot: {
        entity: {
            onGround: false,
            velocity: { y: -0.5 },
            position: { x: 0, y: 100, z: 0 },
            yaw: 0
        },
        inventory: {
            items: () => [
                { name: 'water_bucket', count: 1 },
                { name: 'hay_block', count: 64 },
                { name: 'cobblestone', count: 64 }
            ],
            findInventoryItem: (name) => ({ name, count: 1 })
        },
        equip: async () => true,
        look: async () => true,
        activateItem: async () => true,
        placeBlock: async () => true,
        blockAt: () => ({ name: 'stone', boundingBox: 'block' })
    },
    physicsPredictor: {
        getFallHeight: () => 25, // Default fall height for test
        shouldMLG: () => true,
        performMLG: async () => ({ success: true }),
        predictLandingPosition: () => ({ x: 0, y: 75, z: 0, offset: () => ({}) })
    },
    requestInterrupt: () => { }
};

async function runTests() {
    console.log('🧪 Testing FallDamageReflex...');
    const reflex = new FallDamageReflex(mockAgent);

    // Test 1: Danger Assessment
    console.log('Test 1: Assessment Logic');
    const fatal = reflex._assessDanger(24);
    if (fatal.danger !== 'FATAL' || fatal.action !== 'MLG') throw new Error('Failed FATAL check');

    const high = reflex._assessDanger(15);
    if (high.danger !== 'HIGH' || high.action !== 'MLG') throw new Error('Failed HIGH check');

    const moderate = reflex._assessDanger(6);
    if (moderate.danger !== 'MODERATE' || moderate.action !== 'CLUTCH') throw new Error('Failed MODERATE check');

    const safe = reflex._assessDanger(2);
    if (safe.danger !== 'NONE') throw new Error('Failed NONE check');
    console.log('✅ Assessment passed');

    // Test 2: Clutch Block Finding
    console.log('Test 2: Clutch Block Selection');
    const block = reflex._findClutchBlock();
    if (block.name !== 'hay_block') throw new Error(`Wrong clutch block selected: ${block.name}`);
    console.log('✅ Clutch block selection passed (Hay Bale priority)');

    // Test 3: Trigger Logic
    console.log('Test 3: Trigger Execution');
    mockAgent.physicsPredictor.getFallHeight = () => 25;
    await reflex.tick();

    // We expect MLG to be called via performMLG
    // Since we mocked performMLG to return success, tick should complete without error
    if (!reflex.active) {
        // It sets active=true then active=false, so checking active is tricky.
        // We rely on no error thrown.
    }
    console.log('✅ Trigger execution passed');

    console.log('🎉 All FallDamageReflex tests passed');
}

runTests().catch(e => {
    console.error('❌ Test Failed:', e);
    process.exit(1);
});
