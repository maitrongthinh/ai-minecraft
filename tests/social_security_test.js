import { Agent } from '../src/agent/agent.js';
import { SocialAuth } from '../src/agent/interaction/SocialAuth.js';
import { SocialEngine } from '../src/agent/interaction/SocialEngine.js';

// Mock Agent
class MockAgent {
    constructor() {
        this.bot = {
            username: 'MindOS_Bot',
            on: () => { },
            removeListener: () => { },
            chat: (msg) => console.log(`[Bot Chat]: ${msg}`),
            entity: { position: { x: 0, y: 0, z: 0 } },
            game: { biome: { name: 'plains' } }
        };
        this.config = { profile: { security: { whitelist: [] } } };
        // We'll attach social manually
        this.scheduler = {
            schedule: (name, p, fn) => console.log(`[MockScheduler] Scheduled ${name}`),
            stopAll: () => console.log('[MockScheduler] Stopped all tasks'),
            currentTask: { name: 'Idle' }
        };
        this.skills = {
            goToPlayer: async (bot, target) => console.log(`[MockSkills] Going to ${target}`)
        };
    }
}

async function testSocialSecurity() {
    console.log('🛡️ Starting Social Security Tests...');

    // Setup
    const agent = new MockAgent();
    const engine = new SocialEngine(agent);
    agent.social = engine; // Link for circular dependency in DialogueSystem

    // Inject mock auth with known password
    engine.auth.adminPassword = 'test_secret';

    // Helper to simulate chat
    async function simChat(user, message) {
        console.log(`\n--- Simulating: ${user} says "${message}" ---`);
        await engine.handleChatInteraction(user, message);
    }

    // TEST 1: Unauthorized Command -> Should Block
    console.log('\n--- Test 1: Unauthorized Command ---');
    const spy1 = console.log;
    let blocked = false;
    // Capture logs to detect blocking
    const originalLog = console.log;
    console.log = (msg) => {
        originalLog(msg);
        if (msg.includes('Blocked unauthorized command') || msg.includes('Authentication required')) {
            blocked = true;
        }
    };

    await simChat('Stranger', 'come here');

    console.log = originalLog; // Restore log
    if (blocked) {
        console.log('✅ Pass: Unauthorized command blocked.');
    } else {
        console.error('❌ Fail: Unauthorized command was NOT blocked.');
    }

    // TEST 2: Handshake -> Should Authenticate
    console.log('\n--- Test 2: Handshake ---');
    await simChat('Stranger', 'auth test_secret');

    if (engine.auth.isAuthenticated('Stranger')) {
        console.log('✅ Pass: Handshake successful.');
    } else {
        console.error('❌ Fail: Handshake failed.');
    }

    // TEST 3: Authorized Command -> Should Allow
    console.log('\n--- Test 3: Authorized Command ---');
    blocked = false;
    console.log = (msg) => {
        originalLog(msg);
        if (msg.includes('Blocked unauthorized command')) blocked = true;
    };

    await simChat('Stranger', 'come here');

    console.log = originalLog;
    if (!blocked) {
        console.log('✅ Pass: Authorized command allowed.');
    } else {
        console.error('❌ Fail: Authorized command was blocked despite auth.');
    }

    // TEST 4: Session Expiry (Simulated)
    console.log('\n--- Test 4: Session Expiry ---');
    engine.auth.authenticatedSessions.set('Stranger', Date.now() - 1000); // Set past time

    if (!engine.auth.isAuthenticated('Stranger')) {
        console.log('✅ Pass: Session expired correctly.');
    } else {
        console.error('❌ Fail: Session did not expire.');
    }
}

testSocialSecurity().catch(console.error);
