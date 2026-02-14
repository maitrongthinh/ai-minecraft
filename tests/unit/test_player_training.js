
import { PlayerTrainingMode } from '../../src/agent/core/PlayerTrainingMode.js';
import fs from 'fs';
import path from 'path';

// Mock dependencies
const mockAgent = {
    name: 'TestBot',
    bot: {
        chat: (msg) => console.log(`[Bot Chat] ${msg}`),
        players: {
            'TestPlayer': { entity: { id: 123, username: 'TestPlayer' } }
        }
    },
    reflexes: {
        combat: {
            setTrainingMode: (active, diff) => {
                console.log(`[MockCombat] setTrainingMode: ${active}, diff: ${diff}`);
            },
            enterCombat: (entity) => {
                console.log(`[MockCombat] enterCombat with ${entity.username}`);
            }
        }
    },
    combatAcademy: {
        startPvPTraining: async (entity) => {
            console.log(`[MockAcademy] startPvPTraining with ${entity.username}`);
        }
    }
};

// Mock fs
const MOCK_PROFILE_DIR = path.join(process.cwd(), 'bots', 'TestBot', 'player_profiles');
if (!fs.existsSync(MOCK_PROFILE_DIR)) {
    fs.mkdirSync(MOCK_PROFILE_DIR, { recursive: true });
}

async function testPlayerTraining() {
    console.log('--- Testing Player Training Mode ---');

    const training = new PlayerTrainingMode(mockAgent);

    // 1. Start Session
    console.log('\n1. Testing startSession...');
    const started = await training.startSession('TestPlayer');
    if (started) {
        console.log('✅ Session started successfully.');
    } else {
        console.error('❌ Failed to start session.');
        process.exit(1);
    }

    if (training.active && training.currentTrainee === 'TestPlayer') {
        console.log('✅ Active state verified.');
    } else {
        console.error('❌ State mismatch.');
        process.exit(1);
    }

    // 2. Record Hits
    console.log('\n2. Testing recordHit...');
    training.recordHit('player', 'bot', 5); // Player hits bot
    training.recordHit('player', 'bot', 5);
    training.recordHit('bot', 'player', 2); // Bot hits player

    if (training.sessionStats.playerHits === 2 && training.sessionStats.botHits === 1) {
        console.log('✅ Hits recorded correctly.');
    } else {
        console.error('❌ Hit recording failed.', training.sessionStats);
        process.exit(1);
    }

    // 3. End Session & Persistence
    console.log('\n3. Testing endSession...');
    await training.endSession();

    if (!training.active) {
        console.log('✅ Session ended.');
    } else {
        console.error('❌ Session failed to end.');
        process.exit(1);
    }

    // Verify Profile
    const profilePath = path.join(MOCK_PROFILE_DIR, 'TestPlayer.json');
    if (fs.existsSync(profilePath)) {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        console.log('Profile:', profile);
        if (profile.totalHitsDealt === 2 && profile.totalHitsTaken === 1) {
            console.log('✅ Profile saved correctly.');
        } else {
            console.error('❌ Profile data incorrect.');
            process.exit(1);
        }
    } else {
        console.error('❌ Profile file not created.');
        process.exit(1);
    }

    console.log('\nALL TESTS PASSED');

    // Cleanup
    fs.unlinkSync(profilePath);
    fs.rmdirSync(MOCK_PROFILE_DIR);
}

testPlayerTraining().catch(console.error);
