import fs from 'fs';
import path from 'path';
import settings from '../../../settings.js';
import { globalBus, SIGNAL } from './SignalBus.js';
import { PRIORITY } from './TaskScheduler.js';
import AdvancementLadder from './AdvancementLadder.js';
import SpawnBaseManager from './SpawnBaseManager.js';
import DefenseController from './DefenseController.js';
import * as skills from '../../skills/library/index.js';

const PHASE = {
    BOOTSTRAP: 'BOOTSTRAP',
    EARLY_SURVIVAL: 'EARLY_SURVIVAL',
    ADVANCEMENT_PROGRESS: 'ADVANCEMENT_PROGRESS',
    SPAWN_BASE_BUILD: 'SPAWN_BASE_BUILD',
    DEFENSE_STANDBY: 'DEFENSE_STANDBY',
    TRAINING_CONTINUOUS: 'TRAINING_CONTINUOUS'
};

import { StrategyRunner } from './StrategyRunner.js';

const MISSION_PHASE = {
    SURVIVAL_BASICS: 'survival_basics',
    RESOURCE_GATHERING: 'resource_gathering',
    BASE_CONSTRUCTION: 'base_construction',
    ADVANCEMENT_PROGRESS: 'advancement_progress', // New phase for advancements
    IDLE: 'idle'
};

const ADV_SUB_PHASE = {
    OVERWORLD: 'overworld',
    NETHER_PREP: 'nether_prep',
    NETHER_EXPEDITION: 'nether_expedition',
    END_PREP: 'end_prep',
    END_FIGHT: 'end_fight',
    POST_GAME: 'post_game'
};

const EXECUTION_MODE = {
    ROADMAP_VALIDATION_ONLY: 'roadmap_validation_only',
    DIRECT_TASK_EXECUTION: 'direct_task_execution'
};

export class MissionDirector {
    constructor(agent, options = {}) {
        this.agent = agent;
        this.currentPhase = MISSION_PHASE.SURVIVAL_BASICS;
        this.advancementLadder = options.ladder || new AdvancementLadder(agent);
        this.baseManager = options.spawnBaseManager || new SpawnBaseManager(agent);
        this.strategyRunner = new StrategyRunner(agent);
        this.defenseController = options.defenseController || new DefenseController(agent);
        this.executionMode = options.executionMode || settings?.mission?.execution_mode || EXECUTION_MODE.ROADMAP_VALIDATION_ONLY;

        this.loopHandle = null;
        this.progressPath = null;
        this.state = {
            phase: this.phase,
            completedMilestones: [],
            lastMilestoneAttempt: null,
            lastTaskAt: 0,
            lastGuidanceAt: 0,
            recommendedObjective: null,
            baseBuiltAt: null,
            defenseActivatedAt: null,
            updatedAt: Date.now()
        };

        this._spawnSub = globalBus.subscribe(SIGNAL.BOT_SPAWNED, () => {
            this._captureSpawnAnchor();
        });
    }

    init() {
        const baseDir = path.resolve(process.cwd(), 'bots', this.agent?.name || 'Agent');
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }

        this.progressPath = path.join(baseDir, 'mission_progress.json');
        this._load();
        this.baseManager.init?.();
    }

    _load() {
        try {
            if (!this.progressPath || !fs.existsSync(this.progressPath)) return;
            const raw = fs.readFileSync(this.progressPath, 'utf8');
            if (!raw.trim()) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                this.state = { ...this.state, ...parsed };
                this.phase = this.state.phase || this.phase;
            }
        } catch (error) {
            console.warn(`[MissionDirector] Failed to load mission progress: ${error.message}`);
        }
    }

    _save() {
        if (!this.progressPath) return;
        this.state.phase = this.phase;
        this.state.updatedAt = Date.now();

        try {
            fs.writeFileSync(this.progressPath, JSON.stringify(this.state, null, 2), 'utf8');
        } catch (error) {
            console.warn(`[MissionDirector] Failed to save mission progress: ${error.message}`);
        }
    }

    _captureSpawnAnchor() {
        try {
            const existing = this.agent?.memory?.getPlace?.('spawn_anchor');
            if (existing) return;

            const pos = this.agent?.bot?.entity?.position;
            if (!pos) return;

            this.agent.memory.setPlace('spawn_anchor', {
                x: Math.floor(pos.x),
                y: Math.floor(pos.y),
                z: Math.floor(pos.z)
            });
        } catch {
            // no-op
        }
    }

    async tick() {
        // Evaluate current state and adjust phase
        if (typeof this._evaluatePhase === 'function') {
            await this._evaluatePhase();
        } else {
            // Fallback if not implemented
            this._checkAdvancements();
        }

        switch (this.currentPhase) {
            case MISSION_PHASE.SURVIVAL_BASICS:
                if (this._executeSurvivalBasics) await this._executeSurvivalBasics();
                break;
            case MISSION_PHASE.ADVANCEMENT_PROGRESS:
                if (this._executeAdvancementProgress) await this._executeAdvancementProgress();
                break;
            default:
                break;
        }
    }

    // Placeholder for missing method
    _evaluatePhase() {
        // Check inventory/stats to determine phase
        if (!this.agent.bot) return;

        // Example logic:
        // If has wood and stone tools -> ADVANCEMENT_PROGRESS
        const inv = this.agent.bot.inventory.items();
        const hasStonePick = inv.some(i => i.name.includes('stone_pickaxe'));

        if (hasStonePick && this.currentPhase === MISSION_PHASE.SURVIVAL_BASICS) {
            this.currentPhase = MISSION_PHASE.ADVANCEMENT_PROGRESS;
            console.log('[MissionDirector] 🆙 Advanced to Phase: ADVANCEMENT_PROGRESS');
        }
    }

    _checkAdvancements() {
        // ...
    }

    start() {
        if (this.loopHandle) return;
        this.loopHandle = setInterval(() => {
            void this.tick();
        }, 5000);
    }

    stop() {
        if (this.loopHandle) {
            clearInterval(this.loopHandle);
            this.loopHandle = null;
        }

        this.defenseController.stop();
        this._save();
    }

    _setPhase(next, reason = '') {
        if (!next || this.phase === next) return;
        this.phase = next;
        this.state.phase = next;

        globalBus.emitSignal(SIGNAL.MISSION_PHASE_CHANGED, {
            phase: next,
            reason,
            timestamp: Date.now()
        });

        this._save();
    }

    _recordMilestoneCompletion(milestoneId) {
        if (this.state.completedMilestones.includes(milestoneId)) return;
        this.state.completedMilestones.push(milestoneId);

        globalBus.emitSignal(SIGNAL.MISSION_MILESTONE_COMPLETED, {
            milestone: milestoneId,
            timestamp: Date.now()
        });
    }

    async _executeMilestoneTask(step, signal) {
        const actionAPI = this.agent?.actionAPI;
        if (!actionAPI) return { success: false, error: 'ActionAPI unavailable' };

        if (step.type === 'action') {
            const name = String(step.name || '').toLowerCase();
            const methodMap = {
                gather_nearby: 'gather_nearby',
                craft_first_available: 'craftfirstavailable',
                ensure_item: 'ensure_item',
                ensure_offhand: 'ensure_offhand',
                eat_if_hungry: 'eat_if_hungry',
                collect_drops: 'collect_drops',
                smelt: 'smelt',
                move_to: 'moveto'
            };
            const method = methodMap[name] || name;

            if (typeof actionAPI[method] === 'function') {
                return await actionAPI[method](step.params || {});
            }

            return { success: false, error: `Unsupported action step: ${step.name}` };
        }

        if (step.type === 'skill') {
            const skillFn = skills[step.name];
            if (typeof skillFn === 'function') {
                return await skillFn(this.agent, step.params || {});
            }
            return { success: false, error: `Unknown skill step: ${step.name}` };
        }

        return { success: false, error: `Unknown step type: ${step.type}` };
    }

    async _runMilestone(milestone, signal) {
        if (!milestone) return { success: false, error: 'missing_milestone' };
        for (const step of milestone.taskPlan || []) {
            if (signal?.aborted) {
                return { success: false, error: 'aborted' };
            }

            const result = await this._executeMilestoneTask(step, signal);
            if (!result?.success) {
                const stepName = step?.name || step?.type || 'unknown_step';
                const error = result?.error || `step_failed:${stepName}`;
                console.warn(`[MissionDirector] Milestone '${milestone.id}' stopped at '${stepName}': ${error}`);

                // Track failure for backoff
                if (!this.state.milestoneFailures) this.state.milestoneFailures = {};
                const mf = this.state.milestoneFailures[milestone.id] || { count: 0, lastFailAt: 0 };
                mf.count++;
                mf.lastFailAt = Date.now();
                this.state.milestoneFailures[milestone.id] = mf;

                if (mf.count >= 3) {
                    console.warn(`[MissionDirector] ⏸️ Milestone '${milestone.id}' failed ${mf.count}x. Cooling down for 60s.`);
                }

                return { success: false, error, failedStep: stepName };
            }
        }

        return { success: true };
    }

    _scheduleMissionTask(name, priority, taskFn) {
        if (!this.agent?.scheduler) return;
        this.agent.scheduler.schedule(name, priority, taskFn, false);
    }

    _hasPlace(name) {
        try {
            return Boolean(this.agent?.memory?.getPlace?.(name));
        } catch {
            return false;
        }
    }

    _isBaseLikelyStable() {
        if (this.spawnBaseManager?.isBaseStable?.()) return true;

        const hasBasePlaces =
            this._hasPlace('base_center') &&
            this._hasPlace('home') &&
            this._hasPlace('farm_center');

        if (hasBasePlaces) return true;

        const items = this.agent?.bot?.inventory?.items?.() || [];
        const hasBed = items.some(i => i?.name?.includes('_bed'));
        const hasFoodStock = items
            .filter(i => i?.name && (i.name.includes('bread') || i.name.includes('cooked_') || i.name.includes('potato') || i.name.includes('carrot')))
            .reduce((sum, i) => sum + (i.count || 0), 0) >= 8;

        return hasBed && hasFoodStock;
    }

    async _arbitrateGoal() {
        // Priority 1: Self-Preservation (Hunger/Health)
        if (this.agent.bot.food < 10) {
            return { type: 'survival', name: 'eat_food', priority: PRIORITY.CRITICAL };
        }

        // Priority 2: Defense (If threatened)
        if (this.phase === PHASE.DEFENSE_STANDBY || this.phase === PHASE.TRAINING_CONTINUOUS) {
            // Logic handled by DefenseController, but we can reinforce it here
        }

        // Priority 3: Progression (Advancement Ladder)
        const nextMilestone = this.ladder.getNextMilestone(this.state.completedMilestones);
        if (nextMilestone) {
            // Backoff: skip milestones that have failed 3+ times recently
            const mf = this.state.milestoneFailures?.[nextMilestone.id];
            if (mf && mf.count >= 3 && (Date.now() - mf.lastFailAt < 60_000)) {
                console.log(`[MissionDirector] ⏸️ Skipping '${nextMilestone.id}' (${mf.count} failures, cooling down)`);
                // Try the NEXT eligible milestone (respecting prerequisites)
                const allMilestones = this.ladder.listMilestones?.() || [];
                const completedSet = new Set(this.state.completedMilestones);
                for (const m of allMilestones) {
                    if (completedSet.has(m.id)) continue;
                    if (m.id === nextMilestone.id) continue;
                    // MUST check prerequisites are met
                    const prereqsMet = (m.prerequisites || []).every(req => completedSet.has(req));
                    if (!prereqsMet) continue;
                    const altMf = this.state.milestoneFailures?.[m.id];
                    if (altMf && altMf.count >= 3 && (Date.now() - altMf.lastFailAt < 60_000)) continue;
                    return { type: 'progression', name: m.id, milestone: m, priority: PRIORITY.HIGH };
                }
                // All eligible milestones on cooldown — wait it out
                console.log(`[MissionDirector] 💤 All milestones on cooldown. Waiting...`);
                return null;
            }

            // Reset failure count if cooldown expired
            if (mf && mf.count >= 3 && (Date.now() - mf.lastFailAt >= 60_000)) {
                mf.count = 0;
            }

            return { type: 'progression', name: nextMilestone.id, milestone: nextMilestone, priority: PRIORITY.HIGH };
        }

        // Priority 4: Base Building (If milestone met but base incomplete)
        if (this.phase === PHASE.SPAWN_BASE_BUILD && !this.state.baseBuiltAt) {
            return { type: 'build', name: 'base_construction', priority: PRIORITY.NORMAL };
        }

        return null;
    }

    async _executeSurvivalBasics() {
        if (!this.strategyRunner) return;

        // 1. Start Strategy if not active
        if (!this.strategyRunner.activeStrategy) {
            console.log('[MissionDirector] 🌲 Starting S.E.R.E. (Survival, Evasion, Resistance, Escape) Protocol...');
            const success = await this.strategyRunner.startStrategy('survival_basics');
            if (!success) {
                console.warn('[MissionDirector] Failed to start survival_basics strategy.');
            }
            return;
        }

        // 2. Check if current step is complete
        const strategy = this.strategyRunner.activeStrategy;
        const currentStep = strategy.getCurrentStep();

        if (!currentStep) {
            console.log('[MissionDirector] Strategy complete?');
            return;
        }

        // Check completion condition (Generic parsing)
        const isComplete = await this._checkStepCompletion(currentStep);
        if (isComplete) {
            console.log(`[MissionDirector] ✅ Step '${currentStep.id}' complete! Advancing...`);
            this.strategyRunner.advanceStep();
            // Stop any running System2 task for the old step
            if (this.agent.core.system2.isRunning) {
                this.agent.core.system2.handleOverride({ command: 'stop' });
            }
            return;
        }

        // 3. Delegate to System 2 if idle
        if (!this.agent.core.system2.isBusy()) {
            console.log(`[MissionDirector] 🧠 Delegating step to System 2: "${currentStep.instruction}"`);
            // Execute as a goal
            this.agent.core.system2.processGoal(currentStep.instruction);
        }
    }

    async _checkStepCompletion(step) {
        // Simple condition parser
        if (!step.done_when) return false;
        const condition = step.done_when.toLowerCase();
        const inv = this.agent.bot.inventory.items();

        if (condition.includes('inventory has')) {
            // "inventory has >= 8 logs"
            const parts = condition.replace('inventory has', '').trim().split(' ');
            const operator = parts[0]; // ">="
            const count = parseInt(parts[1]);
            const itemKey = parts.slice(2).join(' '); // "logs" or "logs (any wood type)"

            // Helper to count items fuzzy matching
            const countItems = (key) => {
                if (key.includes('log')) return inv.filter(i => i.name.includes('_log')).reduce((a, b) => a + b.count, 0);
                if (key.includes('plank')) return inv.filter(i => i.name.includes('_planks')).reduce((a, b) => a + b.count, 0);
                if (key.includes('cobblestone')) return inv.filter(i => i.name === 'cobblestone').reduce((a, b) => a + b.count, 0);
                if (key.includes('crafting_table')) return inv.some(i => i.name === 'crafting_table') ? 1 : 0;
                if (key.includes('wooden_pickaxe')) return inv.some(i => i.name === 'wooden_pickaxe') ? 1 : 0;
                if (key.includes('wooden_sword')) return inv.some(i => i.name === 'wooden_sword') ? 1 : 0;
                if (key.includes('stone_pickaxe')) return inv.some(i => i.name === 'stone_pickaxe') ? 1 : 0;
                if (key.includes('stone_sword')) return inv.some(i => i.name === 'stone_sword') ? 1 : 0;
                if (key.includes('furnace')) return inv.some(i => i.name === 'furnace') ? 1 : 0;
                if (key.includes('iron_ingot')) return inv.filter(i => i.name === 'iron_ingot').reduce((a, b) => a + b.count, 0);
                return 0;
            };

            const actual = countItems(itemKey);
            if (operator === '>=') return actual >= count;
        }

        if (condition.includes('placed')) {
            // Check world blocks (Expensive scan? Logic might be better in StrategyLoader)
            // For now, assume if we don't have it in inventory but did the task, maybe we placed it?
            // Actually, querying world for specific block near bot is better.
            const blockName = condition.split(' ')[0]; // "crafting_table"
            const nearby = this.agent.bot.findBlock({
                matching: (b) => b.name === blockName,
                maxDistance: 5
            });
            return !!nearby;
        }

        return false;
    }

    async _executeAdvancementProgress() {
        // ... (existing code check)
        const nextMilestone = this.advancementLadder.getNextMilestone(this.state.completedMilestones);
        // ...

        if (nextMilestone) {
            console.log(`[MissionDirector] Pursuing milestone: ${nextMilestone.id} (${nextMilestone.category})`);

            // Delegate to specialized strategies based on category/task
            if (nextMilestone.category === 'nether') {
                if (this.strategyRunner.activeStrategy?.strategyId !== 'nether_expedition') {
                    await this.strategyRunner.startStrategy('nether_expedition');
                }
            } else if (nextMilestone.category === 'end') {
                if (this.strategyRunner.activeStrategy?.strategyId !== 'end_expedition') {
                    await this.strategyRunner.startStrategy('end_expedition');
                }
            } else {
                // Default to standard task execution for Overworld
                await this._executeTaskPlan(nextMilestone.taskPlan);
            }
        } else {
            console.log('[MissionDirector] No accessible milestones. Wandering...');
        }
    }

    async _executeTaskPlan(taskPlan) {
        this.stop();
    }
}

MissionDirector.PHASE = PHASE;
MissionDirector.EXECUTION_MODE = EXECUTION_MODE;

export default MissionDirector;
