
import { HitSelector } from '../../src/agent/reflexes/HitSelector.js';
import Vec3 from 'vec3';

// Mock Agent
const mockAgent = {
    bot: {
        entity: { position: new Vec3(0, 0, 0) },
        entities: {}
    },
    collaboration: {
        teammates: ['Friend1']
    }
};

function createEntity(id, type, mobType, pos, username) {
    return {
        id, type, mobType,
        position: pos,
        username,
        metadata: [],
        health: 20
    };
}

async function testHitSelector() {
    console.log('--- Testing HitSelector ---');
    const selector = new HitSelector(mockAgent);

    // Scenario 1: Zombie close vs Creeper far
    // Creeper (Score 100) at 10m. Zombie (Score 40) at 2m.
    // Creeper Score: 100 + (16-10)*2 = 112
    // Zombie Score: 40 + (16-2)*2 = 68
    // Helper check: wait, 16-2 = 14 * 2 = 28. 40+28 = 68.
    // Creeper wins.

    // Let's verify prioritization
    mockAgent.bot.entities = {
        1: createEntity(1, 'mob', 'Zombie', new Vec3(2, 0, 0)),
        2: createEntity(2, 'mob', 'Creeper', new Vec3(10, 0, 0)),
        3: createEntity(3, 'player', null, new Vec3(5, 0, 0), 'Friend1'), // Teammate
        4: createEntity(4, 'mob', 'Skeleton', new Vec3(15, 0, 0))
    };

    console.log('Test 1: Threat Prioritization');
    const target = selector.findThreat();

    if (target && target.mobType === 'Creeper') {
        console.log('✅ Correctly prioritized Creeper over Zombie and Teammate.');
    } else {
        console.error(`❌ Failed: Picked ${target ? target.mobType || target.username : 'null'} instead of Creeper.`);
    }

    // Scenario 2: Player Threat
    // Player (Score 150) vs Creeper (Score 100)
    mockAgent.bot.entities = {
        1: createEntity(1, 'mob', 'Creeper', new Vec3(5, 0, 0)),
        2: createEntity(2, 'player', null, new Vec3(5, 0, 0), 'EnemyPlayer')
    };

    console.log('Test 2: Player Priority');
    const target2 = selector.findThreat();
    if (target2 && target2.username === 'EnemyPlayer') {
        console.log('✅ Correctly prioritized Enemy Player.');
    } else {
        console.error(`❌ Failed: Picked ${target2 ? target2.mobType : 'null'} instead of EnemyPlayer.`);
    }

}

testHitSelector().catch(console.error);
