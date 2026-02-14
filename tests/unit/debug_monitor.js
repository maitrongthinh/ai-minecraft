
import { EnvironmentMonitor } from '../../src/agent/core/EnvironmentMonitor.js';
import { SIGNAL, globalBus } from '../../src/agent/core/SignalBus.js';
import Vec3 from 'vec3';

const mockAgent = {
    bot: {
        entity: {
            position: new Vec3(0, 60, 0),
            yaw: 0
        },
        blockAt: (pos) => {
            console.log(`[MockBot] blockAt ${pos}`);
            if (pos.z <= -3 && pos.y < 60) return { name: 'air' };
            if (pos.y < 60) return { name: 'stone' };
            return { name: 'air' }; // above ground
        },
        nearEntity: () => null,
        time: { timeOfDay: 6000 },
        isRaining: false
    }
};

async function debugMonitor() {
    console.log('--- Debug Monitor ---');
    const monitor = new EnvironmentMonitor(mockAgent);
    console.log('Monitor instance created.');

    globalBus.on(SIGNAL.ENV_CLIFF_AHEAD, (data) => {
        console.log('!!! CLIFF SIGNAL !!!', data);
    });

    try {
        await monitor.tick();
    } catch (e) {
        console.error('Tick error:', e);
    }

    console.log('Tick complete.');
}

debugMonitor();
