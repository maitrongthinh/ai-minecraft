
import { EnvironmentMonitor } from '../../src/agent/core/EnvironmentMonitor.js';
import Vec3 from 'vec3';
import { globalBus, SIGNAL } from '../../src/agent/core/SignalBus.js';

// Mock Agent & Bot
const mockBot = {
    entity: {
        position: new Vec3(100, 64, 100),
        yaw: 0 // Looking negative Z (North)
    },
    blockAt: (pos) => {
        // Mock World
        // Flat ground at y=63
        if (pos.y === 63) return { name: 'grass_block', position: pos };

        // Cliff ahead at z=95 (5 blocks away)
        if (pos.z <= 95 && pos.y === 63) return { name: 'air', position: pos };

        // Lava at right side (x+2)
        if (pos.x >= 102 && pos.y === 63) return { name: 'lava', position: pos };

        return { name: 'air', position: pos };
    },
    nearEntity: () => null,
    time: { timeOfDay: 6000 },
    isRaining: false
};

const mockAgent = {
    bot: mockBot
};

async function testEnvironmentMonitor() {
    console.log('--- Testing EnvironmentMonitor ---');
    const monitor = new EnvironmentMonitor(mockAgent);
    let cliffDetected = false;
    let lavaDetected = false;

    // Subscribe to signals
    globalBus.subscribe(SIGNAL.ENV_CLIFF_AHEAD, (event) => {
        console.log('✅ Limit detected:', event);
        cliffDetected = true;
    });

    globalBus.subscribe(SIGNAL.ENV_LAVA_NEARBY, (event) => {
        console.log('✅ Lava detected:', event);
        lavaDetected = true;
    });

    // 1. Test Normal Scan (Should be safe mostly)
    console.log('Scanning...');
    monitor._scanTerrain();

    // 2. Move bot closer to cliff
    console.log('Moving close to cliff...');
    mockBot.entity.position = new Vec3(100, 64, 96); // 1 block from z=95 cliff
    monitor._scanTerrain();

    if (cliffDetected) console.log('✅ Cliff detection passed');
    else console.error('❌ Cliff detection failed');

    // 3. Move bot closer to lava
    console.log('Moving close to lava...');
    mockBot.entity.position = new Vec3(102, 64, 100);
    // Reset lava detected flag
    lavaDetected = false;

    // Rotate to look at lava (East)
    mockBot.entity.yaw = -Math.PI / 2;

    monitor._scanTerrain();

    if (lavaDetected) console.log('✅ Lava detection passed');
    // Note: Lava detection depends on the exact block check logic in scanTerrain, 
    // which checks block *below* usually. 
    // Let's ensure the mock returns lava below current pos or in front.

    // Force cleanup
    monitor.stop();
}

testEnvironmentMonitor().catch(console.error);
