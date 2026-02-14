import fs from 'fs';
import path from 'path';

/**
 * StrategyLoader: Base class for text-only strategy files.
 * 
 * Strategies are JSON roadmaps with human-readable instructions.
 * The AI reads the current step's instruction and writes its own code
 * to execute it using ActionAPI + skills.
 * 
 * NO game logic lives here — only progress tracking.
 */
export class StrategyLoader {
    /**
     * @param {object} agent - The bot agent instance
     * @param {string} strategyId - Strategy file name (without .json)
     */
    constructor(agent, strategyId) {
        this.agent = agent;
        this.strategyId = strategyId;
        this.strategy = null;
        this.progress = {};  // { stepId: true/false }
        this._loaded = false;

        // Paths
        const botName = agent?.name || 'Agent';
        this.knowledgeDir = path.resolve(process.cwd(), 'bots', botName, 'agent_knowledge');
        this.strategyDir = path.join(this.knowledgeDir, 'strategies');
        this.progressFile = path.join(this.strategyDir, `${strategyId}_progress.json`);

        // Default strategy location (bundled with project)
        this.defaultStrategyFile = path.resolve(
            process.cwd(), 'src', 'strategies', `${strategyId}.json`
        );
    }

    /**
     * Initialize the strategy (alias for load)
     * @returns {boolean}
     */
    init() {
        return this.load();
    }

    /**
     * Load strategy definition + saved progress
     */
    load() {
        // Ensure directories exist
        if (!fs.existsSync(this.strategyDir)) {
            fs.mkdirSync(this.strategyDir, { recursive: true });
        }

        // 1. Load strategy JSON (from bot's knowledge dir, fallback to defaults)
        const botStrategyFile = path.join(this.strategyDir, `${this.strategyId}.json`);
        let strategyPath = null;

        if (fs.existsSync(botStrategyFile)) {
            strategyPath = botStrategyFile;
        } else if (fs.existsSync(this.defaultStrategyFile)) {
            strategyPath = this.defaultStrategyFile;
            // Copy to bot's knowledge dir for future edits
            try {
                fs.copyFileSync(this.defaultStrategyFile, botStrategyFile);
            } catch (e) {
                console.warn(`[StrategyLoader] Could not copy default strategy: ${e.message}`);
            }
        }

        if (!strategyPath) {
            console.warn(`[StrategyLoader] Strategy "${this.strategyId}" not found.`);
            this._loaded = false;
            return false;
        }

        try {
            this.strategy = JSON.parse(fs.readFileSync(strategyPath, 'utf8'));
        } catch (e) {
            console.error(`[StrategyLoader] Failed to parse strategy: ${e.message}`);
            return false;
        }

        // 2. Load progress
        if (fs.existsSync(this.progressFile)) {
            try {
                this.progress = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
            } catch (e) {
                console.warn(`[StrategyLoader] Failed to load progress: ${e.message}`);
                this.progress = {};
            }
        }

        this._loaded = true;
        console.log(`[StrategyLoader] Loaded "${this.strategy.name}" (${this.getCompletedCount()}/${this.getTotalSteps()} steps done)`);
        return true;
    }

    /**
     * Get the current (first incomplete) step
     * @returns {{ id: string, instruction: string, requires: string[], done_when: string } | null}
     */
    getCurrentStep() {
        if (!this._loaded || !this.strategy?.steps) return null;

        for (const step of this.strategy.steps) {
            if (!this.progress[step.id]) {
                return step;
            }
        }
        return null; // All steps done
    }

    /**
     * Get the instruction text for the current step (for prompt injection)
     * @returns {string}
     */
    getCurrentInstruction() {
        const step = this.getCurrentStep();
        if (!step) return `Strategy "${this.strategyId}" is complete.`;

        let text = `[STRATEGY: ${this.strategy.name}]\n`;
        text += `Step ${this.getCompletedCount() + 1}/${this.getTotalSteps()}: ${step.id}\n`;
        text += `Instruction: ${step.instruction}\n`;

        if (step.requires?.length > 0) {
            text += `Requires: ${step.requires.join(', ')}\n`;
        }
        if (step.done_when) {
            text += `Done when: ${step.done_when}\n`;
        }

        return text;
    }

    /**
     * Mark a step as completed and save progress
     * @param {string} stepId
     */
    markStepDone(stepId) {
        this.progress[stepId] = true;
        this._saveProgress();
        console.log(`[StrategyLoader] ✅ Step "${stepId}" done (${this.getCompletedCount()}/${this.getTotalSteps()})`);
    }

    /**
     * Check if the entire strategy is complete
     * @returns {boolean}
     */
    isComplete() {
        if (!this._loaded || !this.strategy?.steps) return false;
        return this.strategy.steps.every(s => this.progress[s.id]);
    }

    /**
     * Reset all progress for this strategy
     */
    reset() {
        this.progress = {};
        this._saveProgress();
        console.log(`[StrategyLoader] Reset "${this.strategyId}" progress.`);
    }

    /**
     * Get a summary of progress (for prompt context)
     * @returns {{ id: string, name: string, completed: number, total: number, currentStep: string|null }}
     */
    getProgressReport() {
        const current = this.getCurrentStep();
        return {
            id: this.strategyId,
            name: this.strategy?.name || this.strategyId,
            completed: this.getCompletedCount(),
            total: this.getTotalSteps(),
            currentStep: current?.id || null
        };
    }

    getCompletedCount() {
        if (!this.strategy?.steps) return 0;
        return this.strategy.steps.filter(s => this.progress[s.id]).length;
    }

    getTotalSteps() {
        return this.strategy?.steps?.length || 0;
    }

    _saveProgress() {
        try {
            if (!fs.existsSync(this.strategyDir)) {
                fs.mkdirSync(this.strategyDir, { recursive: true });
            }
            fs.writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2), 'utf8');
        } catch (e) {
            console.error(`[StrategyLoader] Failed to save progress: ${e.message}`);
        }
    }
}

export default StrategyLoader;
