import { globalBus, SIGNAL } from './SignalBus.js';
import { TaskScheduler } from './TaskScheduler.js';
import { MemorySystem } from '../memory/MemorySystem.js';
import { EnvironmentMonitor } from './EnvironmentMonitor.js';
import { PerceptionManager } from '../perception/PerceptionManager.js';
import { VisionScheduler } from '../perception/VisionScheduler.js';
import { EvolutionEngine } from './EvolutionEngine.js'; // Evolution Layer
import { ReflexSystem } from '../../reflexes/core/ReflexSystem.js'; // System 1
import { ToolRegistry } from '../../tools/core/ToolRegistry.js'; // Phase 5: v3.1 Tools
import { SocialEngine } from '../interaction/SocialEngine.js';
import { UtilityEngine } from '../intelligence/UtilityEngine.js';
import { ContextManager } from './ContextManager.js';
import { CoreExtractor } from './CoreExtractor.js';
import { System2Loop } from '../orchestration/System2Loop.js';
import { CombatAcademy } from './CombatAcademy.js';
import { Task } from '../tasks/ScenarioManager.js';
import { SwarmSync } from './SwarmSync.js'; // Phase 7 Unified Swarm System
import { Profiler } from './Profiler.js'; // Phase 8: Reliability
import { AutoHealer } from './AutoHealer.js'; // Phase 8: Reliability

/**
 * CoreSystem - The MindOS Kernel
 * 
 * Responsible for booting and maintaining the agent's lifecycle.
 * - Initializes the Nervous System (SignalBus)
 * - Initializes Memory (Blackboard & Vector)
 * - Initializes Cortex (TaskScheduler)
 * - Runs Watchdogs (Zombie Killer, Physical Unstuck)
 */
export class CoreSystem {
    constructor(agent) {
        this.agent = agent;
        this.scheduler = null;
        this.memory = null;
        this.monitor = null;
        this.reflexSystem = null; // System 1 (Amygdala)
        this.social = null;
        this.intelligence = null;
        this.contextManager = null;
        this.extractor = null;
        this.system2 = null;
        this.scenarios = null;
        this.combatAcademy = null;
        this.swarm = null; // Phase 7
        this.profiler = null; // Phase 8
        this.autoHealer = null; // Phase 8

        // Watchdog Timers
        this._zombieTimer = null;
        this._physicalTimer = null;
        this._lastPosition = null;
        this._stuckCounter = 0;
    }

    async initialize() {
        console.log('[CoreSystem] 🚀 Booting MIND-SYNC v3.1 Kernel...');

        // 1. Initialize Memory (Blackboard is attached to TaskScheduler, but we want implicit access)
        // Note: TaskScheduler now creates Blackboard internally or we can do it here.
        // Let's rely on TaskScheduler's Blackboard for now or decouple.
        // Better: Agent has a reference to blackboard via Scheduler? 
        // Or Core initializes it. 
        // Implementation: TaskScheduler v3.1 created `this.blackboard`.

        // 2. Initialize Cortex (Task Management)
        this.scheduler = new TaskScheduler(this.agent);
        this.agent.scheduler = this.scheduler; // Expose to agent

        // 3. Initialize Memory System (Hippocampus - Vector/Chat)
        this.memory = new MemorySystem(this.agent);
        await this.memory.initialize();
        this.agent.memory = this.memory;

        // 4. Initialize Perception (Eyes & Ears)
        this.monitor = new EnvironmentMonitor(this.agent);
        this.agent.envMonitor = this.monitor; // Bridge early

        this.perceptionManager = new PerceptionManager(this.agent);
        this.agent.perceptionManager = this.perceptionManager;

        this.visionScheduler = new VisionScheduler(this.agent);
        this.perceptionManager.visionScheduler = this.visionScheduler;
        this.agent.visionScheduler = this.visionScheduler;

        // 5. Initialize Reflexes (System 1)
        this.reflexSystem = new ReflexSystem(this.agent);
        // await this.reflexSystem.loadReflexes(); // DELETED: Method does not exist in ReflexSystem.js
        this.agent.reflexSystem = this.reflexSystem;

        // 5b. Initialize Tools (System 2 Support)
        this.toolRegistry = new ToolRegistry(this.agent);
        await this.toolRegistry.discoverSkills();
        this.agent.toolRegistry = this.toolRegistry;

        // 6. Initialize Evolution Engine (DNA)
        this.evolution = new EvolutionEngine(this.agent);
        // Listen for failures
        globalBus.subscribe(SIGNAL.TASK_FAILED, (payload) => {
            if (payload.fatal || payload.error.includes('died')) {
                this.evolution.analyzeAndCreate({ cause: payload.error, context: payload.snapshot });
            }
        });

        // 7. Initialize Social & Intelligence
        this.social = new SocialEngine(this.agent);
        this.agent.social = this.social;

        this.intelligence = new UtilityEngine(this.agent);
        this.agent.intelligence = this.intelligence;

        // 8. Initialize Orchestration & Tasks
        this.system2 = new System2Loop(this.agent);
        this.agent.system2 = this.system2;

        this.scenarios = new Task(this.agent, this.agent.config?.task);
        this.agent.scenarios = this.scenarios;

        this.combatAcademy = new CombatAcademy(this.agent);
        this.agent.combatAcademy = this.combatAcademy;

        // 9. Initialize Context & Extraction
        this.contextManager = new ContextManager(this.agent);
        this.agent.contextManager = this.contextManager;

        this.extractor = new CoreExtractor(this.agent);
        this.agent.extractor = this.extractor;

        // 9b. Wire Core Infrastructure Signals
        this._setupCoreListeners();

        // 10. Start Watchdogs
        this._startWatchdogs();

        // 11. Profiler (Phase 8)
        this.profiler = new Profiler(this.agent);
        this.agent.profiler = this.profiler;
        this.profiler.init();

        // 12. AutoHealer (Phase 8)
        this.autoHealer = new AutoHealer(this.agent);
        this.agent.autoHealer = this.autoHealer;
        this.autoHealer.init();

        console.log('[CoreSystem] ✅ Kernel Ready. Waiting for Neural Link...');
        globalBus.emitSignal(SIGNAL.SYSTEM_READY);
    }

    _setupCoreListeners() {
        // Inventory Sync (Phase 1)
        globalBus.subscribe(SIGNAL.BOT_READY, () => {
            if (this.agent.bot) {
                // Initial sync
                this.scheduler.blackboard.updateInventoryCache(this.agent.bot);
                this.scheduler.blackboard.updateVitals(this.agent.bot);

                // Listen for inventory updates
                this.agent.bot.inventory.on('update', () => {
                    this.scheduler.blackboard.updateInventoryCache(this.agent.bot);
                });

                // Listen for health/food updates
                this.agent.bot.on('health', () => {
                    this.scheduler.blackboard.updateVitals(this.agent.bot);

                    // Trigger signals for TaskScheduler
                    if (this.agent.bot.health <= 6) {
                        globalBus.emitSignal(SIGNAL.HEALTH_CRITICAL, { health: this.agent.bot.health });
                    } else if (this.agent.bot.health <= 12) {
                        globalBus.emitSignal(SIGNAL.HEALTH_LOW, { health: this.agent.bot.health });
                    }
                });

                this.agent.bot.on('food', () => {
                    this.scheduler.blackboard.updateVitals(this.agent.bot);
                    if (this.agent.bot.food < 6) {
                        globalBus.emitSignal(SIGNAL.HUNGRY, { food: this.agent.bot.food });
                    }
                });

                // Start Environment Monitor
                if (this.monitor && !this.monitor.active) {
                    this.monitor.start();
                }
                if (this.perceptionManager && !this.perceptionManager.active) {
                    this.perceptionManager.start();
                }
            }
        });
    }

    _startWatchdogs() {
        // Zombie Task Killer (Every 10s)
        this._zombieTimer = setInterval(() => {
            if (this.scheduler) {
                this.scheduler.checkZombieTasks(60000); // 1 min TTL
            }
        }, 10000);

        // Physical Watchdog (Every 3s)
        this._physicalTimer = setInterval(() => {
            this._checkPhysicalStuck();
        }, 3000);

        // System Tick (Every 1s) - Phase 8: Profiling
        this._tickTimer = setInterval(() => {
            globalBus.emitSignal(SIGNAL.SYSTEM_TICK);
        }, 1000);
    }

    _checkPhysicalStuck() {
        const bot = this.agent.bot;
        if (!bot || !bot.entity) return;

        // Only check if we are moving (pathfinder active)
        // Mineflayer-pathfinder sets bot.pathfinder.isMoving? No, check goal?
        // Fallback: Check if we have an active MOVE task in Scheduler
        const isMoving = this.scheduler.activeTasks.has('traverse') || this.scheduler.activeTasks.has('move');

        if (isMoving) {
            const currentPos = bot.entity.position;
            if (this._lastPosition && currentPos.distanceTo(this._lastPosition) < 0.2) {
                this._stuckCounter++;
                if (this._stuckCounter > 3) { // Stuck for 9 seconds
                    console.warn('[CoreSystem] ⚠️ Physical Watchdog: Agent is STUCK!');

                    // Trigger Unstuck Reflex (Phase 2: Block Breaking Parity)
                    this.scheduler.schedule('reflex_unstuck', 100, async () => {
                        const stuckReflex = this.reflexSystem?.reflexes?.stuck;
                        if (stuckReflex) {
                            await stuckReflex.recover();
                        } else {
                            // Fallback if StuckReflex missing
                            bot.setControlState('jump', true);
                            const yaw = Math.random() * Math.PI * 2;
                            await bot.look(yaw, 0);
                            await new Promise(r => setTimeout(r, 500));
                            bot.setControlState('jump', false);
                        }
                    });

                    this._stuckCounter = 0;
                }
            } else {
                this._stuckCounter = 0;
            }
            this._lastPosition = currentPos.clone();
        } else {
            this._stuckCounter = 0;
            this._lastPosition = bot.entity.position.clone();
        }
    }

    shutdown() {
        console.log('[CoreSystem] 🛑 Kernel Shutdown Initiated...');
        if (this._zombieTimer) clearInterval(this._zombieTimer);
        if (this._physicalTimer) clearInterval(this._physicalTimer);
        if (this._tickTimer) clearInterval(this._tickTimer);

        if (this.scheduler) this.scheduler.shutdown();
        if (this.memory) this.memory.shutdown?.();
        if (this.monitor) this.monitor.shutdown?.(); // If implemented

        globalBus.clearAllListeners();
    }
}
