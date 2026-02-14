
import fs from 'fs';
import path from 'path';

export class CoreExtractor {
    constructor(agent) {
        this.agent = agent;
        this.exportPath = path.resolve(process.cwd(), 'param_extraction');
    }

    /**
     * Export all learned intelligence to JSON.
     */
    async exportCore() {
        if (!fs.existsSync(this.exportPath)) {
            fs.mkdirSync(this.exportPath, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const artifactName = `core_intelligence_${timestamp}.json`;
        const fullPath = path.join(this.exportPath, artifactName);

        const coreData = {
            meta: {
                agentName: this.agent.name,
                exportedAt: new Date().toISOString(),
                version: '1.0.0'
            },
            // 1. Genetic Instincts (EvolutionEngine)
            genome: this.agent.evolution ? this.agent.evolution.genome : {},

            // 2. Action Optimization Stats
            actionStats: this.agent.evolution ? Object.fromEntries(this.agent.evolution.actionStats) : {},

            // 3. Learned Combat Parameters
            combatStats: this.agent.combatAcademy ? this.agent.combatAcademy.sessionStats : {},

            // 4. Learned Behavior Rules (Reflexes policies)
            reflexPolicies: {
                selfPreservation: this.agent.reflexes.selfPreservation._getRulePolicy(),
                combat: this.agent.reflexes.combat._getRulePolicy()
            }
        };

        fs.writeFileSync(fullPath, JSON.stringify(coreData, null, 2));
        console.log(`[CoreExtractor] 🧠 Intelligence extracted to: ${fullPath}`);
        return fullPath;
    }
}
