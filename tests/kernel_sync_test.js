import Vec3 from 'vec3';
import { Agent } from '../src/agent/agent.js';
import { globalBus, SIGNAL } from '../src/agent/core/SignalBus.js';
import EventEmitter from 'events';

// Mock Bot
class MockBot extends EventEmitter {
    constructor() {
        super();
        this.username = 'Groq';
        this.entity = {
            position: new Vec3(0, 0, 0),
            yaw: 0,
            height: 1.6
        };
        this.health = 20;
        this.food = 20;
        this.biome = 'plains';
        this.time = { timeOfDay: 1000 };
        this.isRaining = false;
        this.isThundering = false;
        this.inventory = new EventEmitter();
        this.inventory.items = () => [];
        this.inventory.slots = new Array(46);
        this._client = new EventEmitter();
    }
    blockAt(pos) {
        return { name: 'grass_block', position: pos };
    }
}

async function runKernelSyncTest() {
    console.log('--- MIND-SYNC Integration Test: Kernel Parity ---');

    const agent = new Agent();
    const mockBot = new MockBot();
    agent.bot = mockBot;

    // Mock _connectToMinecraft
    agent._connectToMinecraft = async () => true;

    try {
        await agent.start();
        console.log('[Test] Agent started.');

        // Emit BOT_READY to trigger listeners in CoreSystem
        globalBus.emitSignal(SIGNAL.BOT_READY);

        const bb = agent.scheduler.blackboard;

        // 1. Verify Initial Sync
        console.log('[Test] Verifying initial sync...');
        if (bb.get('self_state.health') === 20 && bb.get('self_state.food') === 20) {
            console.log('✅ Initial Vitals Sync OK');
        } else {
            console.error('❌ Initial Vitals Sync Failed', bb.get('self_state'));
        }

        // 2. Verify Health Update
        console.log('[Test] Triggering health change...');
        mockBot.health = 10;
        mockBot.emit('health');
        if (bb.get('self_state.health') === 10) {
            console.log('✅ Health Update Sync OK');
        } else {
            console.error('❌ Health Update Sync Failed');
        }

        // 3. Verify Environment Sync
        console.log('[Test] Triggering environment change (time)...');
        mockBot.time.timeOfDay = 13000;
        // The EnvironmentMonitor tick is 250ms, let's wait a bit
        await new Promise(r => setTimeout(r, 500));

        if (bb.get('perception_snapshot.time_of_day') === 13000) {
            console.log('✅ Environment Time Sync OK');
        } else {
            console.error('❌ Environment Time Sync Failed', bb.get('perception_snapshot.time_of_day'));
        }

        // 4. Verify TaskScheduler Utility
        console.log('[Test] Verifying TaskScheduler utility prioritization...');
        // At 10 HP, survival utility should be higher than at 20 HP
        const utility_10hp = agent.scheduler.calculateUtility('survival_reflex', 40);

        mockBot.health = 20;
        mockBot.emit('health');
        const utility_20hp = agent.scheduler.calculateUtility('survival_reflex', 40);

        if (utility_10hp > utility_20hp) {
            console.log('✅ TaskScheduler Utility Scaled OK');
        } else {
            console.error(`❌ TaskScheduler Utility Scaling Failed (10hp: ${utility_10hp}, 20hp: ${utility_20hp})`);
        }

        console.log('[Test] Cleanup...');
        agent.core.shutdown();
        console.log('--- Test Complete ---');
        process.exit(0);

    } catch (err) {
        console.error('[Test] 💥 ERROR during test:', err);
        process.exit(1);
    }
}

runKernelSyncTest();
