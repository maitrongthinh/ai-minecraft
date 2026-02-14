import { KnowledgeStore } from './KnowledgeStore.js';
import { StrategyLoader } from './StrategyLoader.js';

export class StrategyRunner {
    constructor(agent) {
        this.agent = agent;
        this.activeStrategy = null; // Instance of StrategyLoader
        this.paused = false;
    }

    /**
     * Load and start a strategy by ID
     * @param {string} strategyId - e.g. "nether_expedition"
     */
    async startStrategy(strategyId) {
        // Dynamic import or factory
        let strategy;

        try {
            switch (strategyId) {
                case 'nether_expedition':
                    const { NetherStrategy } = await import('./NetherStrategy.js');
                    strategy = new NetherStrategy(this.agent);
                    break;
                case 'end_expedition':
                    const { EndStrategy } = await import('./EndStrategy.js');
                    strategy = new EndStrategy(this.agent);
                    break;
                case 'survival_basics':
                case 'base_building':
                    // These might be generic loaders if we didn't make specific classes
                    // For now, let's assume we use the base loader if no specific class exists
                    strategy = new StrategyLoader(this.agent, strategyId);
                    break;
                default:
                    console.warn(`[StrategyRunner] Unknown strategy: ${strategyId}`);
                    return false;
            }

            await strategy.init();
            this.activeStrategy = strategy;
            this.agent.knowledge.updateStrategyStatus(strategyId, strategy.getCurrentStep().id);
            console.log(`[StrategyRunner] Started strategy: ${strategyId}`);
            return true;

        } catch (error) {
            console.error(`[StrategyRunner] Failed to start ${strategyId}:`, error);
            return false;
        }
    }

    /**
     * Advance to next step manually (or via Brain signal)
     */
    advanceStep() {
        if (!this.activeStrategy) return false;

        const current = this.activeStrategy.getCurrentStep();
        this.activeStrategy.markStepDone(current.id);

        const next = this.activeStrategy.getCurrentStep();
        if (next) {
            this.agent.knowledge.updateStrategyStatus(this.activeStrategy.strategyId, next.id);
            console.log(`[StrategyRunner] Advanced to step: ${next.id}`);
            this.agent.bot.chat(`Strategy update: ${next.instruction}`);
            return true;
        } else {
            console.log(`[StrategyRunner] Strategy ${this.activeStrategy.strategyId} complete!`);
            this.agent.knowledge.updateStrategyStatus('idle', null);
            this.activeStrategy = null;
            return false;
        }
    }

    /**
     * Get the current high-level instruction
     */
    getCurrentInstruction() {
        if (!this.activeStrategy) return null;
        return this.activeStrategy.getCurrentStep()?.instruction;
    }

    getStatus() {
        if (!this.activeStrategy) return 'idle';
        const step = this.activeStrategy.getCurrentStep();
        return `${this.activeStrategy.strategyId} -> ${step ? step.id : 'complete'}`;
    }
}
