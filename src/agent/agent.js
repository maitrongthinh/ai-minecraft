import { MemorySystem } from './memory/MemorySystem.js';
import { TaskScheduler, PRIORITY } from './core/TaskScheduler.js';
import { StateStack, STATE_PRIORITY } from './StateStack.js';
import { globalBus, SIGNAL } from './core/SignalBus.js';
import convoManager from './conversation.js';
import { handleTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import { serverProxy, sendThoughtToServer, sendOutputToServer, sendSystem2TraceToServer } from './mindserver_proxy.js';
import { speak } from './speak.js';
import { log, validateNameFormat, handleDisconnection } from './connection_handler.js';
import { UnifiedBrain } from '../brain/UnifiedBrain.js';
import { PlannerAgent } from './orchestration/PlannerAgent.js';

import { ActionLogger } from '../utils/ActionLogger.js';
import { randomUUID } from 'crypto';
import settings from '../../settings.js';
import { HealthMonitor } from '../process/HealthMonitor.js';
import { MentalSnapshot } from '../utils/MentalSnapshot.js';
import { CoreSystem } from './core/CoreSystem.js';
import { RetryHelper } from '../utils/RetryHelper.js';
import { AsyncMutex } from '../utils/AsyncLock.js';
import { BOT_STATE } from './core/BotState.js';
import { ActionManager } from './action_manager.js';
import { ActionAPI } from './core/ActionAPI.js';
import { SkillLibrary } from '../skills/SkillLibrary.js';
import { SkillOptimizer } from '../skills/SkillOptimizer.js';
import { VisionInterpreter } from './vision/vision_interpreter.js';
import { CogneeMemoryBridge } from '../memory/CogneeMemoryBridge.js';
import { Arbiter } from './Arbiter.js';
import { initBot } from '../utils/mcdata.js';
import { StandardProfileSchema } from '../utils/StandardProfileSchema.js';
import { Prompter } from '../models/prompter.js';
import { UtilityEngine } from './intelligence/UtilityEngine.js';
import { SelfPrompter } from './self_prompter.js';
import { Task } from './tasks/ScenarioManager.js';
import { PhysicsPredictor } from './reflexes/PhysicsPredictor.js';
import { DeathRecovery } from './reflexes/DeathRecovery.js';
import { Watchdog } from './reflexes/Watchdog.js';
import { ReplayBuffer } from './core/ReplayBuffer.js';
import { HitSelector } from './reflexes/HitSelector.js';
import { SwarmSync } from './core/SwarmSync.js';
import { PathfindingWorkerController } from './core/PathfindingWorker.js';
import MissionDirector from './core/MissionDirector.js';
import AdvancementLadder from './core/AdvancementLadder.js';
import SpawnBaseManager from './core/SpawnBaseManager.js';
import DefenseController from './core/DefenseController.js';
import BehaviorRuleEngine from './core/BehaviorRuleEngine.js';
import ChatInstructionLearner from './core/ChatInstructionLearner.js';
import { AdventureLogger } from './core/AdventureLogger.js';
import { EnvironmentMonitor } from './core/EnvironmentMonitor.js';
import { CombatAcademy } from './core/CombatAcademy.js';
import { PlayerTrainingMode } from './core/PlayerTrainingMode.js';
import { ToolCreatorEngine } from './core/ToolCreatorEngine.js';
import { KnowledgeStore } from './core/KnowledgeStore.js';
import { MinecraftWiki } from '../tools/MinecraftWiki.js';
import fs from 'fs';
import path from 'path';

export class Agent {
    constructor() {
        this.name = 'Agent';
        this.running = false;
        this.state = BOT_STATE.BOOTING;
        this.actions = new ActionManager(this); // Instantiate early
        this.actionAPI = new ActionAPI(this);
        this.history = { getHistory: () => [], add: () => { }, save: () => { } };
        this.prompter = null;
        this.core = null;
        this.bot = null;
        this.self_prompter = new SelfPrompter(this);
        this.isReady = false; // Readiness flag
        this.adventureLogger = null;
        this.collaboration = {
            mode: 'survival',
            owner: '',
            teammates: [],
            obeyOwner: true
        };
    }

    async start(load_mem = false, init_message = null, count_id = 0) {
        this.last_sender = null;
        this.count_id = count_id;
        this._disconnectHandled = false;
        this.running = true;
        this.latestRequestId = null;
        this.state = BOT_STATE.BOOTING; // Initial State

        // Phase 2 Refactor: Unified Configuration Management
        this.config = JSON.parse(JSON.stringify(settings)); // Global Defaults
        let profileData = null;

        try {
            const profilePath = settings.profiles.find(p => p.includes(settings.base_profile)) || settings.profiles[0];
            if (profilePath) {
                console.log(`[MindOS] Loading profile: ${profilePath}`);
                const p = path.resolve(process.cwd(), profilePath);
                profileData = JSON.parse(fs.readFileSync(p, 'utf8'));
            }
        } catch (err) {
            console.error(`[MindOS] ⚠️ Failed to load profile. Falling back to Standard Schema. Error: ${err.message}`);
        }

        // Resolving model aliases from settings (high_iq and fast)
        for (const alias of ['high_iq', 'fast']) {
            if (profileData && profileData.model === alias && settings.models?.[alias]) {
                console.log(`[MindOS] Resolving model alias '${alias}' -> '${settings.models[alias].model}'`);
                const modelConfig = { ...settings.models[alias] };

                // Dynamic API Key Resolution (User Request: choose enum env key name)
                if (modelConfig.apiKeyEnv) {
                    const envKey = modelConfig.apiKeyEnv;
                    const resolvedKey = process.env[envKey];
                    if (resolvedKey) {
                        modelConfig.params = { ...modelConfig.params, apiKey: resolvedKey };
                        console.log(`[MindOS] ✓ API Key resolved from env: ${envKey}`);
                    } else {
                        console.warn(`[MindOS] ⚠️ API Key Environment Variable '${envKey}' not found.`);
                    }
                }

                Object.assign(profileData, modelConfig);
            }
        }

        // Merge with Profile (Priority: Profile > Settings > Schema)
        const finalProfile = { ...StandardProfileSchema, ...profileData };
        this.config.profile = finalProfile;

        // Legacy compatibility: ensure this.prompter gets the combined profile
        this.prompter = new Prompter(this, finalProfile);
        this._loadCollaborationSettings();

        // MindOS Core (Bootloader)
        this.core = new CoreSystem(this);
        await this.core.initialize();

        // Consolidate Unified Modules (Phase 2 Refactor)
        this.memory = this.core.memory; // Bridged from Kernel
        this.unifiedMemory = this.memory; // Phase 3: Unified Memory interface
        this.social = this.core.social;
        this.intelligence = this.core.intelligence;
        this.scenarios = this.core.scenarios;
        this.contextManager = this.core.contextManager;
        // Core Bridges
        this.scheduler = this.core.scheduler;
        this.bus = globalBus;

        // Nervous System - DEFERRED until heavy subsystems load
        // This prevents circular dependencies (brain needs CogneeMemory + SkillLibrary)
        this.brain = null;

        // Feature Modules
        this.history = this.memory; // Legacy compatibility (Unified Phase 4)

        // Finalize Name and Memory Path
        this.name = (this.prompter.getName() || '').trim();
        this.memory.updateName(this.name);

        console.log(`[MindOS] Agent ${this.name} waking up...`);

        this.arbiter = new Arbiter(this);
        this.planner = new PlannerAgent(this);
        this.wiki = new MinecraftWiki(this);
        this.healthMonitor = new HealthMonitor(this);
        this.healthMonitor.start();

        // -------------------------------------------------------------
        // UNIFIED CORE LINKING (Refactor Phase 5)
        // -------------------------------------------------------------

        // 1. Core Modules (Aliases for Backward Compatibility)
        this.evolution = this.core.evolution;
        this.toolRegistry = this.core.toolRegistry;
        this.system2 = this.core.system2;
        this.combatAcademy = this.core.combatAcademy;
        this.extractor = this.core.extractor;

        // 2. Reflexes (Managed by ReflexSystem)
        this.reflexes = this.core.reflexSystem.reflexes;

        // Aliases for frequently accessed reflexes
        this.combatReflex = this.reflexes.combat;
        this.physics = this.core.reflexSystem.physics;
        this.hitSelector = this.core.reflexSystem.hitSelector;
        this.watchdog = this.reflexes.watchdog;
        this.selfPreservation = this.reflexes.selfPreservation;
        this.deathRecovery = this.reflexes.recovery;

        this.mentalSnapshot = new MentalSnapshot(this);
        // Physics/Replay instanced in ReflexSystem, but ReplayBuffer is separate?
        // Agent.js originally: this.replayBuffer = new ReplayBuffer(this);
        this.replayBuffer = new ReplayBuffer(this);

        this.swarm = new SwarmSync(this);
        this.pathfindingWorker = new PathfindingWorkerController(this);

        // Mission + Learning Runtime

        // Resource Locking - Uses AsyncMutex for Queued Control
        this.locks = {
            look: new AsyncMutex(),
            move: new AsyncMutex()
        };

        this.stateStack = new StateStack(this);
        this.utility = new UtilityEngine(this);
        this.flags = { critical_action: false, allow_reflex: true };

        // Circuit Breaker & Capability State
        this.errorCount = 0;
        this.lastErrorTime = 0;
        this.capabilities = {
            vision: false,
            memory_graph: false,
            skill_library: false,
            evolution: false
        };

        // Post-Init
        this.intelligence.initialPrompt = settings.initial_prompt;
        convoManager.initAgent(this);
        this.convoManager = convoManager;
        this.task = settings.task ? new Task(this, settings.task) : null;

        await this.prompter.initExamples();
        this.mentalSnapshot.load();

        let save_data = load_mem ? this.history.load() : null;
        // CRITICAL: Do NOT set isReady before bot and heavy subsystems are loaded!
        // await _connectToMinecraft will set isReady = true when ready
        await this._connectToMinecraft(save_data, init_message);
    }

    _loadCollaborationSettings() {
        const rawMode = String(this.config?.collaboration_mode || 'survival').toLowerCase().trim();
        const mode = ['survival', 'assist', 'collaborator'].includes(rawMode) ? rawMode : 'survival';
        const owner = String(this.config?.owner_username || '').trim();
        const teammates = Array.isArray(this.config?.teammate_agents)
            ? this.config.teammate_agents.map(v => String(v).trim()).filter(Boolean)
            : [];
        const obeyOwner = this.config?.obey_owner !== false;

        this.collaboration = {
            mode,
            owner,
            teammates,
            obeyOwner
        };

        ActionLogger.debug('collaboration_config_loaded', {
            mode,
            owner: owner || '(none)',
            teammates: teammates.length,
            obeyOwner
        });
    }

    _isOwner(source) {
        const owner = this.collaboration?.owner;
        if (!owner) return false;
        return String(source || '').toLowerCase() === owner.toLowerCase();
    }

    _normalizeAssistMessage(message) {
        return String(message || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    _isAssistAddressed(normalizedMessage) {
        if (!normalizedMessage) return false;
        const name = this._normalizeAssistMessage(this.name);
        if (normalizedMessage.includes('hey mindos') || normalizedMessage.includes('midos') || normalizedMessage.includes('mindos')) {
            return true;
        }
        if (name && normalizedMessage.includes(name)) {
            return true;
        }
        const assistKeywords = ['giup', 'help', 'lam dum', 'lam giup', 'assist'];
        return assistKeywords.some(k => normalizedMessage.includes(k));
    }

    _extractRequestedCount(normalizedMessage, fallback = 16) {
        const m = normalizedMessage.match(/\b(\d{1,3})\b/);
        if (!m) return fallback;
        const value = Number(m[1]);
        if (!Number.isFinite(value) || value <= 0) return fallback;
        return Math.min(value, 512);
    }

    _parseAssistRequest(message) {
        const normalized = this._normalizeAssistMessage(message);
        if (!normalized) return null;

        if (/(mode\s+assist|assist\s+on|bat\s+assist|mo\s+assist)/.test(normalized)) {
            return { kind: 'mode_switch', mode: 'assist' };
        }
        if (/(mode\s+survival|assist\s+off|tat\s+assist)/.test(normalized)) {
            return { kind: 'mode_switch', mode: 'survival' };
        }
        if (/(mode\s+collaborator|collab\s+on|team\s+on)/.test(normalized)) {
            return { kind: 'mode_switch', mode: 'collaborator' };
        }

        if (/(follow me|di theo toi|theo toi|theo tao)/.test(normalized)) {
            return { kind: 'follow_owner' };
        }

        if (/(come here|lai day|ve day|toi day)/.test(normalized)) {
            return { kind: 'go_to_owner' };
        }

        const count = this._extractRequestedCount(normalized, 16);
        const hasFetchVerb = /(lay|lấy|get|gather|farm|thu thap|collect|kiem|kiem cho|mang cho)/.test(normalized);
        const hasResourceWord = /(go|wood|log|stone|da|coal|than|sat|iron)/.test(normalized);
        const hasQuantity = /\b\d{1,3}\b/.test(normalized);
        if (!hasResourceWord || (!hasFetchVerb && !hasQuantity)) return null;

        const itemMap = [
            { id: 'oak_log', aliases: ['oak log', 'oak wood', 'go soi'] },
            { id: 'birch_log', aliases: ['birch log', 'go bach duong'] },
            { id: 'spruce_log', aliases: ['spruce log', 'go thong'] },
            { id: 'cobblestone', aliases: ['cobblestone', 'da cuoi', 'da', 'stone'] },
            { id: 'coal', aliases: ['coal', 'than'] },
            { id: 'iron_ore', aliases: ['iron ore', 'sat tho', 'quang sat'] }
        ];
        let item = null;
        for (const candidate of itemMap) {
            if (candidate.aliases.some(alias => normalized.includes(alias))) {
                item = candidate.id;
                break;
            }
        }
        if (!item && /(wood|log|go)/.test(normalized)) {
            item = 'any_log';
        }
        if (!item) return null;

        return {
            kind: 'fetch_item',
            item,
            count,
            normalized
        };
    }

    _buildAssistCode(request, ownerName) {
        const safeOwner = String(ownerName || '').replace(/[^a-zA-Z0-9_]/g, '') || ownerName || 'player';
        if (request.kind === 'follow_owner') {
            return `
if (skills.goToPlayer) {
  await skills.goToPlayer(bot, '${safeOwner}', 2);
}
`.trim();
        }
        if (request.kind === 'go_to_owner') {
            return `
if (skills.goToPlayer) {
  await skills.goToPlayer(bot, '${safeOwner}', 1);
}
`.trim();
        }

        if (request.kind !== 'fetch_item') return null;

        const itemLiteral = JSON.stringify(request.item);
        const countLiteral = Number(request.count) || 16;

        return `
await actions.eat_if_hungry({ threshold: 14, retries: 1 });
const LOG_ITEMS = ['oak_log','birch_log','spruce_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log'];
const targetCount = ${countLiteral};
const requested = ${itemLiteral};
const countItem = (name) => bot.inventory.items().filter(i => i.name === name).reduce((s, i) => s + i.count, 0);
const anyLogCount = () => LOG_ITEMS.reduce((s, n) => s + countItem(n), 0);
const pickRichestLog = () => {
  let best = null;
  let bestCount = 0;
  for (const name of LOG_ITEMS) {
    const c = countItem(name);
    if (c > bestCount) { best = name; bestCount = c; }
  }
  return best;
};
const itemCount = () => requested === 'any_log' ? anyLogCount() : countItem(requested);

let loops = 0;
while (itemCount() < targetCount && loops < 4) {
  loops++;
  if (requested === 'any_log' || requested.endsWith('_log')) {
    try {
      await skills.gather_wood(bot, {
        count: Math.min(6, targetCount - itemCount()),
        maxPerRun: 3,
        retries: 1,
        maxDistance: 72,
        maxRuntimeMs: 45000
      });
    } catch {}
    try {
      await actions.gather_nearby('log', Math.min(4, targetCount - itemCount()), {
        maxDistance: 64,
        retries: 1,
        moveRetries: 1,
        collectDrops: true,
        continueOnError: true
      });
    } catch {}
  } else if (requested === 'cobblestone') {
    try {
      await actions.gather_nearby('stone', Math.min(8, targetCount - itemCount()), {
        maxDistance: 56,
        retries: 1,
        moveRetries: 1,
        collectDrops: true,
        continueOnError: true
      });
    } catch {}
  } else if (requested === 'coal') {
    try {
      await skills.mine_ores(bot, { oreType: 'coal_ore', count: Math.min(6, targetCount - itemCount()), maxDistance: 56 });
    } catch {}
  } else if (requested === 'iron_ore') {
    try {
      await skills.mine_ores(bot, { oreType: 'iron_ore', count: Math.min(6, targetCount - itemCount()), maxDistance: 56 });
    } catch {}
  }
  try { await actions.collect_drops({ radius: 10, maxItems: 8, continueOnError: true }); } catch {}
}

let deliverItem = requested;
let available = itemCount();
if (requested === 'any_log') {
  deliverItem = pickRichestLog();
  available = deliverItem ? countItem(deliverItem) : 0;
}

if (deliverItem && available > 0 && skills.goToPlayer && skills.giveToPlayer) {
  try { await skills.goToPlayer(bot, '${safeOwner}', 3); } catch {}
  try { await skills.giveToPlayer(bot, deliverItem, '${safeOwner}', Math.min(available, targetCount)); } catch {}
}
`.trim();
    }

    async _handleAssistRequest(source, message) {
        const normalized = this._normalizeAssistMessage(message);
        const request = this._parseAssistRequest(message);
        if (!request) return false;

        if (request.kind === 'mode_switch') {
            const sourceIsOwner = this._isOwner(source);
            if (this.collaboration.owner && this.collaboration.obeyOwner && !sourceIsOwner) {
                await this.routeResponse(source, `Only owner ${this.collaboration.owner} can change collaboration mode.`);
                return true;
            }
            this.collaboration.mode = request.mode;
            await this.routeResponse(source, `Collaboration mode switched to ${request.mode}.`);
            sendThoughtToServer(this.name, `[COLLAB] mode=${request.mode} source=${source}`);
            return true;
        }

        const sourceIsOwner = this._isOwner(source);
        const addressed = this._isAssistAddressed(normalized);
        const shouldRunAssist =
            this.collaboration.mode === 'assist' ||
            this.collaboration.mode === 'collaborator' ||
            (addressed && sourceIsOwner) ||
            (addressed && !this.collaboration.owner);

        if (!shouldRunAssist) return false;

        if (addressed && this.collaboration.mode === 'survival') {
            if (sourceIsOwner || !this.collaboration.owner) {
                this.collaboration.mode = 'assist';
                sendThoughtToServer(this.name, `[COLLAB] auto-switching to assist mode for ${source}`);
            }
        }

        if (this.collaboration.owner && this.collaboration.obeyOwner && !sourceIsOwner) {
            await this.routeResponse(source, `Assist mode is reserved for owner ${this.collaboration.owner}.`);
            return true;
        }

        const ownerTarget = sourceIsOwner ? source : (this.collaboration.owner || source);
        const code = this._buildAssistCode(request, ownerTarget);
        if (!code) return false;

        sendThoughtToServer(this.name, `[ASSIST] ${request.kind} -> ${request.item || ownerTarget} x${request.count || ''}`);
        const result = await this.intelligence.execute(code);

        if (result?.success) {
            await this.routeResponse(source, `Assist task complete: ${request.kind}${request.item ? ` ${request.item}` : ''}.`);
        } else {
            const err =
                result?.executionError?.message ||
                result?.syntaxError ||
                result?.error ||
                'unknown error';
            await this.routeResponse(source, `Assist task failed: ${err}`);
        }
        return true;
    }

    async _maybeAnnounceCollaboratorMode() {
        if (this.collaboration.mode !== 'collaborator') return;
        const teammates = (this.collaboration.teammates || []).filter(n => n && n !== this.name);
        if (teammates.length === 0) return;

        for (const teammate of teammates) {
            if (!convoManager.isOtherAgent(teammate)) continue;
            try {
                const goal = this.config.profile?.objective || settings.objective || 'Beat Minecraft';
                await convoManager.tryInitiateConversation(
                    teammate,
                    `Team sync: let's collaborate on "${goal}". Share resources and keep each other alive.`
                );
            } catch (error) {
                console.warn(`[Collaborator] Failed to sync with ${teammate}:`, error.message);
            }
        }
    }




    /**
     * Internal helper to manage Minecraft connection and auto-reconnect
     */
    async _connectToMinecraft(save_data = null, init_message = null, attempt = 0) {
        if (!this.running) return;

        console.log(`${this.name} logging into minecraft(Attempt ${attempt + 1})...`);
        try {
            this.bot = initBot(this.name);
            this._disconnectHandled = false;
        } catch (err) {
            console.error(`${this.name} failed to init bot instance: `, err);
            this._handleReconnect(save_data, init_message, attempt);
            return;
        }

        this.bot.once('kicked', (reason) => this.handleSafeDisconnect('Kicked', reason, save_data, init_message, attempt));
        this.bot.once('end', (reason) => this.handleSafeDisconnect('Disconnected', reason, save_data, init_message, attempt));

        // Fix: Bind Arbiter now that bot exists
        if (this.arbiter) this.arbiter.bindBot(this.bot);

        this.bot.on('error', (err) => {
            log(this.name, `[LoginGuard] Connection Error: ${String(err)} `);
            if (String(err).includes('Duplicate') || String(err).includes('ECONNREFUSED')) {
                this.handleSafeDisconnect('Error', err, save_data, init_message, attempt);
            }
        });


        this.bot.on('login', () => {
            console.log(this.name, 'logged in!');
            serverProxy.login();
            if (this.prompter.profile.skin)
                this.bot.chat(`/ skin set URL ${this.prompter.profile.skin.model} ${this.prompter.profile.skin.path} `);
            else
                this.bot.chat(`/ skin clear`);
        });

        this.bot.once('spawn', async () => {
            try {
                if (!this.running) return;
                console.log(`[INIT] ${this.name} spawned. Stabilizing...`);

                // Phase 5: Safe Initialization
                this.core.connectBot(this.bot);

                await new Promise((resolve) => setTimeout(resolve, 2000));

                this.clearBotLogs();
                addBrowserViewer(this.bot, this.count_id);

                if (!this.world_id) this.world_id = randomUUID();

                // Memory is already initialized in Kernel bootloader (CoreSystem.js line 45)
                this.bus.emitSignal(SIGNAL.BOT_SPAWNED, {
                    name: this.name,
                    world_id: this.world_id
                });

                // CRITICAL: We await heavy subsystems BEFORE starting event listeners
                // to prevent race conditions (e.g. death event before DeathRecovery is ready)
                await this._initHeavySubsystems(this.count_id, !!save_data);

                this.startEvents();

                console.log('[INIT] Agent is online and listening. State: READY');
            } catch (error) {
                console.error('Error in spawn event:', error);
                this.handleSafeDisconnect('SpawnError', error, save_data, init_message, attempt);
            }
        });
    }

    _handleReconnect(save_data, init_message, attempt) {
        if (!this.running) return;
        this.state = BOT_STATE.BOOTING; // Reset state on reconnect
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff max 30s
        console.log(`[Reconnect] Retrying in ${delay / 1000}s...`);
        setTimeout(() => this._connectToMinecraft(save_data, init_message, attempt + 1), delay);
    }

    // Updated helper for safe disconnection logic with auto-reconnect
    async handleSafeDisconnect(type, reason, save_data, init_message, attempt) {
        if (this._disconnectHandled) return;
        this._disconnectHandled = true;
        this.state = BOT_STATE.ERROR;

        const { msg } = handleDisconnection(this.name, reason);
        console.log(`[SafeDisconnect] ${this.name} (${type}): ${msg} `);

        // [Arch Fix] Full cleanup before reconnect
        await this.clean();

        this._handleReconnect(save_data, init_message, attempt);
    }

    // ... (existing imports)

    /**
     * Phase 3: Initialize heavy AI subsystems in background
     * This runs via TaskScheduler to avoid blocking main thread
     */
    async _initHeavySubsystems(count_id, load_mem) {
        console.log('[INIT] ⏳ Starting heavy subsystems initialization...');

        // Phase 1: Initialize Knowledge Store (Manifest & Docs)
        try {
            this.knowledge = new KnowledgeStore(this);
            await Promise.resolve(this.knowledge.init()); // Ensure completion
        } catch (err) {
            console.error('[INIT] ❌ KnowledgeStore initialization failed:', err);
        }

        // Phase 2: Vision Interpreter (heavy - uses canvas)
        if (settings.allow_vision) {
            try {
                console.log('[INIT] Loading VisionInterpreter...');
                this.vision_interpreter = new VisionInterpreter(this, true);
                this.capabilities.vision = true;
                console.log('[INIT] ✓ VisionInterpreter loaded');
            } catch (err) {
                console.warn('[INIT] ⚠ VisionInterpreter failed:', err.message);
            }
        }

        // Phase 3: Environment Monitor (Proactive Perception)
        try {
            this.envMonitor = new EnvironmentMonitor(this);
            this.envMonitor.start(); // Auto-starts background scanning
            console.log('[INIT] ✓ EnvironmentMonitor started');
        } catch (err) {
            console.warn('[INIT] ⚠ EnvironmentMonitor failed:', err.message);
        }

        // Phase 4: Player Training Mode
        try {
            this.playerTraining = new PlayerTrainingMode(this);
            console.log('[INIT] ✓ PlayerTrainingMode loaded');
        } catch (err) {
            console.warn('[INIT] ⚠ PlayerTrainingMode failed:', err.message);
        }

        // Phase 5: Adventure Logger
        try {
            this.adventureLogger = new AdventureLogger(this, {
                enabled: this.config?.enable_adventure_log !== false
            });
            await this.adventureLogger.initialize();
            console.log('[INIT] ✓ AdventureLogger initialized');
        } catch (err) {
            console.warn('[INIT] ⚠ AdventureLogger failed:', err.message);
        }

        // CRITICAL: Phase 6-8 MUST be sequential due to dependencies
        // These systems depend on each other and must complete in order
        try {
            const cogneeServiceUrl = settings.cognee_service_url || 'http://localhost:8001';

            // Step 6a: Initialize Cognee Memory Bridge first (required by brain)
            console.log('[INIT] 📡 Initializing Cognee Memory Bridge...');
            await RetryHelper.retry(async () => {
                this.cogneeMemory = new CogneeMemoryBridge(this, cogneeServiceUrl);
                await this.cogneeMemory.init();
                this.capabilities.memory_graph = true;
            }, { context: 'CogneeInit', maxRetries: 3 });
            console.log('[INIT] ✓ Cognee Memory Bridge initialized');

        } catch (err) {
            console.warn('[INIT] ⚠ Cognee Memory unavailable. Continuing with local memory only.');
            this.cogneeMemory = null;
        }

        // Step 6b: Initialize SkillLibrary (required by brain)
        try {
            console.log('[INIT] 📚 Initializing SkillLibrary...');
            this.skillLibrary = new SkillLibrary();
            await this.skillLibrary.init();
            this.capabilities.skill_library = true;
            console.log('[INIT] ✓ SkillLibrary initialized');
        } catch (err) {
            console.warn('[INIT] ⚠ SkillLibrary failed. Continuing without skills.');
            this.skillLibrary = null;
        }

        // Step 6c: Initialize SkillOptimizer (if SkillLibrary succeeded)
        if (this.skillLibrary) {
            try {
                this.skillOptimizer = new SkillOptimizer(this, this.skillLibrary);
                this.skillLibrary.setOptimizer(this.skillOptimizer);
                console.log('[INIT] ✓ SkillOptimizer linked');
            } catch (err) {
                console.warn('[INIT] ⚠ SkillOptimizer failed:', err.message);
            }
        }

        // Step 6d: Tool Registry Discovery (if SkillLibrary succeeded)
        try {
            if (this.toolRegistry) {
                console.log('[INIT] 🔧 Discovering tools...');
                await this.toolRegistry.discoverSkills();
                console.log('[INIT] ✓ ToolRegistry discovered skills');
            }
        } catch (err) {
            console.warn('[INIT] ⚠ ToolRegistry discovery failed:', err.message);
        }

        // Step 7: Tool Creator Engine
        try {
            this.toolCreator = new ToolCreatorEngine(this);
            console.log('[INIT] ✓ ToolCreatorEngine initialized');
        } catch (err) {
            console.warn('[INIT] ⚠ ToolCreatorEngine failed:', err.message);
        }

        // Step 8: Instruction Learner
        try {
            this.instructionLearner = new ChatInstructionLearner(this);
            console.log('[INIT] ✓ ChatInstructionLearner initialized');
        } catch (err) {
            console.warn('[INIT] ⚠ ChatInstructionLearner failed:', err.message);
        }

        // CRITICAL: Initialize UnifiedBrain AFTER all dependencies are ready
        // Brain depends on: cogneeMemory, skillLibrary, prompter
        try {
            console.log('[INIT] 🧠 Initializing UnifiedBrain...');
            if (!this.brain) {
                this.brain = new UnifiedBrain(
                    this,
                    this.prompter,
                    this.cogneeMemory || null,
                    this.skillLibrary || null
                );
                console.log('[INIT] ✓ UnifiedBrain initialized');
            }
        } catch (err) {
            console.error('[INIT] ❌ Failed to initialize UnifiedBrain:', err.message);
            throw err; // Critical failure - cannot continue
        }

        // Dreamer (VectorDB) - With proper error handling
        // Dreamer (VectorDB) - With proper error handling
        if (settings.allow_dreamer) {
            try {
                // Lazy load Dreamer here if not already loaded
                if (!this.dreamer) {
                    const { Dreamer } = await import('./Dreamer.js');
                    this.dreamer = new Dreamer(this);
                }
                await RetryHelper.retry(() => this.dreamer.init(), { context: 'DreamerInit', maxRetries: 2 });
                console.log('[INIT] ✓ Dreamer initialized');
            } catch (err) {
                console.warn('[INIT] ⚠ Dreamer init failed:', err.message);
            }
        }

        // Task initialization - With proper error handling
        if (!load_mem) {
            if (this.task) {
                try {
                    await this.task.initBotTask();
                    await this.task.setAgentGoal();
                } catch (err) {
                    console.warn('[INIT] ⚠ Task initialization failed:', err.message);
                }
            }
        } else {
            if (this.task) {
                try {
                    await this.task.setAgentGoal();
                } catch (err) {
                    console.warn('[INIT] ⚠ Task goal setting failed:', err.message);
                }
            }
        }

        // Wait a bit then check players
        await new Promise((resolve) => setTimeout(resolve, 8000));
        if (this.running) this.checkAllPlayersPresent();

        // Initialize Reflexes
        // Fix: Do not re-instantiate. Use existing instances from ReflexSystem.
        if (this.watchdog) {
            this.watchdog.start();
        } else {
            console.warn('[Agent] Watchdog not found in reflexes!');
        }
        await this.deathRecovery.onSpawn();

        // Initialize Mission Director (Autonomous Brain)
        try {
            // cleanup old instance ifexists
            if (this.missionDirector) {
                this.missionDirector.stop();
            }
            this.missionDirector = new MissionDirector(this);
            this.missionDirector.init();
            console.log('[INIT] MissionDirector instantiated.');
        } catch (err) {
            console.error('[INIT] Failed to instantiate MissionDirector:', err);
        }

        console.log('[INIT] ✅ All heavy subsystems initialized.');

        // CRITICAL: Mark as ready ONLY after all subsystems are initialized
        this.isReady = true;
        this.state = BOT_STATE.READY;
        if (this.swarm) this.swarm.startHeartbeat();
        if (this.missionDirector) this.missionDirector.start();
        console.log('[INIT] System Ready Triggered (Gate Open).');
    }

    async _setupEventHandlers(save_data, init_message) {
        const respondFunc = async (username, message) => {
            if (!this.running) return;

            // Phase 3: Safe Startup Sequence
            // Gatekeep Events
            if (this.state !== BOT_STATE.READY) {
                console.debug(`[Agent] Ignored message from ${username}: System state is ${this.state} (Not Ready).`);
                return;
            }

            if (message === "") return;
            if (username === this.name) return;
            if (settings.only_chat_with.length > 0 && !settings.only_chat_with.includes(username)) return;

            try {
                // Priority: Profile Only (Settings deprecated)
                const ignoreMsgs = this.prompter.profile.ignore_messages || [];
                if (ignoreMsgs.some((m) => message.startsWith(m))) return;

                this.shut_up = false;
                console.log(this.name, 'received message from', username, ':', message);

                // Task 6: Auto-store player interactions to Cognee (Hardened with Retry)
                if (this.capabilities.memory_graph && this.world_id) {
                    const interaction = `Player ${username} said: "${message}"`;
                    RetryHelper.retry(async () => {
                        await this.cogneeMemory.storeExperience(this.world_id, [interaction], {
                            type: 'player_interaction',
                            timestamp: Date.now(),
                            player: username
                        });
                    }, { context: 'StoreInteraction', maxRetries: 2 }).catch(err => {
                        console.error('[Critical] Failed to store interaction after retries:', err.message);
                        // Optional: Add to a persistent disk queue if DB is down
                    });
                }

                if (convoManager.isOtherAgent(username)) {
                    console.warn('received whisper from other bot??')
                }
                else {
                    // REFACTORED: Call handleMessage immediately with RAW message.
                    await this.handleMessage(username, message);
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        }

        this.bot.on('whisper', (u, m) => this._onWhisper(u, m));
        this.bot.on('chat', (u, m) => this._onChat(u, m));

        // Set up auto-eat (Prefer profile settings)
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: this.config.profile?.behavior?.auto_eat_start || 14,
            bannedFood: this.config.profile?.behavior?.banned_food || []
        };

        try {
            if (save_data?.self_prompt) {
                if (init_message) {
                    this.history.add('system', init_message);
                }
                await this.self_prompter.handleLoad(save_data.self_prompt, save_data.self_prompting_state);
            }
            if (save_data?.last_sender) {
                this.last_sender = save_data.last_sender;
                if (convoManager.otherAgentInGame(this.last_sender)) {
                    const msg_package = {
                        message: `You have restarted and this message is auto - generated.Continue the conversation with me.`,
                        start: true
                    };
                    convoManager.receiveFromBot(this.last_sender, msg_package);
                }
            }
            else if (init_message) {
                await this.handleMessage('system', init_message, 2);
            }
            else {
                this.openChat("Hello world! I am " + this.name);
            }
        } catch (err) {
            console.error("Error loading save_data/init_message:", err);
        }

        setTimeout(() => {
            if (this.running) {
                void this._maybeAnnounceCollaboratorMode();
            }
        }, 3000);
    }

    checkAllPlayersPresent() {
        if (!this.task || !this.task.agent_names) {
            return;
        }

        const missingPlayers = this.task.agent_names.filter(name => !this.bot.players[name]);
        if (missingPlayers.length > 0) {
            console.log(`Missing players / bots: ${missingPlayers.join(', ')} `);
            this.shutdown('Not all required players/bots are present in the world.');
        }
    }

    requestInterrupt() {
        if (!this.bot) return;
        this.bot.interrupt_code = true;
        if (this.bot.stopDigging) this.bot.stopDigging();
        if (this.bot.collectBlock) this.bot.collectBlock.cancelTask();
        if (this.bot.pathfinder) this.bot.pathfinder.stop();
        if (this.bot.pvp) this.bot.pvp.stop();
    }

    clearBotLogs() {
        if (this.bot) {
            this.bot.output = '';
            this.bot.interrupt_code = false;
        }
    }

    shutUp() {
        this.shut_up = true;
        if (this.self_prompter.isActive()) {
            this.self_prompter.stop(false);
        }
        convoManager.endAllConversations();
    }
    // MAIN REFACTOR: Correct Message Logic & DUAL BRAIN Integration
    async handleMessage(source, message, max_responses = null) {
        if (!this.running) return false;
        await this.checkTaskDone();

        if (!source || !message) {
            console.warn('Received empty message from', source);
            return false;
        }

        if (
            source !== 'system' &&
            source !== this.name &&
            this.chatInstructionLearner &&
            !convoManager.isOtherAgent(source)
        ) {
            try {
                this.chatInstructionLearner.handleChatMessage(source, message);
            } catch (error) {
                console.warn(`[Agent] Chat instruction learner failed: ${error.message}`);
            }
        }

        if (await this._handleAssistRequest(source, message)) {
            return true;
        }

        // Phase 8: Command Locking
        // Check if agent is locked by critical system (e.g. Combat)
        if (await this.locks.move.acquire('user_command', 100)) { // 100ms wait
            // Acquired! But we must release it immediately because this is just a CHECK.
            // Commands should be allowed to process logic, but execution will re-acquire.
            this.locks.move.release('user_command');
        } else {
            // Failed to acquire (Held by combat)
            const owner = this.locks.move.getOwner();
            if (owner === 'combat') {
                this.routeResponse(source, `I am busy fighting! Cannot execute commands right now.`);
                return false;
            }
        }

        // UNIFIED BRAIN CONTROL LOOP
        // Safety check: Brain must be initialized
        if (!this.brain) {
            console.warn(`[Agent] Brain not initialized. Cannot process message from ${source}.`);
            this.routeResponse(source, `[System Error] Brain not initialized. Please try again later.`);
            return false;
        }

        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source);

        // 1. PROCESS INPUT (Brain Decides)
        sendSystem2TraceToServer(this.name, {
            phase: 'plan',
            stage: 'start',
            message: `Processing input from ${source}`,
            meta: { selfPrompt: self_prompt, fromOtherBot: from_other_bot }
        });
        const history = this.history.getHistory();
        const processResult = await this.brain.process(message, history, {
            is_chat: !self_prompt, // If self-prompt, it's NOT simple chat, it's planning
            self_prompt: self_prompt,
            source: source
        });
        sendSystem2TraceToServer(this.name, {
            phase: 'plan',
            stage: 'result',
            message: `Brain returned type=${processResult.type}`,
            meta: { hasPlan: Boolean(processResult.plan) }
        });

        // 2. UPDATE HISTORY (Move before early returns)
        if (processResult.input && processResult.input !== message) {
            console.log('Processed message from', source, ':', processResult.input);
        }
        await this.history.add(source, processResult.input);
        this.history.save();

        if (processResult.type === 'command') {
            return true;
        }

        // 3. HANDLE RESPONSE
        const response = typeof processResult.result === 'string' ? processResult.result : '';
        if (!response && processResult.type !== 'plan') return false;

        // Add Bot Response to History when non-empty.
        if (response) {
            this.history.add(this.name, response);
            if (!self_prompt || this._shouldEmitSelfPromptChat(response)) {
                this.routeResponse(source, response);
            }
            this.history.save();
        }

        // 4. AUTONOMOUS LOOP (Planning Mode)
        // If type was 'plan', we might want to continue thinking/acting
        if (processResult.type === 'plan') {
            sendSystem2TraceToServer(this.name, {
                phase: 'critic',
                stage: 'start',
                message: 'Runtime guard review (loop guard + sanitizer) is active'
            });
            // Setup Loop Variables
            if (max_responses === null) max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
            if (max_responses === -1) max_responses = Infinity;

            const checkInterrupt = () => (this.self_prompter ? this.self_prompter.shouldInterrupt(self_prompt) : false) || this.shut_up || convoManager.responseScheduledFor(source);
            const requestId = randomUUID();
            this.latestRequestId = requestId;

            // Execute the plan already produced by brain.process first.
            let planObj = processResult.plan || null;
            for (let i = 0; i < max_responses; i++) {
                if (checkInterrupt()) break;
                if (this.latestRequestId !== requestId) break;
                if (this.brain && typeof this.brain.isProviderDegraded === 'function' && this.brain.isProviderDegraded()) {
                    console.warn('[Agent] Brain provider is degraded. Skipping follow-up plan loop.');
                    break;
                }

                // Plan next step only after consuming the initial process plan.
                if (i > 0 || !planObj) {
                    planObj = await this.brain.plan(this.history.getHistory());
                }
                if (!planObj) break;
                sendSystem2TraceToServer(this.name, {
                    phase: 'plan',
                    stage: 'ready',
                    message: `Plan step prepared (${i + 1})`,
                    meta: { hasTask: Boolean(planObj.task), hasThought: Boolean(planObj.thought) }
                });

                // 1. Process Thought (Monologue)
                if (planObj.thought) {
                    console.log(`[Thought] ${planObj.thought}`);
                    sendThoughtToServer(this.name, planObj.thought);
                }

                // 2. Process Chat (Public Output)
                // Skip duplicate chat for i=0 because processResult.result was already routed above.
                if (planObj.chat && i > 0) {
                    this.history.add(this.name, planObj.chat);
                    if (!self_prompt || this._shouldEmitSelfPromptChat(planObj.chat)) {
                        this.routeResponse(source, planObj.chat);
                    }
                }

                // 3. Execute Task (The "Body" Connection)
                if (planObj.task) {
                    planObj.task = this._diversifyRepeatedTask(planObj.task, self_prompt);
                    planObj.task = this._sanitizeTaskForRuntime(planObj.task);
                    console.log(`[Agent] Received Task: ${planObj.task.type}`);
                    sendSystem2TraceToServer(this.name, {
                        phase: 'execute',
                        stage: 'start',
                        message: `Executing task type=${planObj.task.type}`
                    });

                    if (planObj.task.type === 'code' && planObj.task.content) {
                        try {
                            // Execute via CodeEngine (which now has Sanitizer!)
                            console.log('[Agent] Executing Code Task...');
                            const execResult = await this.intelligence.execute(planObj.task.content);

                            if (execResult.success) {
                                const successDetail = execResult.summary || execResult.result || 'completed';
                                this.history.add('system', `Code Execution Success: ${successDetail}`);
                                sendSystem2TraceToServer(this.name, {
                                    phase: 'execute',
                                    stage: 'success',
                                    message: 'Code task executed successfully'
                                });
                            } else {
                                const failDetail =
                                    execResult.executionError?.message ||
                                    execResult.syntaxError ||
                                    execResult.error ||
                                    execResult.codeOutput ||
                                    'unknown';
                                this.history.add('system', `Code Execution Failed: ${failDetail}`);
                                sendSystem2TraceToServer(this.name, {
                                    phase: 'execute',
                                    stage: 'failed',
                                    message: `Code task failed: ${failDetail}`
                                });
                            }
                        } catch (err) {
                            console.error('[Agent] Task Execution Error:', err);
                            this.history.add('system', `Task Error: ${err.message}`);
                            sendSystem2TraceToServer(this.name, {
                                phase: 'execute',
                                stage: 'error',
                                message: `Task execution error: ${err.message}`
                            });
                        }
                    }
                } else {
                    sendSystem2TraceToServer(this.name, {
                        phase: 'execute',
                        stage: 'skipped',
                        message: 'No task to execute for this plan step'
                    });
                }

                // Break after one plan step to allow re-evaluation (and prevent infinite loops)
                break;
            }
        }

        return response || (processResult.type === 'plan' ? '[AUTONOMOUS_STEP]' : false);
    }

    async routeResponse(to_player, message) {
        if (this.shut_up) return;
        let self_prompt = to_player === 'system' || to_player === this.name;
        if (self_prompt && this.last_sender) {
            to_player = this.last_sender;
        }

        if (convoManager.isOtherAgent(to_player) && convoManager.inConversation(to_player)) {
            convoManager.sendToBot(to_player, message);
        }
        else {
            this.openChat(message);
        }
    }

    _shouldEmitSelfPromptChat(message) {
        if (!message || typeof message !== 'string') return false;

        const normalized = message
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        // Suppress noisy autonomous question loops.
        const banPhrases = [
            'what kind of house',
            'what type of house',
            'do you want me to build',
            'starting my journey',
            'journey to beat minecraft',
            'logical progression',
            'systematic progression',
            'progression toward beating minecraft'
        ];
        if (normalized.includes('?') || banPhrases.some(p => normalized.includes(p))) {
            return false;
        }
        if (normalized.length > 120 || normalized.includes('beat minecraft')) {
            return false;
        }

        const now = Date.now();
        if (!this._selfPromptChatState) {
            this._selfPromptChatState = { last: '', at: 0, lastDangerAt: 0 };
        }

        const isDangerLoopMessage =
            normalized.includes('finding shelter') ||
            normalized.includes('hostile mobs') ||
            normalized.includes('emergency') ||
            normalized.includes('urgent');
        if (isDangerLoopMessage && now - this._selfPromptChatState.lastDangerAt < 60000) {
            return false;
        }
        if (isDangerLoopMessage) {
            this._selfPromptChatState.lastDangerAt = now;
        }

        if (normalized === this._selfPromptChatState.last && now - this._selfPromptChatState.at < 30000) {
            return false;
        }

        if (now - this._selfPromptChatState.at < 15000) {
            return false;
        }

        this._selfPromptChatState.last = normalized;
        this._selfPromptChatState.at = now;
        return true;
    }

    _diversifyRepeatedTask(task, self_prompt) {
        if (!self_prompt || !task || task.type !== 'code' || !task.content) {
            return task;
        }

        const signature = String(task.content).replace(/\s+/g, ' ').trim().slice(0, 240);
        const semantic =
            signature.includes('find_shelter') ? 'find_shelter' :
                signature.includes('gather_wood') ? 'gather_wood' :
                    signature.includes('craft_items') ? 'craft_items' :
                        signature.includes('mine_ores') ? 'mine_ores' :
                            signature.includes('ensure_item') ? 'ensure_item' :
                                signature;
        if (!this._taskLoopGuard) {
            this._taskLoopGuard = { last: '', count: 0 };
        }

        if (this._taskLoopGuard.last === semantic) {
            this._taskLoopGuard.count++;
        } else {
            this._taskLoopGuard.last = semantic;
            this._taskLoopGuard.count = 0;
        }

        if (this._taskLoopGuard.count < 1) {
            return task;
        }

        this._taskLoopGuard.count = 0;
        this._taskLoopGuard.last = '';
        this.history.add('system', 'Loop guard: switching to deterministic recovery action.');

        return {
            type: 'code',
            content: `
await actions.eat_if_hungry({ threshold: 16, retries: 1 });
const inv = bot.inventory.items();
const logCount = inv
  .filter(i => i.name.includes('_log') || i.name.endsWith('_stem') || i.name.endsWith('_hyphae'))
  .reduce((s, i) => s + i.count, 0);
const plankCount = inv
  .filter(i => i.name.includes('_planks'))
  .reduce((s, i) => s + i.count, 0);
const isNight = bot.time.timeOfDay > 13000 && bot.time.timeOfDay < 23000;
const recentShelter = bot._lastShelterState &&
  Math.abs(bot.entity.position.x - bot._lastShelterState.x) < 3 &&
  Math.abs(bot.entity.position.y - bot._lastShelterState.y) < 3 &&
  Math.abs(bot.entity.position.z - bot._lastShelterState.z) < 3 &&
  (Date.now() - bot._lastShelterState.ts) < 45000;

if (isNight) {
  if (recentShelter) {
    if (logCount + plankCount > 0) {
      try {
        await actions.craft_first_available(
          ['oak_planks','birch_planks','spruce_planks','jungle_planks','acacia_planks','dark_oak_planks','mangrove_planks','cherry_planks','bamboo_planks'],
          8,
          { retries: 1 }
        );
      } catch {}
      try { await actions.ensure_item('stick', 4, { retries: 1 }); } catch {}
    } else {
      try {
        await actions.gather_nearby('log', 1, {
          maxDistance: 28,
          retries: 1,
          moveRetries: 1,
          collectDrops: true,
          continueOnError: true
        });
      } catch {}
    }
  } else {
    try { await skills.find_shelter(bot, { retries: 1 }); } catch {}
  }
  await actions.collect_drops({ radius: 8, maxItems: 2, continueOnError: true });
  return;
}

if (logCount + plankCount < 10) {
  try {
    await actions.gather_nearby('log', 2, {
      maxDistance: 32,
      retries: 1,
      moveRetries: 1,
      collectDrops: true,
      continueOnError: true
    });
  } catch {}

  const afterLogs = bot.inventory.items()
    .filter(i => i.name.includes('_log') || i.name.endsWith('_stem') || i.name.endsWith('_hyphae'))
    .reduce((s, i) => s + i.count, 0);

  if (afterLogs <= logCount) {
    const p = bot.entity.position.floored();
    const dirs = [[6,0],[-6,0],[0,6],[0,-6]];
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    try {
      await actions.move_to({ x: p.x + d[0], y: p.y, z: p.z + d[1] }, { minDistance: 2, retries: 0, timeoutMs: 12000 });
    } catch {}
    try {
      await skills.gather_wood(bot, { count: 3, maxPerRun: 2, retries: 1, maxDistance: 48, maxRuntimeMs: 30000 });
    } catch {}
  }
} else {
  try {
    await actions.craft_first_available(
      ['oak_planks','birch_planks','spruce_planks','jungle_planks','acacia_planks','dark_oak_planks','mangrove_planks','cherry_planks','bamboo_planks'],
      8,
      { retries: 1 }
    );
  } catch {}
  try { await actions.ensure_item('crafting_table', 1, { retries: 1 }); } catch {}
  try { await actions.ensure_item('stick', 4, { retries: 1 }); } catch {}
}
await actions.collect_drops({ radius: 8, maxItems: 4, continueOnError: true });
`.trim()
        };
    }

    _sanitizeTaskForRuntime(task) {
        if (!task || task.type !== 'code' || !task.content) {
            return task;
        }

        const code = String(task.content);
        const normalized = code.toLowerCase();
        const unsupportedPatterns = [
            'movement_skills',
            'world.inspect',
            'world.inspectblocks',
            'world.findnearby',
            'goalxz',
            'moverandomly',
            'skills.movement_skills'
        ];
        const hasUnsupportedPattern = unsupportedPatterns.some(pattern => normalized.includes(pattern));
        const hasBrokenGatherResourceUsage =
            normalized.includes('gather_resources') &&
            (normalized.includes('oak_log') ||
                normalized.includes('resource: undefined') ||
                normalized.includes('resource:undefined'));
        const hasBrokenCraftItemsUsage =
            normalized.includes('craft_items') &&
            (normalized.includes('item: undefined') ||
                normalized.includes('item:undefined') ||
                normalized.includes('item: \"undefined\"') ||
                normalized.includes("item: 'undefined'"));

        if (!hasUnsupportedPattern && !hasBrokenGatherResourceUsage && !hasBrokenCraftItemsUsage) {
            return task;
        }

        if (hasBrokenCraftItemsUsage) {
            this.history.add('system', 'Task sanitizer: replaced broken craft_items call with deterministic crafting fallback.');
            return {
                type: 'code',
                content: `
await actions.eat_if_hungry({ threshold: 16, retries: 1 });
try {
  await actions.craft_first_available(
    ['oak_planks','birch_planks','spruce_planks','jungle_planks','acacia_planks','dark_oak_planks','mangrove_planks','cherry_planks','bamboo_planks'],
    4,
    { retries: 1 }
  );
} catch {}
try { await actions.ensure_item('crafting_table', 1, { retries: 1 }); } catch {}
try { await actions.ensure_item('stick', 4, { retries: 1 }); } catch {}
await actions.collect_drops({ radius: 8, maxItems: 4, continueOnError: true });
`.trim()
            };
        }

        this.history.add('system', 'Task sanitizer: replaced unsupported API pattern with deterministic resource-scout task.');

        return {
            type: 'code',
            content: `
await actions.eat_if_hungry({ threshold: 16, retries: 1 });
const base = bot.entity.position.floored();
const probes = [[12,0],[-12,0],[0,12],[0,-12],[18,18],[-18,18],[18,-18],[-18,-18]];
let gathered = 0;
for (const [dx, dz] of probes) {
  try {
    await actions.move_to(
      { x: base.x + dx, y: base.y, z: base.z + dz },
      { minDistance: 2, retries: 0, timeoutMs: 14000 }
    );
  } catch {}

  try {
    const run = await skills.gather_wood(bot, { count: 3, maxPerRun: 2, retries: 1, maxDistance: 56, maxRuntimeMs: 30000 });
    if (run && run.gathered > 0) {
      gathered += run.gathered;
      break;
    }
  } catch {}

  try {
    const quick = await actions.gather_nearby('log', 2, {
      maxDistance: 40,
      retries: 1,
      moveRetries: 1,
      collectDrops: true,
      continueOnError: true
    });
    if (quick && quick.gathered > 0) {
      gathered += quick.gathered;
      break;
    }
  } catch {}
}
if (gathered <= 0) {
  try { await skills.gather_resources(bot, { resource: 'wood', count: 2, maxDistance: 56 }); } catch {}
}
await actions.collect_drops({ radius: 8, maxItems: 4, continueOnError: true });
`.trim()
        };
    }

    async openChat(message) {
        // ... (Translation logic same as before) ...
        let to_translate = message;

        let finalMessage = message;
        try {
            const translationRes = await handleTranslation(to_translate);
            if (translationRes && typeof translationRes === 'string') {
                finalMessage = translationRes.trim();
            }
        } catch (err) {
            console.warn('Translation failed, using original:', err);
        }

        if (typeof finalMessage === 'string') {
            finalMessage = finalMessage.replaceAll('\n', ' ');
        } else {
            finalMessage = String(finalMessage).replaceAll('\n', ' ');
        }

        if (settings.only_chat_with.length > 0) {
            for (let username of settings.only_chat_with) {
                this.bot.whisper(username, finalMessage);
            }
        }
        else {
            if (settings.speak) {
                speak(to_translate, this.prompter.profile.speak_model);
            }
            if (settings.chat_ingame) { this.bot.chat(finalMessage); }
            sendOutputToServer(this.name, finalMessage);
        }
    }

    startEvents() {
        // ... (Events same as before) ...
        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0) {
                this.bot.emit('sunrise');
                if (this.adventureLogger) {
                    void this.adventureLogger.onSunrise();
                }
            }
            else if (this.bot.time.timeOfDay == 6000) this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000) this.bot.emit('sunset');
            else if (this.bot.time.timeOfDay == 18000) this.bot.emit('midnight');
        });

        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });

        // Phase 3: Gladiator Combat Reflex
        this.bot.on('entityHurt', (entity) => {
            if (entity === this.bot.entity) {
                // Phase 3: Full combat reflex activation
                if (this.combatReflex) {
                    const attacker = this.combatReflex.findAttacker();
                    if (attacker) {
                        this.combatReflex.enterCombat(attacker);
                    }
                }

                // Legacy: Also push to stateStack for other systems
                if (this.stateStack && !this.stateStack.has('combat')) {
                    const priority = this.utility.calculatePriority('combat');
                    this.stateStack.push('combat', priority, { target: null, reason: 'self_defense' });
                    console.log(`!!! ATTACKED -> TRIGGERING COMBAT STATE (P:${priority}) !!!`);
                }
            }
        });

        // Task: Automatic Memory Hooks (Hardening)
        this.bot.on('playerCollect', (collector, item) => {
            if (collector === this.bot.entity) {
                this.memory.absorb('experience', {
                    facts: [`I collected ${item.count} ${item.name} `],
                    metadata: { type: 'collection', timestamp: Date.now() }
                });
            }
        });

        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();

            // Phase 3: Emit Death Signal for Evolution
            globalBus.emitSignal(SIGNAL.DEATH, {
                position: this.bot.entity.position,
                timestamp: Date.now()
            });

            this.memory.absorb('experience', {
                facts: [`I died at ${this.bot.entity.position} `],
                metadata: { type: 'death', timestamp: Date.now() }
            });
        });

        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                let death_pos = this.bot.entity.position;
                this.memory.setPlace('last_death_position', {
                    x: death_pos.x,
                    y: death_pos.y,
                    z: death_pos.z
                });
                let death_pos_text = null;
                if (death_pos) {
                    death_pos_text = `x: ${death_pos.x.toFixed(2)}, y: ${death_pos.y.toFixed(2)}, z: ${death_pos.x.toFixed(2)} `;
                }
                let dimention = this.bot.game.dimension;

                // Task 6: Auto-store death events to Cognee (Hardened with Retry)
                if (this.capabilities.memory_graph && this.world_id) {
                    const deathFact = `Died at ${death_pos_text || "unknown"} in ${dimention} dimension. Cause: ${message}`;
                    RetryHelper.retry(async () => {
                        await this.cogneeMemory.storeExperience(this.world_id, [deathFact], {
                            type: 'death_event',
                            timestamp: Date.now(),
                            position: death_pos,
                            dimension: dimention,
                            cause: message
                        });
                    }, { context: 'StoreDeathEvent', maxRetries: 3 }).catch(err => {
                        console.error('[Critical] Failed to store death event after retries:', err.message);
                    });
                }

                // Task 6: Auto-store death events to Cognee
                // ... (Existing Cognee logic) ...

                // Task 16: Trigger Death Reflex Recording
                if (this.deathRecovery) {
                    this.deathRecovery.onDeath(message);
                }

                this.handleMessage('system', `You died at position ${death_pos_text || "unknown"} in the ${dimention} dimension with the final message: '${message}'.Your place of death is saved as 'last_death_position' if you want to return.Previous actions were stopped and you have respawned.`);
            }
        });

        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            if (this.bot.pathfinder) this.bot.pathfinder.stop();
            if (this.bot.modes) this.bot.modes.unPauseAll();
            setTimeout(() => {
                if (this.isReady && this.isIdle() && typeof this.actions.resumeAction === 'function') {
                    this.actions.resumeAction();
                }
            }, 1000);
        });

        // this.npc.init(); // REMOVED: Legacy dead code

        this.bot.emit('idle');

        // REFACTORED: Adaptive Heartbeat (Phase 7)
        // Replaces legacy loop with Dynamic Event-Driven Heartbeat
        let lastTick = Date.now();
        this.heartbeatInterval = 1000; // Start with standard 1s

        this.bot.on('physicsTick', async () => {
            const now = Date.now();

            // Phase 7: Dynamic Polling Rate
            // Combat/Danger -> 50ms (Every tick)
            // Active -> 1000ms
            // Idle -> 5000ms

            const inCombat = this.bot.pvp && this.bot.pvp.target;
            const targetInterval = inCombat ? 50 : (this.isIdle() ? 5000 : 1000);

            // Smooth transition? No, instant snap is better for reaction.
            this.heartbeatInterval = targetInterval;

            if (now - lastTick < this.heartbeatInterval) return;
            lastTick = now;

            if (!this.running) return;

            try {
                // Phase 3: Reflex Update (High Frequency - 50ms)
                // Phase 3: Reflex Update (High Frequency - 50ms)
                // Note: CombatReflex is also ticked in update(), but we removed update().
                // So include it here.
                if (this.combatReflex) this.combatReflex.tick();
                if (this.selfPreservation) await this.selfPreservation.tick();

                // Throttle Brain Update (1-2s)
                if (now - (this.lastBrainUpdate || 0) > 2000) {
                    this.lastBrainUpdate = now;

                    // 1. Brain Update (State Stack)
                    // Fix: UnifiedBrain does not have update(). It uses process() via handleMessage.
                    // Removed await this.brain.update(now - lastTick);

                    if (this.social) {
                        // this._territorialUpdate(); // Handled by separate trigger or social engine
                    }
                }
            } catch (err) {
                console.error('[Agent] Heartbeat error:', err);
                this.errorCount++;
                this.lastErrorTime = Date.now();

                // Phase 5 Hardening: Circuit Breaker
                // If heartbeat fails too often, trigger survival mode or attempt recovery
                if (this.errorCount > 5) {
                    console.error('[Agent] Heartbeat ⚠️ CRITICAL FAILURE: Triggering emergency stop.');
                    this.state = BOT_STATE.ERROR;
                    this.actions.stop();
                    globalBus.emitSignal(SIGNAL.SYSTEM_ERROR, { reason: 'Heartbeat cascade failure', error: err.message });
                }
            }
        });
    }

    async _processLegacyModes() {
        if (!this.stateStack) return;
        const currentState = this.stateStack.peek();
        if (currentState) {
            const stateName = currentState.name.toLowerCase();
            const legacyMode = this.bot.modes ? this.bot.modes[stateName] : null;

            if (legacyMode && typeof legacyMode.update === 'function') {
                await legacyMode.update();
            }
        }
    }

    async _territorialUpdate() {
        if (!this.social) return;
        try {
            // Refactor: Use Profile Configuration
            const radius = this.config.profile?.security?.territorial_radius || 15;
            const nearby = Object.values(this.bot.entities).filter(e =>
                e.type === 'player' &&
                e.username !== this.bot.username &&
                this.bot.entity.position.distanceTo(e.position) < radius
            );
            const intruders = this.social.checkIntruders(nearby);
            if (intruders.length > 0) {
                const target = intruders[0];

                // EQS: Line-of-Sight check
                if (!this._canSeeEntity(target)) return;

                // Debounce warning
                const now = Date.now();
                const cooldown = this.config.profile?.behavior?.alert_cooldown || 10000;
                if (now - (this._lastTerritorialWarn || 0) > cooldown) {
                    console.log(`[SocialReflex] Detected intruder: ${target.username}`);
                    this.bot.lookAt(target.position.offset(0, 1.6, 0));
                    this.actions.execute('chat', { message: `Hey ${target.username}, what are you doing here? This is my territory.` });
                    this._lastTerritorialWarn = now;
                }
            }
        } catch (e) {
            console.warn('[TerritorialReflex] Error:', e.message);
        }
    }

    _canSeeEntity(entity) {
        if (!entity) return false;
        // Simple line-of-sight check using mineflayer
        return this.bot.canSeeEntity(entity);
    }



    isIdle() {
        if (!this.actions) return true;
        return !this.actions.executing;
    }

    async clean() {
        console.log(`[Agent] 🧹 Cleaning up agent ${this.name}...`);
        this.running = false;

        const safeCleanup = (label, fn) => {
            try {
                if (fn) fn();
            } catch (err) {
                console.warn(`[Agent] Cleanup warning (${label}): ${err.message}`);
            }
        };

        // 1. Core System Shutdown
        if (this.core) safeCleanup('Core', () => this.core.shutdown());

        // 2. Subsystem Cleanup (Safe Wrapping)
        // 2. Subsystem Cleanup (Safe Wrapping)
        safeCleanup('Watchdog', () => this.watchdog?.stop());
        safeCleanup('HealthMonitor', () => this.healthMonitor?.stop());
        safeCleanup('Vision', () => this.vision_interpreter?.cleanup());
        safeCleanup('AdventureLogger', () => { this.adventureLogger = null; });
        safeCleanup('Arbiter', () => this.arbiter?.cleanup());
        safeCleanup('Social', () => this.social?.cleanup());
        safeCleanup('MissionDirector', () => this.missionDirector?.cleanup?.());
        safeCleanup('DefenseController', () => this.defenseController?.stop?.());
        safeCleanup('BehaviorRuleEngine', () => this.behaviorRuleEngine?.cleanup?.());
        safeCleanup('ChatInstructionLearner', () => this.chatInstructionLearner?.cleanup?.());
        safeCleanup('SpawnBaseManager', () => this.spawnBaseManager?.cleanup?.());
        // Reflex cleanup handled by CoreSystem -> ReflexSystem

        // 3. Bot Teardown
        if (this.bot) {
            try {
                if (typeof this.bot.removeAllListeners === 'function') this.bot.removeAllListeners();
                if (typeof this.bot.quit === 'function') this.bot.quit();
                console.log(`[Agent] ⏏️ Bot listeners removed and connection closed.`);
            } catch (err) {
                console.error(`[Agent] Cleanup error (bot): ${err.message}`);
            }
        }

        // 4. Persistence
        if (this.history && typeof this.history.add === 'function') {
            try {
                this.history.add('system', 'Agent clean cleanup performed.');
                await this.history.save();
            } catch (err) {
                console.warn(`[Agent] Cleanup warning (history): ${err.message}`);
            }
        }

        this.state = 'OFFLINE';
        console.log(`[Agent] ✅ Final cleanup complete.`);
    }

    async shutdown(reason = 'Agent stopping...') {
        console.log(`${this.name} Shutdown initiated: ${reason} `);
        if (this.spawnTimeoutTimer) clearTimeout(this.spawnTimeoutTimer);
        if (this.updateTimer) clearTimeout(this.updateTimer);

        await this.clean();
    }

    async cleanKill(reason = 'Forced shutdown') {
        await this.shutdown(reason);
    }

    // Duplicated legacy methods removed


    async checkTaskDone() {
        if (this.task && this.task.data) {
            let res = this.task.isDone();
            if (res) {
                await this.history.add('system', `Task ended with score : ${res.score} `);
                await this.history.save();
                console.log('Task finished:', res.message);
                this.killAll();
            }
        }
    }

    /**
     * Phase 7: MindOS Health Check
     * Returns the status of all kernel components
     */
    getMindOSHealth() {
        return {
            status: 'online',
            uptime: process.uptime(),
            components: {
                brain: !!this.brain,
                memory: {
                    unified: !!this.unifiedMemory,
                    ram: !!this.memory,
                    graph: !!this.cogneeMemory,
                    vector: !!this.dreamer
                },
                kernel: {
                    signalBus: !!this.bus,
                    contextManager: !!this.core?.contextManager,
                    toolRegistry: !!this.toolRegistry,
                    system2: !!this.system2,
                    evolution: !!this.evolution,
                    missionDirector: !!this.missionDirector,
                    behaviorRuleEngine: !!this.behaviorRuleEngine
                },
                reflexes: {
                    combat: !!this.combatReflex,
                    death: !!this.deathRecovery,
                    watchdog: !!this.watchdog
                }
            },
            system2: this.system2 ? {
                active: this.system2.isRunning,
                currentGoal: this.system2.currentGoal,
                failures: this.system2.failureCount
            } : null,
            evolution: this.evolution ? this.evolution.getStats() : null,
            unifiedMemory: this.unifiedMemory ? this.unifiedMemory.getStats() : null
        };
    }

    killAll() {
        if (serverProxy) serverProxy.shutdown();
        this.shutdown('Task Finished');
    }

    async _onWhisper(username, message) {
        if (!this.running) return;
        try {
            await this.handleMessage(username, message);
        } catch (error) {
            console.error('[Agent] Whisper handle error:', error);
        }
    }

    async _onChat(username, message) {
        if (!this.running) return;
        if (serverProxy.getNumOtherAgents() > 0) return;
        try {
            await this.handleMessage(username, message);
        } catch (error) {
            console.error('[Agent] Chat handle error:', error);
        }
    }
}
