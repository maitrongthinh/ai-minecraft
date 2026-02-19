import { SwarmSync, SWARM_ROLE } from '../src/agent/core/SwarmSync.js';
import { globalBus, SIGNAL } from '../src/agent/core/SignalBus.js';
import EventEmitter from 'events';

// Mock Agent
class MockAgent {
    constructor(name) {
        this.name = name;
        this.bot = {
            username: name,
            entity: { position: { x: 0, y: 0, z: 0 }, height: 1.8 },
            health: 20,
            inventory: { findInventoryItem: () => null },
            peer_inv: new EventEmitter(),
            on: () => { },
            whisper: (target, msg) => {
                // Simulate Whisper via Bus for test
                globalBus.emitSignal('MOCK_WHISPER', { target, sender: name, message: msg });
            }
        };
        this.bus = globalBus;
        this.swarm = new SwarmSync(this);
    }

    init() {
        this.swarm._setupListeners();
        this.swarm.startHeartbeat();
    }
}

async function testSwarm() {
    console.log('🐝 Starting Swarm Protocol Tests...');

    // 1. Setup 2 Agents
    const leader = new MockAgent('LeaderBot');
    const follower = new MockAgent('FollowerBot');

    leader.init();
    follower.init();

    // Mock Whisper Routing
    globalBus.subscribe('MOCK_WHISPER', (event) => {
        const { target, sender, message } = event.payload;
        if (target === 'LeaderBot') leader.swarm._handleProtocolMessage(sender, message.slice(1));
        if (target === 'FollowerBot') follower.swarm._handleProtocolMessage(sender, message.slice(1));
    });

    // Mock Collaboration Teammates
    leader.collaboration = { teammates: ['FollowerBot'] };
    follower.collaboration = { teammates: ['LeaderBot'] };

    // TEST 1: Initial Discovery (Heartbeat)
    console.log('\n--- Test 1: Discovery ---');

    // Force Heartbeat
    leader.swarm.metaRole = SWARM_ROLE.LEADER; // Manually promote
    leader.swarm.broadcast('HEARTBEAT', {
        pos: { x: 0, y: 0, z: 0 },
        hp: 20,
        target: null,
        combatRole: 'DPS',
        metaRole: SWARM_ROLE.LEADER
    });

    await new Promise(r => setTimeout(r, 100));

    if (follower.swarm.leader === 'LeaderBot') {
        console.log('✅ Pass: Follower recognized Leader.');
    } else {
        console.error(`❌ Fail: Follower leader is ${follower.swarm.leader}`);
    }

    if (follower.swarm.metaRole === SWARM_ROLE.FOLLOWER) {
        console.log('✅ Pass: Follower auto-adopted FOLLOWER role.');
    } else {
        console.error(`❌ Fail: Follower role is ${follower.swarm.metaRole}`);
    }

    // TEST 2: Role Assignment
    console.log('\n--- Test 2: Role Assignment ---');
    leader.swarm.assignRole('FollowerBot', SWARM_ROLE.SCOUT);

    await new Promise(r => setTimeout(r, 100));

    if (follower.swarm.metaRole === SWARM_ROLE.SCOUT) {
        console.log('✅ Pass: Role assignment worked.');
    } else {
        console.error(`❌ Fail: Follower role is ${follower.swarm.metaRole}`);
    }

    // Cleanup
    clearInterval(leader.swarm.heartbeatTimer);
    clearInterval(follower.swarm.heartbeatTimer);
}

testSwarm().catch(console.error);
