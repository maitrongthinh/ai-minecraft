
import { Agent } from './src/agent/agent.js';
import EvolutionEngine from './src/agent/core/EvolutionEngine.js';
import { CombatAcademy } from './src/agent/core/CombatAcademy.js';
import { CoreExtractor } from './src/agent/core/CoreExtractor.js';
import { SelfPreservationReflex } from './src/agent/reflexes/SelfPreservationReflex.js';
import { CombatReflex } from './src/agent/reflexes/CombatReflex.js';

// Mock settings/env for standalone run
const settings = {
    host: 'localhost',
    port: 25565,
    username: 'ExtractorBot',
    auth: 'offline',
    profiles: []
};

// Mock Agent Wrapper to avoid full Minecraft connection
class ExtractorAgent extends Agent {
    constructor() {
        super();
        // Manually init these for the mock since we skip _connectToMinecraft
        this.evolution = new EvolutionEngine(this);
        this.combatAcademy = new CombatAcademy(this);
        this.extractor = new CoreExtractor(this);

        // Mock Reflexes
        this.reflexes = {
            selfPreservation: new SelfPreservationReflex(this),
            combat: new CombatReflex(this)
        };
    }

    async _connectToMinecraft() {
        console.log('[Extractor] Skipping Minecraft connection...');
        // Mock sub-systems that usually init on connection
    }
}

async function runExtraction() {
    console.log('--- Starting Core Extraction ---');
    try {
        const agent = new ExtractorAgent();
        // Manually trigger init of modules that usually happen in constructor
        // (Agent constructor already does most of it)

        // Simulate some learning data (Pre-fill for demo if empty)
        if (agent.evolution) {
            agent.evolution.genome.survival_health_threshold = 5.5; // Mutated value
            agent.evolution.actionStats.set('mine', { attempts: 50, successes: 48, avgDuration: 1200 });
        }

        const path = await agent.extractor.exportCore();
        console.log(`[SUCCESS] Core extracted successfully to: ${path}`);
        process.exit(0);
    } catch (error) {
        console.error('[ERROR] Extraction failed:', error);
        process.exit(1);
    }
}

runExtraction();
