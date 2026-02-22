import { globalBus, SIGNAL } from './src/agent/core/SignalBus.js';
import { ExecutorAgent } from './src/agent/orchestration/ExecutorAgent.js';
import { ProactiveCurriculum } from './src/agent/evolution/ProactiveCurriculum.js';

async function runSmokeTest() {
    console.log('--- STARTING ARCHITECTURAL SMOKE TEST ---');

    const mockAgent = {
        name: 'TestBot',
        bot: {
            entity: { position: { x: 0, y: 0, z: 0, clone: () => ({ x: 0, y: 0, z: 0, distanceTo: () => 0 }) } },
            health: 20,
            inventory: { items: () => [] }
        },
        brain: { isBusy: () => true },
        toolRegistry: { findSkill: () => null }
    };

    // 1. Verify SignalBus Throttling
    console.log('\n[Test 1] Testing SignalBus Throttling...');
    let emitCount = 0;
    globalBus.subscribe(SIGNAL.ENV_BLOCK_CHANGE, () => emitCount++);

    for (let i = 0; i < 10; i++) {
        globalBus.emitSignal(SIGNAL.ENV_BLOCK_CHANGE, { x: i });
    }
    console.log(`Emitted 10 signals, handled: ${emitCount} (Should be 1 due to 1000ms throttle)`);

    // 2. Verify ExecutorAgent Timeout
    console.log('\n[Test 2] Testing ExecutorAgent Timeout...');
    const executor = new ExecutorAgent(mockAgent);
    executor.actionTimeout = 1000; // 1s for testing

    const startTime = Date.now();
    const result = await executor._executeStep({ id: 1, task: 'slow_task', params: {} });
    const duration = Date.now() - startTime;

    console.log(`Executor finished in ${duration}ms. Success: ${result.success}, Message: ${result.message}`);
    if (result.message?.includes('Timeout')) {
        console.log('✅ Timeout logic working.');
    } else {
        console.error('❌ Timeout logic FAILED.');
    }

    // 3. Verify ProactiveCurriculum Watchdog
    console.log('\n[Test 3] Testing ProactiveCurriculum Watchdog...');
    const curriculum = new ProactiveCurriculum(mockAgent);
    curriculum.lastPosition = mockAgent.bot.entity.position;
    curriculum.stallCounter = 2; // Simulate nearly stalled

    console.log('Triggering movement watchdog check...');
    curriculum.checkMovementWatchdog();
    // This should trigger the stall logic because stallCounter was 2 and it matches distance < 2.0

    console.log('✅ Smoke test sequence finished.');
    process.exit(0);
}

runSmokeTest().catch(err => {
    console.error('Smoke test failed:', err);
    process.exit(1);
});
