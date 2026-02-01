
import { Agent } from './src/agent/agent.js';
import fs from 'fs';

async function verify() {
    console.log('Verifying Phase 4...');

    // Mock settings/profile
    const mockProfile = {
        name: 'VerifyBot',
        model: 'openai',
        conversation_examples: [],
        coding_examples: []
    };

    // We can't easily fully instantiate Agent without Minecraft server, 
    // but we can check if classes allow instantiation.

    try {
        // Check BlueprintManager directly
        const { BlueprintManager } = await import('./src/blueprints/BlueprintManager.js');
        const bm = new BlueprintManager();
        const blueprints = bm.listBlueprints();
        console.log(`Blueprints loaded: ${blueprints.join(', ')}`);

        if (blueprints.length === 0) throw new Error('No blueprints loaded!');

        // Check HumanManager
        // Mock agent for HumanManager
        const mockAgent = {
            bot: {
                on: (event, cb) => console.log(`Registered event: ${event}`),
                food: 20,
                health: 20,
                entity: { position: { x: 0, y: 0, z: 0 } },
                nearestEntity: () => null,
                pathfinder: { setGoal: () => { } },
                autoEat: { eat: async () => console.log('Ate food.') }
            }
        };

        const { HumanManager } = await import('./src/human_core/HumanManager.js');
        const hm = new HumanManager(mockAgent);

        // Simulate hunger
        mockAgent.bot.food = 10;
        await hm.findFood(); // Should log 'Ate food.' via mock

        console.log('HumanManager verified.');

    } catch (e) {
        console.error('Verification failed:', e);
        process.exit(1);
    }
}

verify();
