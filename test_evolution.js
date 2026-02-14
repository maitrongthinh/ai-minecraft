
import assert from 'assert';
import ActionAPI from './src/agent/core/ActionAPI.js';
import { EvolutionEngine } from './src/agent/core/EvolutionEngine.js';
import { SelfPreservationReflex } from './src/agent/reflexes/SelfPreservationReflex.js';
import { globalBus } from './src/agent/core/SignalBus.js';

// Mock Agent
class MockAgent {
    constructor() {
        this.name = 'TestAgent';
        this.bot = {
            health: 20,
            oxygenLevel: 20,
            blockAt: () => ({ name: 'air' }),
            entity: {
                position: {
                    x: 0, y: 0, z: 0,
                    offset: (x, y, z) => ({ x, y, z })
                }
            },
            inventory: { items: () => [] }
        };
        this.config = { profile: { behavior: {} } };
        // Initialize Evolution Engine
        this.evolution = new EvolutionEngine(this);
        // Initialize Reflex
        this.reflexes = {
            selfPreservation: new SelfPreservationReflex(this)
        };
        // Initialize ActionAPI
        this.actions = new ActionAPI(this);
        this.behaviorRuleEngine = {}; // Mock
    }
}

async function runTest() {
    console.log('--- Starting Evolution Loop Test ---');
    const agent = new MockAgent();

    // TEST 1: Action Optimization Hook
    console.log('Test 1: Action Outcome Recording');
    const mockExecutor = async () => {
        await new Promise(r => setTimeout(r, 50));
        return true;
    };

    // Inject mock executor into ActionAPI through _runWithRetry (calling a method that uses it)
    // We'll use access private _runWithRetry if possible, or trigger a standard action.
    // Let's rely on standard action 'humanlook' maybe? No, humanlook calls motorCortex directly.
    // Let's use 'eat_if_hungry' which uses _runWithRetry.

    // Override _getBot for ActionAPI since it's used
    agent.actions._getBot = () => agent.bot;

    // Simulate action execution logic manually since we can't easily inject executor into public methods without complex params
    // But wait, many ActionAPI methods accept `options.executor`.

    await agent.actions.mine({
        targetBlock: { position: { x: 0, y: 0, z: 0 } },
        options: {
            executor: mockExecutor,
            retries: 0
        }
    });

    const stats = agent.evolution.actionStats.get('mine');
    assert.ok(stats, 'Stats should exist for "mine"');
    assert.strictEqual(stats.attempts, 1, 'Should have 1 attempt');
    assert.strictEqual(stats.successes, 1, 'Should have 1 success');
    assert.ok(stats.totalDuration > 0, 'Duration should be recorded');
    console.log('PASS: Outcome Recording');

    // TEST 2: Genetic Instincts in Reflex
    console.log('Test 2: Genetic Instincts');

    // Default genome in EvolutionEngine: survival_health_threshold = 6
    const healthTrait = agent.evolution.getTrait('survival_health_threshold');
    assert.strictEqual(healthTrait, 6, 'Trait should match genome');

    // Manually trigger handleLowHealth check logic via tick
    // We need to mock the bot state to trigger the low health condition
    agent.bot.health = 5; // Below 6
    agent.bot.lastDamageTime = Date.now();

    // Spy on handleLowHealth
    let ranAway = false;
    agent.reflexes.selfPreservation.handleLowHealth = async () => { ranAway = true; };

    await agent.reflexes.selfPreservation.tick();
    assert.strictEqual(ranAway, true, 'Should trigger flee behavior when health < 6');
    console.log('PASS: Genetic Trigger (Health)');

    // TEST 3: Mutated Instincts
    console.log('Test 3: Mutated Instincts');
    // Mutate the genome (simulate evolution)
    agent.evolution.genome.survival_health_threshold = 3;

    ranAway = false;
    agent.bot.health = 5; // Above new threshold 3, should NOT run

    await agent.reflexes.selfPreservation.tick();
    assert.strictEqual(ranAway, false, 'Should NOT trigger flee when health (5) > mutated threshold (3)');

    agent.bot.health = 2; // Below new threshold
    await agent.reflexes.selfPreservation.tick();
    assert.strictEqual(ranAway, true, 'Should trigger flee when health (2) < mutated threshold (3)');
    console.log('PASS: Mutated Trigger');

    console.log('--- All Evolution Tests Passed ---');
}

runTest().catch(console.error);
