
import assert from 'assert';
import { EvolutionEngine } from './src/agent/core/EvolutionEngine.js';
import { CombatAcademy } from './src/agent/core/CombatAcademy.js';

// Mock Agent
class MockAgent {
    constructor() {
        this.name = 'TestGladiator';
        this.bot = {
            game: { gameMode: 'creative' },
            entity: { position: { x: 0, y: 0, z: 0, offset: (x, y, z) => ({ x, y, z }), distanceTo: () => 10 } },
            chat: (msg) => console.log(`[BotChat] ${msg}`),
            on: (event, cb) => {
                if (event === 'entitySpawn') {
                    // Simulate spawn immediately
                    cb({ name: 'zombie', position: { distanceTo: () => 5 }, isValid: true });
                }
            },
            removeListener: () => { },
            health: 20
        };
        this.evolution = new EvolutionEngine(this);
        this.reflexes = {
            combat: {
                enterCombat: () => console.log('[Mock] Entering combat'),
                exitCombat: () => console.log('[Mock] Exiting combat')
            }
        };
        // Mock CombatAcademy to override real fight logic with simulation
        this.combatAcademy = new CombatAcademy(this);
    }
}

async function runTest() {
    console.log('--- Starting Combat Academy Test ---');
    const agent = new MockAgent();

    // Inject mock fight logic for determinism
    agent.combatAcademy._fight = async (mob) => {
        // Simulate a Loss
        return false;
    };

    // Initial Traits
    const initialStrafe = agent.evolution.genome.combat_strafe_distance;
    console.log(`Initial Strafe: ${initialStrafe}`);

    // Run 1 Round of Training (Simulated Loss)
    await agent.combatAcademy.startTraining('zombie', 1);

    // Check Stats
    assert.strictEqual(agent.combatAcademy.sessionStats.losses, 1, 'Should record 1 loss');

    // Check Mutation
    const mutatedStrafe = agent.evolution.genome.combat_strafe_distance;
    const mutatedUrgency = agent.evolution.genome.combat_attack_urgency;
    const mutatedReach = agent.evolution.genome.combat_reach_distance;

    // One of them should have changed
    const hasMutated = (mutatedStrafe !== 2.5) || (mutatedUrgency !== 1.0) || (mutatedReach !== 3.0);

    assert.ok(hasMutated, 'Genome should have mutated after loss');
    console.log('PASS: Mutation Triggered');

    console.log('--- All Combat Tests Passed ---');
}

runTest().catch(console.error);
