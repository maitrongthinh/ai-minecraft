import { History } from './history.js';
import { SmartCoder } from './SmartCoder.js';
// import { Coder } from './coder.js';
import { VisionInterpreter } from './vision/vision_interpreter.js';
import { Prompter } from '../models/prompter.js';
import { Dreamer } from './Dreamer.js';
import { BlueprintManager } from '../blueprints/BlueprintManager.js';
import { HumanManager } from '../human_core/HumanManager.js';
import { Arbiter } from './Arbiter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction, blacklistCommands } from './commands/index.js';
import { ActionManager } from './action_manager.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import convoManager from './conversation.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import { serverProxy, sendOutputToServer } from './mindserver_proxy.js';
import settings from '../../settings.js';
import { Task } from './tasks/tasks.js';
import { speak } from './speak.js';
import { log, validateNameFormat, handleDisconnection } from './connection_handler.js';
import { DualBrain } from '../brain/DualBrain.js';
import { CogneeMemoryBridge } from '../memory/CogneeMemoryBridge.js';
import { SkillLibrary } from '../skills/SkillLibrary.js';
import { SkillOptimizer } from '../skills/SkillOptimizer.js';
import { StrategyPlanner } from './StrategyPlanner.js';
import { DeathRecovery } from './reflexes/DeathRecovery.js';
import { Watchdog } from './reflexes/Watchdog.js';
import { MinecraftWiki } from '../tools/MinecraftWiki.js';
import { DebugCommands } from './commands/DebugCommands.js'; // Phase 7.5: In-game debug
import { ActionLogger } from '../utils/ActionLogger.js'; // Phase 7.5: File logging
import { StateStack, STATE_PRIORITY } from './StateStack.js'; // Brain Refactor: Multi-tasking
import { StateStack, STATE_PRIORITY } from './StateStack.js'; // Brain Refactor: Multi-tasking
import { randomUUID } from 'crypto';
import { HealthMonitor } from '../process/HealthMonitor.js'; // Task 28: Health Monitor

/**
 * PRODUCTION-READY AGENT CLASS (Dual-Brain Edition)
 * Refactored to remove process.exit(), implement Dual-Brain Architecture, and Event-Driven Loop.
 */
export class Agent {
    async start(load_mem = false, init_message = null, count_id = 0) {
        this.last_sender = null;
        this.count_id = count_id;
        this._disconnectHandled = false;
        this.running = true; // Lifecycle flag to manage update loop
        this.latestRequestId = null; // Task 27: Interrupt Handling


        // Initialize components
        this.actions = new ActionManager(this);
        this.prompter = new Prompter(this, settings.profile);

        // Initialize Graph Memory (Task 6)
        // Note: CogneeMemoryBridge will be init in spawn event after world_id is generated
        this.cogneeMemory = null;
        this.world_id = null;

        // Initialize Central Nervous System (DualBrain)
        // Initialize Central Nervous System (DualBrain)
        this.brain = new DualBrain(this, this.prompter);

        this.name = (this.prompter.getName() || '').trim();
        console.log(`Initializing agent ${this.name}...`);

        // Validate Name Format
        const nameCheck = validateNameFormat(this.name);
        if (!nameCheck.success) {
            log(this.name, nameCheck.msg);
            this.shutdown('Invalid name format'); // SAFE SHUTDOWN
            return;
        }

        this.history = new History(this);
        this.coder = new SmartCoder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank();
        this.self_prompter = new SelfPrompter(this);
        this.dreamer = new Dreamer(this);
        this.blueprintManager = new BlueprintManager();
        this.humanManager = new HumanManager(this);
        this.arbiter = new Arbiter(this);
        this.arbiter = new Arbiter(this);
        this.planner = new StrategyPlanner(this); // Task 14: Initialize Strategy Planner
        this.spatial = new SpatialMemory(this);   // Task 22: Persistent Vision Memory
        this.wiki = new MinecraftWiki(this); // Task 19: Initialize Wiki Tool
        this.wiki = new MinecraftWiki(this); // Task 19: Initialize Wiki Tool
        this.debugCommands = new DebugCommands(this); // Phase 7.5: In-game debug commands
        this.healthMonitor = new HealthMonitor(this); // Task 28: Health Monitor
        this.healthMonitor.start();


        // Brain Refactor Phase B: StateStack for multi-tasking
        this.stateStack = new StateStack(this);

        // Brain Refactor Phase D: Flags for reflex guard
        this.flags = {
            critical_action: false, // True during precision work (building, combat)
            allow_reflex: true       // Master switch for reflexes
        };

        convoManager.initAgent(this);
        // Wrap async init in try/catch
        try {
            await this.prompter.initExamples();
        } catch (err) {
            console.error(`${this.name} failed to init examples:`, err);
        }

        // load mem first before doing task
        let save_data = null;
        if (load_mem) {
            save_data = this.history.load();
        }
        let taskStart = null;
        if (save_data) {
            taskStart = save_data.taskStart;
        } else {
            taskStart = Date.now();
        }
        this.task = new Task(this, settings.task, taskStart);
        this.blocked_actions = settings.blocked_actions.concat(this.task.blocked_actions || []);
        blacklistCommands(this.blocked_actions);

        console.log(this.name, 'logging into minecraft...');
        try {
            this.bot = initBot(this.name);
        } catch (err) {
            console.error(`${this.name} failed to init bot instance:`, err);
            this.shutdown('Bot Initialization Failed');
            return;
        }

        // Connection Handler replaced with safe internal handler
        this.bot.once('kicked', (reason) => this.handleSafeDisconnect('Kicked', reason));
        this.bot.once('end', (reason) => this.handleSafeDisconnect('Disconnected', reason));
        this.bot.on('error', (err) => {
            if (String(err).includes('Duplicate') || String(err).includes('ECONNREFUSED')) {
                this.handleSafeDisconnect('Error', err);
            } else {
                log(this.name, `[LoginGuard] Connection Error: ${String(err)}`);
            }
        });

        initModes(this);

        this.bot.on('login', () => {
            console.log(this.name, 'logged in!');
            serverProxy.login();

            // Set skin for profile
            if (this.prompter.profile.skin)
                this.bot.chat(`/skin set URL ${this.prompter.profile.skin.model} ${this.prompter.profile.skin.path}`);
            else
                this.bot.chat(`/skin clear`);
        });

        const spawnTimeoutDuration = settings.spawn_timeout;
        // Keep reference to timeout to clear it on shutdown
        this.spawnTimeoutTimer = setTimeout(() => {
            const msg = `Bot has not spawned after ${spawnTimeoutDuration} seconds. Exiting.`;
            log(this.name, msg);
            this.shutdown('Spawn Timeout'); // SAFE SHUTDOWN
        }, spawnTimeoutDuration * 1000);

        this.bot.once('spawn', async () => {
            try {
                if (this.spawnTimeoutTimer) clearTimeout(this.spawnTimeoutTimer);

                // Double check if we are still running before proceeding
                if (!this.running) return;

                addBrowserViewer(this.bot, count_id);
                console.log('Initializing vision intepreter...');
                this.vision_interpreter = new VisionInterpreter(this, settings.allow_vision);

                // wait for a bit so stats are not undefined
                await new Promise((resolve) => setTimeout(resolve, 1000));

                console.log(`${this.name} spawned.`);
                this.clearBotLogs();

                // Task 6: Generate unique world_id and initialize Cognee Memory
                this.world_id = randomUUID();
                console.log(`[Task 6] Generated world_id: ${this.world_id}`);

                try {
                    const cogneeServiceUrl = settings.cognee_service_url || 'http://localhost:8001';
                    this.cogneeMemory = new CogneeMemoryBridge(this, cogneeServiceUrl);
                    await this.cogneeMemory.init();
                    console.log('[Task 6] ✓ Cognee Memory Bridge initialized');

                    // Task 9: Initialize SkillLibrary
                    this.skillLibrary = new SkillLibrary();
                    await this.skillLibrary.init();
                    console.log('[Task 9] ✓ SkillLibrary initialized');

                    // Task 10: Initialize SkillOptimizer
                    this.skillOptimizer = new SkillOptimizer(this, this.skillLibrary);

                    // Task 11: Link optimizer to library for auto-optimization
                    this.skillLibrary.setOptimizer(this.skillOptimizer);
                    console.log('[Task 11] ✓ SkillOptimizer linked for auto-optimization');

                    // Task 12: Reinitialize DualBrain with Cognee context and Skill Catalog
                    this.brain = new DualBrain(this, this.prompter, this.cogneeMemory, this.skillLibrary);
                    console.log('[Task 12] ✓ DualBrain updated with Cognee context and Skill Catalog');
                } catch (err) {
                    console.warn('[Agent] Failed to initialize AI subsystems (Cognee/Skills):', err.message);
                    // Fallback: minimal DualBrain if advanced init fails
                    if (!this.brain) this.brain = new DualBrain(this, this.prompter);
                }

                await this._setupEventHandlers(save_data, init_message);
                this.startEvents();

                // Initialize Dreamer (loads VectorDB)
                this.dreamer.init().catch(err => console.error('Dreamer init failed:', err));

                if (!load_mem) {
                    if (settings.task) {
                        this.task.initBotTask();
                        this.task.setAgentGoal();
                    }
                } else {
                    // set the goal without initializing the rest of the task
                    if (settings.task) {
                        this.task.setAgentGoal();
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, 10000));
                // Only check if still running
                if (this.running) this.checkAllPlayersPresent();

                // Initialize Reflexes (Task 16 & 17)
                this.deathRecovery = new DeathRecovery(this);
                this.watchdog = new Watchdog(this);
                this.watchdog.start();

                // Check for pending recovery on spawn
                await this.deathRecovery.onSpawn();

            } catch (error) {
                console.error('Error in spawn event:', error);
                this.shutdown('Spawn Event Error'); // SAFE SHUTDOWN
            }
        });
    }

    // New helper for safe disconnection logic
    handleSafeDisconnect(type, reason) {
        if (this._disconnectHandled) return;
        this._disconnectHandled = true;

        // Log and Analyze
        const { msg } = handleDisconnection(this.name, reason);
        console.log(`[SafeDisconnect] ${this.name}: ${msg}`);

        this.shutdown(msg);
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

        // Task 35 Fix: Auto-Gear Combat Reflex
        this.bot.on('entityHurt', (entity) => {
            if (entity === this.bot.entity) {
                // If hurt -> Switch to Combat State immediately
                // Priority 80 (Higher than Idle and Build)
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
                // If IDLE for too long -> Trigger HumanManager (Heuristic)
                // This logic will be expanded in Phase 4
                await this.update(start - last);
            } catch (err) {
                console.error('Update loop error:', err);
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
                    // Don't do heavy processing here
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
        if (this.planner) await this.planner.update(); // Task 14: Update Planner
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

    killAll() {
        serverProxy.shutdown();
        this.shutdown('Task Finished');
    }
}