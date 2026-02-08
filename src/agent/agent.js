import { MemorySystem } from './memory/MemorySystem.js';
import { SocialEngine } from './interaction/SocialEngine.js';
import { CodeEngine } from './intelligence/CodeEngine.js';
import { ScenarioManager } from './tasks/ScenarioManager.js';
import { TaskScheduler, PRIORITY } from './core/TaskScheduler.js';
import { StateStack, STATE_PRIORITY } from './StateStack.js';
import { globalBus, SIGNAL } from './core/SignalBus.js';
import convoManager from './conversation.js';
import { handleTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import { sendThoughtToServer, sendOutputToServer } from './mindserver_proxy.js';
import { speak } from './speak.js';
import { log, validateNameFormat, handleDisconnection } from './connection_handler.js';
import { UnifiedBrain } from '../brain/UnifiedBrain.js';
import { PlannerAgent } from './orchestration/PlannerAgent.js';
import { DeathRecovery } from './reflexes/DeathRecovery.js';
import { Watchdog } from './reflexes/Watchdog.js';
import { MinecraftWiki } from '../tools/MinecraftWiki.js';
import { ActionLogger } from '../utils/ActionLogger.js';
import { randomUUID } from 'crypto';
import settings from '../../../settings.js';
import { HealthMonitor } from '../process/HealthMonitor.js';
import { MentalSnapshot } from '../utils/MentalSnapshot.js';
import { ToolRegistry } from './core/ToolRegistry.js';
import { System2Loop } from './orchestration/System2Loop.js';
import EvolutionEngine from './core/EvolutionEngine.js';
import { CoreSystem } from './core/CoreSystem.js';
import { CombatReflex } from './reflexes/CombatReflex.js';
import { RetryHelper } from '../utils/RetryHelper.js';
import { AsyncMutex } from '../utils/AsyncLock.js';
import { BOT_STATE } from './core/BotState.js';
import { ActionManager } from './action_manager.js';
import { SkillLibrary } from '../skills/SkillLibrary.js';
import { SkillOptimizer } from '../skills/SkillOptimizer.js';
import { VisionInterpreter } from './vision/vision_interpreter.js';
import { CogneeMemoryBridge } from '../memory/CogneeMemoryBridge.js';
import { Arbiter } from './Arbiter.js';
import { initBot } from '../utils/mcdata.js';
import { initModes } from './modes.js';
import { StandardProfileSchema } from '../utils/StandardProfileSchema.js';
import { Prompter } from '../models/prompter.js';

export class Agent {
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
                profileData = await import('../../' + profilePath.replace('./', '')).then(m => m.default || m);
            }
        } catch (err) {
            console.error(`[MindOS] ⚠️ Failed to load profile. Falling back to Standard Schema. Error: ${err.message}`);
        }

        // Merge with Profile (Priority: Profile > Settings > Schema)
        const finalProfile = { ...StandardProfileSchema, ...profileData };
        this.config.profile = finalProfile;

        // Legacy compatibility: ensure this.prompter gets the combined profile
        this.prompter = new Prompter(this, finalProfile);

        // MindOS Core (Bootloader)
        this.core = new CoreSystem(this);
        await this.core.initialize();

        // Consolidate Unified Modules (Phase 2 Refactor)
        this.memory = this.core.memory; // Bridged from Kernel
        this.social = new SocialEngine(this);
        this.intelligence = new CodeEngine(this);
        this.scenarios = new ScenarioManager(null, this);
        // Core Bridges
        this.scheduler = this.core.scheduler;
        this.bus = globalBus;

        // Nervous System
        this.brain = new UnifiedBrain(this, this.prompter);

        this.name = (this.prompter.getName() || '').trim();
        console.log(`[MindOS] Agent ${this.name} waking up...`);

        if (!validateNameFormat(this.name).success) {
            this.shutdown('Invalid name format');
            return;
        }

        // Feature Modules
        this.history = this.memory; // Legacy compatibility (Unified Phase 4)
        this.arbiter = new Arbiter(this);
        this.planner = new PlannerAgent(this);
        this.wiki = new MinecraftWiki(this);
        this.healthMonitor = new HealthMonitor(this);
        this.healthMonitor.start();

        // Reflexes & Optimization
        this.combatReflex = new CombatReflex(this);
        this.toolRegistry = new ToolRegistry(this);
        this.system2 = new System2Loop(this);
        this.evolution = new EvolutionEngine(this);
        this.mentalSnapshot = new MentalSnapshot(this);

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

        await this.prompter.initExamples();
        this.mentalSnapshot.load();

        let save_data = load_mem ? this.history.load() : null;
        this._connectToMinecraft(save_data, init_message);
    }

    async update(delta) {
        if (!this.running) return;

        // Phase 2: State Guard
        // Do not run main brain loop if not READY
        if (this.state !== BOT_STATE.READY) return;

        try {
            // High Frequency Reflex Update (50ms)
            if (this.combatReflex && this.combatReflex.inCombat) {
                // Combat attempts to acquire locks with 0 timeout (non-blocking if busy, but priority)
                if (await this.locks.look.acquire('combat', 0) && await this.locks.move.acquire('combat', 0)) {
                    await this.combatReflex.tick();
                }
            }

            // Central Intelligence Processing
            await this.brain.update(delta);

            // Social Territorial Check (Optimized)
            this._territorialUpdate();

            // Success resets error counter (Circuit Breaker)
            if (this.errorCount > 0 && Date.now() - this.lastErrorTime > 10000) {
                this.errorCount = 0;
            }

        } catch (err) {
            console.error(`[MindOS] Loop error in ${this.name}: `, err.message);

            // Circuit Breaker Logic
            this.errorCount++;
            this.lastErrorTime = Date.now();

            if (this.errorCount > 5) {
                console.error('[MindOS] 🚨 CRITICAL: Infinite Loop Error detected. Triggering Emergency Reset.');
                this.state = BOT_STATE.ERROR;

                // Emergency Reset Procedure
                try {
                    this.brain = new UnifiedBrain(this, this.prompter, this.cogneeMemory, this.skillLibrary);
                    console.log('[MindOS] Brain Soft-Reset completed.');
                    this.errorCount = 0;
                    this.state = BOT_STATE.READY;
                } catch (resetErr) {
                    console.error('[MindOS] ☠️ FATAL: Reset failed. Shutting down.', resetErr);
                    this.shutdown('Fatal Error Loop');
                }
            }
        }
    }

    _territorialUpdate() {
        const bot = this.bot;
        if (!bot || !bot.entities) return;

        const intruders = Object.values(bot.entities).filter(e => {
            if (e.type !== 'player' || e.username === bot.username) return false;

            // Phase 6 fix: Use profile-driven whitelist
            const whitelist = this.config.profile?.security?.whitelist || [];
            if (whitelist.length > 0 && !whitelist.includes(e.username)) return false;

            // Dynamic Territory Check
            const radius = this.config.profile?.security?.territorial_radius || 15;

            return bot.entity.position.distanceTo(e.position) < radius;
        });

        const dangerousIntruders = this.social.checkIntruders(intruders);
        if (dangerousIntruders.length > 0) {
            const target = dangerousIntruders[0];
            if (!this._lastAlertTime || Date.now() - this._lastAlertTime > 10000) {
                this.speak(`Stop right there, ${target.username} !This is my territory.`);
                this._lastAlertTime = Date.now();
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
        this.bot.on('error', (err) => {
            log(this.name, `[LoginGuard] Connection Error: ${String(err)} `);
            if (String(err).includes('Duplicate') || String(err).includes('ECONNREFUSED')) {
                this.handleSafeDisconnect('Error', err, save_data, init_message, attempt);
            }
        });

        initModes(this);

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
                console.log(`[INIT] ${this.name} spawned.Stabilizing...`);
                await new Promise((resolve) => setTimeout(resolve, 2000));

                this.clearBotLogs();
                addBrowserViewer(this.bot, this.count_id);

                if (!this.world_id) this.world_id = randomUUID();

                // Memory is already initialized in Kernel bootloader (CoreSystem.js line 45)
                this.bus.emitSignal(SIGNAL.BOT_SPAWNED, {
                    name: this.name,
                    world_id: this.world_id
                });

                await this._setupEventHandlers(save_data, init_message);
                // this.startEvents(); // REPLACED BY STATE MACHINE

                // Transition to LOADING state
                this.state = BOT_STATE.LOADING;

                // CRITICAL: We await heavy subsystems BEFORE starting event listeners
                // to prevent race conditions (e.g. death event before DeathRecovery is ready)
                await this._initHeavySubsystems(this.count_id, !!save_data);

                await this._setupEventHandlers(save_data, init_message);
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

    /**
     * Phase 3: Initialize heavy AI subsystems in background
     * This runs via TaskScheduler to avoid blocking main thread
     */
    async _initHeavySubsystems(count_id, load_mem) {
        console.log('[INIT] ⏳ Starting heavy subsystems initialization...');

        // Vision Interpreter (heavy - uses canvas)
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

        // Cognee Memory Bridge (Optional Service)
        try {
            const cogneeServiceUrl = settings.cognee_service_url || 'http://localhost:8001';

            // Phase 8: Retry Logic for Service Connection
            await RetryHelper.retry(async () => {
                this.cogneeMemory = new CogneeMemoryBridge(this, cogneeServiceUrl);
                await this.cogneeMemory.init();
                this.capabilities.memory_graph = true;
            }, { context: 'CogneeInit', maxRetries: 3 });

            console.log('[INIT] ✓ Cognee Memory Bridge initialized');

            // SkillLibrary
            this.skillLibrary = new SkillLibrary();
            await this.skillLibrary.init();
            this.capabilities.skill_library = true;
            console.log('[INIT] ✓ SkillLibrary initialized');

            // SkillOptimizer
            this.skillOptimizer = new SkillOptimizer(this, this.skillLibrary);
            this.skillLibrary.setOptimizer(this.skillOptimizer);
            console.log('[INIT] ✓ SkillOptimizer linked');

            // ToolRegistry: Discover all MCP-compatible skills
            await this.toolRegistry.discoverSkills();
            console.log('[INIT] ✓ ToolRegistry discovered skills');

            // Reinitialize UnifiedBrain with full context
            this.brain = new UnifiedBrain(this, this.prompter, this.cogneeMemory, this.skillLibrary);
            console.log('[INIT] ✓ UnifiedBrain enhanced with Cognee + Skills');

        } catch (err) {
            console.warn('[INIT] ⚠ External AI Services Unavailable (Cognee/Skills).');
            console.warn(`[INIT] Running in OFFLINE MODE.Error: ${err.message} `);
            // Fallback: Ensure critical components exist even if empty
            if (!this.brain) this.brain = new UnifiedBrain(this, this.prompter);
        }

        // Dreamer (VectorDB)
        if (this.dreamer) {
            RetryHelper.retry(() => this.dreamer.init(), { context: 'DreamerInit', maxRetries: 2 })
                .catch(err => console.warn('[INIT] ⚠ Dreamer init failed:', err.message));
        }

        // Task initialization
        if (!load_mem) {
            if (settings.task) {
                this.task.initBotTask();
                this.task.setAgentGoal();
            }
        } else {
            if (settings.task) {
                this.task.setAgentGoal();
            }
        }

        // Wait a bit then check players
        await new Promise((resolve) => setTimeout(resolve, 8000));
        if (this.running) this.checkAllPlayersPresent();

        // Initialize Reflexes
        this.deathRecovery = new DeathRecovery(this);
        this.watchdog = new Watchdog(this);
        this.watchdog.start();
        await this.deathRecovery.onSpawn();

        console.log('[INIT] ✅ All heavy subsystems initialized.');

        // Phase 8: Fix Init Race Condition
        // We trigger ready state ONLY after heavy subsystems (AI/Memory) are loaded.
        this.state = BOT_STATE.READY;
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
                // Priority: Individual Profile -> Global Settings
                const ignoreMsgs = this.prompter.profile.ignore_messages || settings.ignore_messages || [];
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
            startAt: this.prompter.profile.auto_eat_start || settings.auto_eat_start || 14,
            bannedFood: this.prompter.profile.banned_food || settings.banned_food || []
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
        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source);

        // 1. PROCESS INPUT (Brain Decides)
        const history = this.history.getHistory();
        const processResult = await this.brain.process(message, history, {
            is_chat: !self_prompt, // If self-prompt, it's NOT simple chat, it's planning
            self_prompt: self_prompt
        });

        if (processResult.type === 'command') {
            return true;
        }

        // 2. UPDATE HISTORY
        // Add the processed (translated) input
        if (processResult.input && processResult.input !== message) {
            console.log('Processed message from', source, ':', processResult.input);
        }
        // Only add if not self-prompt (Agent adds its own output later, and system prompts loop differently?)
        // Actually, original code added 'processedMessage' from 'source'.
        // If self_prompt is true, source is 'system' or 'BotName'.
        // If source is 'BotName', it's a thought loop.
        // We should add it.
        await this.history.add(source, processResult.input);
        this.history.save();

        // 3. HANDLE RESPONSE
        const response = processResult.result;
        if (!response) return false;

        // Add Bot Response to History
        this.history.add(this.name, response);
        this.routeResponse(source, response);
        this.history.save();

        // 4. AUTONOMOUS LOOP (Planning Mode)
        // If type was 'plan', we might want to continue thinking/acting
        if (processResult.type === 'plan') {
            // Setup Loop Variables
            if (max_responses === null) max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
            if (max_responses === -1) max_responses = Infinity;

            const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up || convoManager.responseScheduledFor(source);
            const requestId = randomUUID();
            this.latestRequestId = requestId;

            // Start loop at 1 (since 0 was the process() call)
            for (let i = 1; i < max_responses; i++) {
                if (checkInterrupt()) break;
                if (this.latestRequestId !== requestId) break;

                // Plan Next Step
                let planObj = await this.brain.plan(this.history.getHistory());
                if (!planObj) break;

                // 1. Process Thought (Monologue)
                if (planObj.thought) {
                    console.log(`[Thought] ${planObj.thought}`);
                    sendThoughtToServer(this.name, planObj.thought);
                }

                // 2. Process Chat (Public Output)
                if (planObj.chat) {
                    this.history.add(this.name, planObj.chat);
                    this.routeResponse(source, planObj.chat);
                }

                // 3. Execute Task (The "Body" Connection)
                if (planObj.task) {
                    console.log(`[Agent] Received Task: ${planObj.task.type}`);

                    if (planObj.task.type === 'code' && planObj.task.content) {
                        try {
                            // Execute via CodeEngine (which now has Sanitizer!)
                            console.log('[Agent] Executing Code Task...');
                            const result = await this.intelligence.execute(planObj.task.content);

                            if (result.success) {
                                this.history.add('system', `Code Execution Success: ${result.result}`);
                            } else {
                                this.history.add('system', `Code Execution Failed: ${result.error}`);
                            }
                        } catch (err) {
                            console.error('[Agent] Task Execution Error:', err);
                            this.history.add('system', `Task Error: ${err.message}`);
                        }
                    }
                }

                // Break after one plan step to allow re-evaluation (and prevent infinite loops)
                break;
            }
        }

        return false;
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

    async openChat(message) {
        // ... (Translation logic same as before) ...
        let to_translate = message;

        let finalMessage = message;
        try {
            finalMessage = (await handleTranslation(to_translate)).trim() + " " + remaining;
        } catch (err) {
            console.warn('Translation failed, using original:', err);
        }

        finalMessage = finalMessage.replaceAll('\n', ' ');

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
            if (this.bot.time.timeOfDay == 0) this.bot.emit('sunrise');
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
            this.memory.absorb('experience', {
                facts: [`I died at ${this.bot.entity.position} `],
                metadata: { type: 'death', timestamp: Date.now() }
            });
        });

        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                let death_pos = this.bot.entity.position;
                this.memory.rememberPlace('last_death_position', death_pos.x, death_pos.y, death_pos.z);
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
                if (this.isIdle()) {
                    this.actions.resumeAction();
                }
            }, 1000);
        });

        this.npc.init();

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
                // 1. Brain Update (State Stack)
                if (this.brain && this.brain.update) {
                    await this.brain.update(now - lastTick);
                }

                // 2. Legacy Mode Update
                await this._processLegacyModes();

                // 3. Social Territorial Check
                if (this.social) {
                    this._territorialUpdate();
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
            const radius = settings.tactical?.territorial_radius || 15;
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
                const cooldown = settings.tactical?.alert_cooldown || 10000;
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
        return !this.actions.executing;
    }

    async clean() {
        console.log(`[Agent] 🧹 Cleaning up agent ${this.name}...`);
        this.running = false;

        // 1. Core System Shutdown (Inside CoreSystem, we call reflexSystem.cleanup and scheduler.shutdown)
        if (this.core) {
            this.core.shutdown();
        }

        // 2. Subsystem Cleanup (Intervals/Loops)
        if (this.watchdog) this.watchdog.stop();
        if (this.healthMonitor) this.healthMonitor.stop();
        if (this.vision_interpreter) this.vision_interpreter.cleanup();

        if (this.arbiter) this.arbiter.cleanup();
        if (this.social) this.social.cleanup();
        if (this.combat) this.combat.cleanup();

        // 3. Bot Teardown
        if (this.bot) {
            try {
                this.bot.removeAllListeners();
                this.bot.quit();
                console.log(`[Agent] ⏏️ Bot listeners removed and connection closed.`);
            } catch (err) {
                console.error(`[Agent] Cleanup error (bot): ${err.message}`);
            }
        }

        // 4. Persistence
        if (this.history) {
            this.history.add('system', 'Agent clean cleanup performed.');
            await this.history.save();
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

    // Backwards compatibility wrapper
    async cleanKill(msg = 'Killing agent process...', code = 1) {
        console.warn('Deprecated cleanKill called. Using shutdown() instead.');
        await this.shutdown(msg);
    }

    async handleMessage(source, message) {
        if (!message) return;

        // Phase 6: Unified Brain Routing
        const conversation_id = source;

        // Add to history (Unified Memory)
        await this.history.add(source, message);

        // Process via Unified Brain
        if (this.brain) {
            // CRITICAL: Concurrency Hardening
            // We acquire locks BEFORE thinking to prevent Reflexes (like Combat)
            // from jumping in mid-thought and creating state inconsistency.
            // We use a generous timeout (30s) for the Brain to "think".
            const lockTimeout = 30000;
            const lookLock = await this.locks.look.acquire('brain_thinking', lockTimeout);
            const moveLock = await this.locks.move.acquire('brain_thinking', lockTimeout);

            try {
                // Predictive Safety Check: Prevent non-critical commands during combat
                const isCombat = this.combatReflex && this.combatReflex.inCombat;
                const isRiskyCommand = message.toLowerCase().includes('toss') ||
                    message.toLowerCase().includes('drop') ||
                    message.toLowerCase().includes('give');

                if (isCombat && isRiskyCommand) {
                    console.warn(`[Agent] 🛡️ Blocked risky command during combat: "${message}"`);
                    await this.history.add(this.name, "I'm busy fighting! I can't do that right now or I might lose my equipment.");
                    return;
                }

                const response = await this.brain.process({
                    source,
                    message,
                    conversation_id
                });

                if (response && response.response) {
                    await this.history.add(this.name, response.response);
                }
            } catch (err) {
                console.error('[Agent] Brain process error:', err);
                await this.history.add('system', `Brain Error: ${err.message}`);
            } finally {
                // Always release locks, even if brain fails
                if (lookLock) this.locks.look.release('brain_thinking');
                if (moveLock) this.locks.move.release('brain_thinking');
            }
        } else {
            console.error('[Agent] No Brain attached!');
        }
    }

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
                    ram: !!this.memory_bank,
                    graph: !!this.cogneeMemory,
                    vector: !!this.dreamer
                },
                kernel: {
                    signalBus: !!this.bus,
                    contextManager: !!this.contextManager,
                    toolRegistry: !!this.toolRegistry,
                    system2: !!this.system2,
                    evolution: !!this.evolution
                },
                reflexes: {
                    combat: !!this.combatReflex,
                    death: !!this.deathReflex,
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
        serverProxy.shutdown();
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