/**
 * Test: Phase 5 - Reflexes (DeathRecovery & Watchdog)
 * 
 * Run: node src/agent/reflexes/test_reflexes.js
 */

console.log('='.repeat(60));
console.log('  Phase 5: Reflexes Verification (Logic Check)');
console.log('='.repeat(60) + '\n');

// --- Mock Classes ---
class MockBot {
    constructor() {
        this.entity = {
            position: { x: 100, y: 64, z: 100, clone: () => ({ x: 100, y: 64, z: 100, distanceTo: () => 0 }) }
        };
        this.game = { dimension: 'overworld' };
        this.pathfinder = { setGoal: () => { } };
        this.controlState = {};
    }
    setControlState(control, state) {
        this.controlState[control] = state;
        console.log(`    [Bot] Control '${control}' set to ${state}`);
    }
    async lookAt(pos) {
        console.log(`    [Bot] Looking at ${pos.x}, ${pos.z}`);
    }
}

const mockAgent = {
    bot: new MockBot(),
    isIdle: () => false
};

// --- Mock DeathRecovery Logic ---
class DeathRecoveryLogic {
    constructor(agent) {
        this.agent = agent;
        this.lastDeath = null;
        this.recoveryTimeout = 10 * 60 * 1000;
        this.isRecovering = false;
        this.UNRECOVERABLE = ['lava', 'magma', 'void', 'fell out of the world'];
    }

    onDeath(deathMsg) {
        const pos = this.agent.bot.entity.position;
        const dimension = this.agent.bot.game.dimension;
        const isUnrecoverable = this.UNRECOVERABLE.some(cause => deathMsg.toLowerCase().includes(cause));

        this.lastDeath = {
            position: pos,
            dimension: dimension,
            timestamp: Date.now(),
            cause: deathMsg,
            recoverable: !isUnrecoverable
        };
        console.log(`[DeathRecovery] Death recorded. Recoverable: ${!isUnrecoverable}`);
    }

    async onSpawn() {
        if (this.lastDeath && this.lastDeath.recoverable) {
            console.log('[DeathRecovery] 🚑 Initiating Death Recovery Sequence...');
            await this.recoverItems();
        }
    }

    async recoverItems() {
        console.log('[DeathRecovery] Arrived at death location. Scanning for items...');
    }
}

// --- Mock Watchdog Logic ---
class WatchdogLogic {
    constructor(agent) {
        this.agent = agent;
        this.enabled = true;
        this.CHECK_INTERVAL = 3000;
        this.STUCK_TIMEOUT = 180 * 1000;
        this.lastPosition = null;
        this.lastActionTime = Date.now();
        this.timer = null;
    }

    start() { console.log('[Watchdog] Started.'); }
    stop() { console.log('[Watchdog] Stopped.'); }

    check() {
        if (!this.enabled || !this.agent.bot || !this.agent.bot.entity) return;

        const currentPos = this.agent.bot.entity.position;

        if (!this.lastPosition) {
            this.lastPosition = currentPos; // Mock clone
            this.lastActionTime = Date.now();
            return;
        }

        // Mock distance check
        const dist = 0; // Assume 0 for stuck test

        if (dist > 1.0) {
            this.lastActionTime = Date.now();
            this.lastPosition = currentPos;
            return;
        }

        // Check timeout
        if (Date.now() - this.lastActionTime > this.STUCK_TIMEOUT) {
            this.triggerEmergency();
        }
    }

    async triggerEmergency() {
        console.warn(`[Watchdog] 🚨 AGENT STUCK! Triggering Emergency Protocol.`);
        this.lastActionTime = Date.now();
    }
}

// --- Test 1: Death Recovery ---
console.log('[1/2] Testing Death Recovery...');
const recovery = new DeathRecoveryLogic(mockAgent);

// Scenario A: Safe Death
console.log('  Scenario A: Safe Death (Zombie)');
recovery.onDeath("slain by Zombie");
if (recovery.lastDeath && recovery.lastDeath.recoverable) {
    console.log('  ✓ Death recorded as recoverable');
} else {
    console.log('  ✗ Failed to record recoverable death');
}

// Scenario B: Unsafe Death
console.log('  Scenario B: Unsafe Death (Lava)');
recovery.onDeath("tried to swim in lava");
if (recovery.lastDeath && !recovery.lastDeath.recoverable) {
    console.log('  ✓ Death recorded as UNRECOVERABLE');
} else {
    console.log('  ✗ Failed to flag unrecoverable death');
}

// Restore Safe Death for Spawn Test
recovery.onDeath("slain by Skeleton");
console.log('  Scenario C: On Spawn Recovery');
await recovery.onSpawn();

// --- Test 2: Watchdog ---
console.log('\n[2/2] Testing Watchdog...');
const watchdog = new WatchdogLogic(mockAgent);
watchdog.STUCK_TIMEOUT = 100; // Fast timeout for test
watchdog.start();

// Valid State Init
watchdog.check(); // Init

// Simulate "Stuck" (Time passes, position same)
await new Promise(r => setTimeout(r, 150));

console.log('  Scenario: Stuck Detection');
// Mock the emergency trigger to verify call
let emergencyTriggered = false;
watchdog.triggerEmergency = async () => {
    emergencyTriggered = true;
    console.log('    [Mock] Emergency Protocol Triggered!');
};

watchdog.check(); // Should trigger

if (emergencyTriggered) {
    console.log('  ✓ Watchdog triggered emergency after timeout');
} else {
    console.log('  ✗ Watchdog failed to trigger');
}

watchdog.stop();

console.log('\n' + '='.repeat(60));
console.log('  TEST COMPLETE');
console.log('='.repeat(60));
