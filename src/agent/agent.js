import { History } from './history.js';
import { MemorySystem } from './memory/MemorySystem.js';
import { SocialEngine } from './interaction/SocialEngine.js';
import { CodeEngine } from './intelligence/CodeEngine.js';
import { ScenarioManager } from './tasks/ScenarioManager.js';
import { TaskScheduler, PRIORITY } from './core/TaskScheduler.js';
import { StateStack, STATE_PRIORITY } from './StateStack.js';
import { globalBus, SIGNAL } from './core/SignalBus.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction, blacklistCommands } from './commands/index.js';
import { ActionManager } from './action_manager.js';
import { SelfPrompter } from './self_prompter.js';
import convoManager from './conversation.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import { serverProxy, sendOutputToServer } from './mindserver_proxy.js';
import settings from '../../settings.js';
import { speak } from './speak.js';
import { log, validateNameFormat, handleDisconnection } from './connection_handler.js';
import { UnifiedBrain } from '../brain/UnifiedBrain.js';
import { StrategyPlanner } from './StrategyPlanner.js';
import { DeathRecovery } from './reflexes/DeathRecovery.js';
import { Watchdog } from './reflexes/Watchdog.js';
import { MinecraftWiki } from '../tools/MinecraftWiki.js';
import { DebugCommands } from './commands/DebugCommands.js';
import { ActionLogger } from '../utils/ActionLogger.js';
import { randomUUID } from 'crypto';
import { HealthMonitor } from '../process/HealthMonitor.js';
import { MentalSnapshot } from '../utils/MentalSnapshot.js';
import { ToolRegistry } from './core/ToolRegistry.js';
import { System2Loop } from './orchestration/System2Loop.js';
import EvolutionEngine from './core/EvolutionEngine.js';
import { CoreSystem } from './core/CoreSystem.js';
import { CombatReflex } from './reflexes/CombatReflex.js';

class ControlLock {
    constructor() {
        this.owner = null;
        this.timestamp = 0;
    }
    request(owner, timeout = 5000) {
        if (!this.owner || (Date.now() - this.timestamp > timeout)) {
            this.owner = owner;
            this.timestamp = Date.now();
            return true;
        }
        return this.owner === owner;
    }
    release(owner) {
        if (this.owner === owner) {
            this.owner = null;
            return true;
        }
        return false;
    }
}

export class Agent {
    async start(load_mem = false, init_message = null, count_id = 0) {
        this.last_sender = null;
        this.count_id = count_id;
        this._disconnectHandled = false;
        this.running = true;
        this.latestRequestId = null;

        // Core Components
        this.actions = new ActionManager(this);
        this.prompter = new Prompter(this, settings.profile);

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
        this.history = new History(this);
        this.arbiter = new Arbiter(this);
        this.planner = new StrategyPlanner(this);
        this.wiki = new MinecraftWiki(this);
        this.debugCommands = new DebugCommands(this);
        this.healthMonitor = new HealthMonitor(this);
        this.healthMonitor.start();

        // Reflexes & Optimization
        this.combatReflex = new CombatReflex(this);
        this.toolRegistry = new ToolRegistry(this);
        this.system2 = new System2Loop(this);
        this.evolution = new EvolutionEngine(this);
        this.mentalSnapshot = new MentalSnapshot(this);

        // Resource Locking
        this.locks = {
            look: new ControlLock(),
            move: new ControlLock()
        };

        this.stateStack = new StateStack(this);
        this.flags = { critical_action: false, allow_reflex: true };

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

        try {
            // High Frequency Reflex Update (50ms)
            if (this.combatReflex && this.combatReflex.inCombat) {
                if (this.locks.look.request('combat') && this.locks.move.request('combat')) {
                    await this.combatReflex.tick();
                }
            }

            // Central Intelligence Processing
            await this.brain.update(delta);

            // Social Territorial Check (Optimized)
            this._territorialUpdate();

        } catch (err) {
            console.error(`[MindOS] Loop error in ${this.name}:`, err.message);
            // Don't crash, just wait for next tick
        }
    }

    _territorialUpdate() {
        const bot = this.bot;
        if (!bot || !bot.entities) return;

        const intruders = Object.values(bot.entities).filter(e => {
            if (e.type !== 'player' || e.username === bot.username) return false;
            // Check if the player is in the whitelist
            if (settings.whitelist.length > 0 && !settings.whitelist.includes(e.username)) return false;
            return bot.entity.position.distanceTo(e.position) < 15;
        });

        const dangerousIntruders = this.social.checkIntruders(intruders);
        if (dangerousIntruders.length > 0) {
            const target = dangerousIntruders[0];
            if (!this._lastAlertTime || Date.now() - this._lastAlertTime > 10000) {
                this.speak(`Stop right there, ${target.username}! This is my territory.`);
                this._lastAlertTime = Date.now();
            }
        }
    }

    /**
     * Internal helper to manage Minecraft connection and auto-reconnect
     */
    async _connectToMinecraft(save_data = null, init_message = null, attempt = 0) {
        if (!this.running) return;

        console.log(`${this.name} logging into minecraft (Attempt ${attempt + 1})...`);
        try {
            this.bot = initBot(this.name);
            this._disconnectHandled = false;
        } catch (err) {
            console.error(`${this.name} failed to init bot instance:`, err);
            this._handleReconnect(save_data, init_message, attempt);
            return;
        }

        this.bot.once('kicked', (reason) => this.handleSafeDisconnect('Kicked', reason, save_data, init_message, attempt));
        this.bot.once('end', (reason) => this.handleSafeDisconnect('Disconnected', reason, save_data, init_message, attempt));
        this.bot.on('error', (err) => {
            log(this.name, `[LoginGuard] Connection Error: ${String(err)}`);
            if (String(err).includes('Duplicate') || String(err).includes('ECONNREFUSED')) {
                this.handleSafeDisconnect('Error', err, save_data, init_message, attempt);
            }
        });

        initModes(this);

        this.bot.on('login', () => {
            console.log(this.name, 'logged in!');
            serverProxy.login();
            if (this.prompter.profile.skin)
                this.bot.chat(`/skin set URL ${this.prompter.profile.skin.model} ${this.prompter.profile.skin.path}`);
            else
                this.bot.chat(`/skin clear`);
        });

        this.bot.once('spawn', async () => {
            try {
                if (!this.running) return;
                console.log(`[INIT] ${this.name} spawned. Stabilizing...`);
                await new Promise((resolve) => setTimeout(resolve, 2000));

                this.clearBotLogs();
                addBrowserViewer(this.bot, this.count_id);

                if (!this.world_id) this.world_id = randomUUID();

                this.unifiedMemory.init();
                this.bus.emitSignal(SIGNAL.BOT_SPAWNED, {
                    name: this.name,
                    world_id: this.world_id
                });

                await this._setupEventHandlers(save_data, init_message);
                this.startEvents();
                this.isReady = true;

                this.scheduler.schedule('heavy_subsystems_init', PRIORITY.BACKGROUND, async () => {
                    await this._initHeavySubsystems(this.count_id, !!save_data);
                }, true);

                console.log('[INIT] Agent is online and listening.');
            } catch (error) {
                console.error('Error in spawn event:', error);
                this.handleSafeDisconnect('SpawnError', error, save_data, init_message, attempt);
            }
        });
    }

    _handleReconnect(save_data, init_message, attempt) {
        if (!this.running) return;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff max 30s
        console.log(`[Reconnect] Retrying in ${delay / 1000}s...`);
        setTimeout(() => this._connectToMinecraft(save_data, init_message, attempt + 1), delay);
    }

    // Updated helper for safe disconnection logic with auto-reconnect
    handleSafeDisconnect(type, reason, save_data, init_message, attempt) {
        if (this._disconnectHandled) return;
        this._disconnectHandled = true;

        const { msg } = handleDisconnection(this.name, reason);
        console.log(`[SafeDisconnect] ${this.name} (${type}): ${msg}`);

        if (this.bot) {
            this.bot.removeAllListeners();
            this.bot.end();
        }

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
                console.log('[INIT] ✓ VisionInterpreter loaded');
            } catch (err) {
                console.warn('[INIT] ⚠ VisionInterpreter failed:', err.message);
            }
        }

        // Cognee Memory Bridge (Optional Service)
        try {
            const cogneeServiceUrl = settings.cognee_service_url || 'http://localhost:8001';
            this.cogneeMemory = new CogneeMemoryBridge(this, cogneeServiceUrl);
            await this.cogneeMemory.init();
            console.log('[INIT] ✓ Cognee Memory Bridge initialized');

            // SkillLibrary
            this.skillLibrary = new SkillLibrary();
            await this.skillLibrary.init();
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
            console.warn(`[INIT] Running in OFFLINE MODE. Error: ${err.message}`);
            // Fallback: Ensure critical components exist even if empty
            if (!this.brain) this.brain = new UnifiedBrain(this, this.prompter);
        }

        // Dreamer (VectorDB)
        if (this.dreamer) {
            this.dreamer.init().catch(err => console.warn('[INIT] ⚠ Dreamer init failed:', err.message));
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
    }

    async _setupEventHandlers(save_data, init_message) {
        const ignore_messages = [
            "Set own game mode to",
            "Set the time to",
            "Set the difficulty to",
            "Teleported ",
            "Set the weather to",
            "Gamerule "
        ];

        const respondFunc = async (username, message) => {
            if (!this.running) return;

            // Phase 3: Safe Startup Sequence
            // Gatekeep Events
            if (!this.isReady) {
                // Optional: Queue or Reply. User plan suggests "I am waking up..." or queue.
                // Let's reply once per user to avoid spam, or just ignore. 
                // User said: "If not ready, reply... or queue". Let's ignore to match previous safe behavior but add debug log.
                // console.debug('[Agent] Ignored message (not ready):', message);
                return;
            }

            if (message === "") return;
            if (username === this.name) return;
            if (settings.only_chat_with.length > 0 && !settings.only_chat_with.includes(username)) return;

            try {
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                this.shut_up = false;
                console.log(this.name, 'received message from', username, ':', message);

                // Task 6: Auto-store player interactions to Cognee
                if (this.cogneeMemory && this.world_id) {
                    const interaction = `Player ${username} said: "${message}"`;
                    this.cogneeMemory.storeExperience(this.world_id, [interaction], {
                        type: 'player_interaction',
                        timestamp: Date.now(),
                        player: username
                    }).catch(err => console.warn('[Task 6] Failed to store interaction:', err.message));
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

        this.respondFunc = respondFunc;

        this.bot.on('whisper', respondFunc);

        this.bot.on('chat', (username, message) => {
            if (serverProxy.getNumOtherAgents() > 0) return;
            // only respond to open chat messages when there are no other agents
            respondFunc(username, message);
        });

        // Set up auto-eat
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
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
                        message: `You have restarted and this message is auto-generated. Continue the conversation with me.`,
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
            console.log(`Missing players/bots: ${missingPlayers.join(', ')}`);
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

        // Phase 7.5: Intercept !debug commands
        if (this.debugCommands && this.debugCommands.isDebugCommand(message)) {
            const debugResponse = await this.debugCommands.handle(message);
            this.routeResponse(source, debugResponse);
            return true;
        }

        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source);

        let user_command_name = null;
        let is_chat = true; // Assume chat unless proved otherwise

        // 1. DETECT COMMANDS (High IQ Task)
        if (!self_prompt && !from_other_bot) {
            const potentialCommand = containsCommand(message);
            if (potentialCommand) {
                is_chat = false; // It's a command/task
                user_command_name = potentialCommand;

                if (!commandExists(user_command_name)) {
                    this.routeResponse(source, `Command '${user_command_name}' does not exist.`);
                    return false;
                }

                // SECURITY CHECK: !newAction
                if (user_command_name === '!newAction') {
                    if (!settings.allow_insecure_coding) {
                        this.routeResponse(source, `Security: !newAction is disabled in settings.`);
                        return false;
                    }
                    this.history.add(source, message);
                }

                this.routeResponse(source, `*${source} used ${user_command_name.substring(1)}*`);

                // SAFETY CHECK (Task 15)
                if (this.arbiter) {
                    const safetyObj = this.arbiter.checkSafety(user_command_name, source);
                    if (!safetyObj.safe) {
                        this.routeResponse(source, `🚫 ACTION BLOCKED: ${safetyObj.reason}`);
                        this.history.add('system', `Action '${user_command_name}' blocked by Arbiter: ${safetyObj.reason}`);
                        return false;
                    }
                }

                // EXECUTE COMMAND (High IQ might be needed for code, but executeCommand handles it)
                let execute_res = await executeCommand(this, message);
                if (execute_res)
                    this.routeResponse(source, execute_res);
                return true;
            }
        }

        // 2. CHAT ROUTING (Fast Task)
        if (from_other_bot)
            this.last_sender = source;

        // Perform translation ONLY for chat messages
        let processedMessage = message;
        if (!self_prompt && !from_other_bot) {
            processedMessage = await handleEnglishTranslation(message);
        }

        console.log('Processed message from', source, ':', processedMessage);

        await this.history.add(source, processedMessage);
        this.history.save();

        // 3. GENERATE RESPONSE (Dual Brain Routing)
        if (max_responses === null) max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        if (max_responses === -1) max_responses = Infinity;

        // If it's a simple chat, USE FAST MODEL
        if (is_chat && !self_prompt) {
            let history = this.history.getHistory();
            let res = await this.brain.chat(history); // Use DualBrain.chat()
            this.history.add(this.name, res);
            this.routeResponse(source, res);
            this.history.save();
            return false; // Chat done
        }

        // If it's a self-prompt (Planning/Loop), USE HIGH IQ MODEL
        // (Previously prompter.promptConvo, now delegated via DualBrain if needed, 
        //  but effectively we keep internal loop for complex tasks)
        // For now, we preserve the original loop but note that prompter usage routes through DualBrain implicitly
        // if we updated Prompter. But here we have DualBrain explicitly.

        // TODO: Refactor SelfPrompter to use DualBrain.plan()
        // For this phase, we keep the existing Prompter loop but acknowledge we have the Brain ready.

        const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up || convoManager.responseScheduledFor(source);

        // Task 27: Generate Request ID
        const requestId = randomUUID();
        this.latestRequestId = requestId;

        // [Existing Loop logic preserved for safety in Phase 01, but logic is cleaner]
        for (let i = 0; i < max_responses; i++) {
            if (checkInterrupt()) break;

            // Task 27: Check for Stale Request
            if (this.latestRequestId !== requestId) {
                console.log(`[Agent] Interrupting stale request ${requestId} (New: ${this.latestRequestId})`);
                break;
            }

            let history = this.history.getHistory();

            // IMPORTANT: Here we decide model based on context.
            // If we are in a loop (i > 0) or it's self_prompt, likely Planning.
            let res;
            if (self_prompt || i > 0) {
                // Complex Task / Loop -> High IQ (via DualBrain Plan)
                res = await this.brain.plan(history);
            } else {
                // First response to system/user -> Standard Check (also Plan for now to ensure IQ)
                res = await this.brain.plan(history);
            }

            console.log(`${this.name} full response to ${source}: ""${res}""`);

            if (res.trim().length === 0) {
                console.warn('no response');
                break;
            }

            let command_name = containsCommand(res);

            if (command_name) {
                // ... (Command handling logic same as before) ...
                if (command_name === '!newAction' && !settings.allow_insecure_coding) {
                    this.history.add('system', 'Cannot execute !newAction because allow_insecure_coding is false.');
                    continue;
                }

                res = truncCommandMessage(res);
                this.history.add(this.name, res);

                // Task 27: Check for Stale Request BEFORE Execution
                if (this.latestRequestId !== requestId) {
                    console.log(`[Agent] Aborting stale action execution for ${requestId}`);
                    break;
                }


                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist.`);
                    continue;
                }

                if (checkInterrupt()) break;
                this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));

                // Output logic
                if (settings.show_command_syntax === "full") {
                    this.routeResponse(source, res);
                }
                else if (settings.show_command_syntax === "shortened") {
                    let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                    let chat_message = `*used ${command_name.substring(1)}*`;
                    if (pre_message.length > 0)
                        chat_message = `${pre_message}  ${chat_message}`;
                    this.routeResponse(source, chat_message);
                }
                else {
                    let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                    if (pre_message.trim().length > 0)
                        this.routeResponse(source, pre_message);
                }

                // SAFETY CHECK FOR AI COMMANDS (Fix)
                if (this.arbiter) {
                    // For AI generated commands, we check the original requester (source)
                    const safetyObj = this.arbiter.checkSafety(command_name, source);
                    if (!safetyObj.safe) {
                        const blockMsg = `🚫 AI ACTION BLOCKED: ${safetyObj.reason}`;
                        console.warn(blockMsg);
                        this.history.add('system', blockMsg);
                        // Force break loop to prevent infinite retry of blocking action
                        break;
                    }
                }

                let execute_res = await executeCommand(this, res);
                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else {
                this.history.add(this.name, res);
                this.routeResponse(source, res);
                break;
            }

            this.history.save();
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
        let remaining = '';
        let command_name = containsCommand(message);
        let translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to != -1) {
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }

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
                    this.stateStack.push('combat', 80, { target: null, reason: 'self_defense' });
                    console.log("!!! ATTACKED -> TRIGGERING COMBAT STATE !!!");
                }
            }
        });

        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();
        });

        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                let death_pos = this.bot.entity.position;
                this.memory_bank.rememberPlace('last_death_position', death_pos.x, death_pos.y, death_pos.z);
                let death_pos_text = null;
                if (death_pos) {
                    death_pos_text = `x: ${death_pos.x.toFixed(2)}, y: ${death_pos.y.toFixed(2)}, z: ${death_pos.x.toFixed(2)}`;
                }
                let dimention = this.bot.game.dimension;

                // Task 6: Auto-store death events to Cognee
                if (this.cogneeMemory && this.world_id) {
                    const deathFact = `Died at ${death_pos_text || "unknown"} in ${dimention} dimension. Cause: ${message}`;
                    this.cogneeMemory.storeExperience(this.world_id, [deathFact], {
                        type: 'death_event',
                        timestamp: Date.now(),
                        position: death_pos,
                        dimension: dimention,
                        cause: message
                    }).catch(err => console.warn('[Task 6] Failed to store death event:', err.message));
                }

                // Task 6: Auto-store death events to Cognee
                // ... (Existing Cognee logic) ...

                // Task 16: Trigger Death Reflex Recording
                if (this.deathRecovery) {
                    this.deathRecovery.onDeath(message);
                }

                this.handleMessage('system', `You died at position ${death_pos_text || "unknown"} in the ${dimention} dimension with the final message: '${message}'. Your place of death is saved as 'last_death_position' if you want to return. Previous actions were stopped and you have respawned.`);
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

        // REFACTORED UPDATE LOOP using Event-Driven pattern
        // Instead of constant polling, we use a much slower heartbeat
        // And rely on Events to trigger actions.
        const INTERVAL = 1000; // Increased from 300ms to 1000ms to save CPU
        let last = Date.now();
        this.updateLoop = async () => {
            if (!this.running) return;

            let start = Date.now();
            try {
                // REFACTORED: Full Global Fault Tolerance
                // Wrap END-TO-END update logic
                await this.update(start - last);
            } catch (err) {
                console.error('[UpdateLoop Error]', err);
                // Continuity is handled by the finally/scheduling block below
            }

            let remaining = INTERVAL - (Date.now() - start);
            if (this.running) {
                if (remaining > 0) {
                    this.updateTimer = setTimeout(this.updateLoop, remaining);
                } else {
                    this.updateTimer = setTimeout(this.updateLoop, 0);
                }
            }
            last = start;
        };
        this.updateTimer = setTimeout(this.updateLoop, INTERVAL);

        this.bot.emit('idle');
    }

    async update(delta) {
        // --- BRAIN INTEGRATION START: STATE STACK DRIVER ---
        if (this.stateStack) {
            const currentState = this.stateStack.peek(); // Get highest priority state
            if (currentState) {
                const stateName = currentState.name.toLowerCase();

                // 1. Map State Name to Legacy Mode (e.g., 'Combat' -> pvp.js)
                // Assuming legacy modes are stored in this.bot.modes
                const legacyMode = this.bot.modes ? this.bot.modes[stateName] : null;

                if (legacyMode && typeof legacyMode.update === 'function') {
                    // If this state has a corresponding Mode -> Run it
                    await legacyMode.update();
                }
                else if (stateName === 'idle') {
                    // Idle State: Light self-maintenance or observation
                    // Phase 11: Territorial Instinct (Social Reflex)
                    if (this.humanManager) {
                        try {
                            const intruders = this.humanManager.getNearbyUntrustedPlayers(20); // 20 blocks radius
                            if (intruders.length > 0) {
                                // Found stranger -> Warn them!
                                const target = intruders[0];
                                console.log(`[SocialReflex] Detected intruder: ${target.username}`);
                                // Push warning state or just act immediately?
                                // Let's push a short-lived interaction state if possible, or just chat.
                                // Simplest: Chat warning + Face them.
                                this.bot.lookAt(target.position.offset(0, 1.6, 0));
                                this.actions.execute('chat', { message: `Hey ${target.username}, what are you doing here? This is my territory.` });
                            }
                        } catch (e) {
                            // ignore social errors
                        }
                    }
                }
                else {
                    // New State (no legacy mode) -> Needs specific handling
                    // e.g. 'crafting', 'analyzing'
                    // For now, we log it to avoid silence
                    // console.log(`[Agent] In state ${currentState.name} (No specific handler yet)`);
                }
            }
        }
        // --- BRAIN INTEGRATION END ---

        // Legacy fallback removed to prevent double-execution
        // if (this.bot.modes) await this.bot.modes.update(); 

        if (this.self_prompter) this.self_prompter.update(delta);

        // Task 14: Update Planner (Protected)
        // If high-level planning fails, low-level reflexes must still work
        if (this.planner) {
            try {
                await this.planner.update();
            } catch (err) {
                console.error('[UpdateLoop] ⚠ Planner crashed (ignoring to keep Reflexes alive):', err.message);
            }
        }

        await this.checkTaskDone();

        // Task 35: Active Vision Loop
        // We handle this via a timer usually, but here in update loop is fine if we use a timer check
        this._visionTimer = (this._visionTimer || 0) + delta;
        if (this._visionTimer > 10000) { // Every 10s
            this._visionTimer = 0;
            if (this.vision_interpreter) {
                this.vision_interpreter.scanEnvironment().catch(e => console.warn('[Vision] Scan error:', e.message));
            }
        }
    }

    isIdle() {
        return !this.actions.executing;
    }

    shutdown(reason = 'Agent stopping...') {
        console.log(`${this.name} Shutdown initiated: ${reason}`);
        this.running = false;
        if (this.spawnTimeoutTimer) clearTimeout(this.spawnTimeoutTimer);
        if (this.updateTimer) clearTimeout(this.updateTimer);

        this.history.add('system', `Shutdown: ${reason}`);
        this.history.save();

        if (this.bot) {
            try {
                this.bot.removeAllListeners();
                this.bot.quit();
            } catch (err) { }
        }
    }

    // Backwards compatibility wrapper
    cleanKill(msg = 'Killing agent process...', code = 1) {
        console.warn('Deprecated cleanKill called. Using shutdown() instead.');
        this.shutdown(msg);
    }

    async checkTaskDone() {
        if (this.task && this.task.data) {
            let res = this.task.isDone();
            if (res) {
                await this.history.add('system', `Task ended with score : ${res.score}`);
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
}