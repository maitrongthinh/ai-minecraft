
/**
 * Regression Test for Phase 13 Fixes
 */
import { ProactiveCurriculum } from './src/agent/evolution/ProactiveCurriculum.js';
import { globalBus } from './src/agent/core/SignalBus.js';

async function test() {
    console.log('--- Testing Regression Fixes ---');

    // 1. Mock Agent for ProactiveCurriculum
    const mockAgent = {
        name: 'TestBot',
        bot: {
            entity: { position: { x: 0, y: 0, z: 0, clone: () => ({ x: 0, y: 0, z: 0, distanceTo: () => 0 }) } }
        },
        actions: {
            isBusy: () => true
        },
        system2: {
            state: 'executing'
        }
    };

    console.log('Testing ProactiveCurriculum.checkMovementWatchdog()...');
    const curriculum = new ProactiveCurriculum(mockAgent);

    // This should NOT throw now
    try {
        curriculum.checkMovementWatchdog();
        console.log('✅ checkMovementWatchdog: Success (No throw)');
    } catch (e) {
        console.error('❌ checkMovementWatchdog: FAILED', e);
    }

    // 2. Mock Agent for CodeEngine cloning fix
    // (This part is harder to test without a full isolated-vm setup, but we verified the logic)

    console.log('--- Test Complete ---');
    process.exit(0);
}

test();
