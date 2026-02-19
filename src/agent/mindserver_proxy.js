import { io } from 'socket.io-client';
import convoManager, { setBotChatTransport } from './conversation.js';
import settings from '../../settings.js';
import { getFullState } from './library/full_state.js';

// agent's individual connection to the mindserver
// always connect to localhost

class MindServerProxy {
    constructor() {
        if (MindServerProxy.instance) {
            return MindServerProxy.instance;
        }

        this.socket = null;
        this.connected = false;
        this.agents = [];
        MindServerProxy.instance = this;
    }

    async connect(name, port) {
        if (this.connected) return;

        this.name = name;
        const token = process.env.MINDSERVER_TOKEN;
        const options = token ? { auth: { token } } : undefined;
        this.socket = io(`http://localhost:${port}`, options);

        await new Promise((resolve, reject) => {
            this.socket.on('connect', resolve);
            this.socket.on('connect_error', (err) => {
                console.error('Connection failed:', err);
                reject(err);
            });
        });

        this.connected = true;
        console.log(name, 'connected to MindServer');

        this.socket.on('disconnect', () => {
            console.log('Disconnected from MindServer');
            this.connected = false;
            if (this.agent) {
                void this.agent.shutdown('Disconnected from MindServer. Shutting down agent process.');
            }
        });

        this.socket.on('chat-message', (agentName, json) => {
            convoManager.receiveFromBot(agentName, json);
        });

        this.socket.on('agents-status', (agents) => {
            this.agents = agents;
            convoManager.updateAgents(agents);
            if (this.agent?.task) {
                console.log(this.agent.name, 'updating available agents');
                this.agent.task.updateAvailableAgents(agents);
            }
        });

        this.socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            if (this.agent) {
                void this.agent.shutdown('Restart requested by MindServer.');
            }
        });

        this.socket.on('send-message', (data) => {
            try {
                this.agent.handleMessage(data.from, data.message);
            } catch (error) {
                console.error('Error: ', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            }
        });

        this.socket.on('get-full-state', (callback) => {
            try {
                const state = getFullState(this.agent, this.agents);
                callback(state);
            } catch (error) {
                console.error('Error getting full state:', error);
                callback(null);
            }
        });

        // Request settings and wait for response
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Settings request timed out after 5 seconds'));
            }, 5000);

            this.socket.emit('get-settings', name, (response) => {
                clearTimeout(timeout);
                if (response.error) {
                    return reject(new Error(response.error));
                }
                Object.assign(settings, response.settings);
                this.socket.emit('connect-agent-process', name);
                resolve();
            });
        });
    }

    setAgent(agent) {
        this.agent = agent;
    }

    getAgents() {
        return this.agents;
    }

    getNumOtherAgents() {
        return this.agents.length - 1;
    }

    login() {
        this.socket.emit('login-agent', this.agent.name);
    }

    shutdown() {
        this.socket.emit('shutdown');
    }

    getSocket() {
        return this.socket;
    }
}

// Create and export a singleton instance
export const serverProxy = new MindServerProxy();
setBotChatTransport((agentName, json) => sendBotChatToServer(agentName, json));

// for chatting with other bots
export function sendBotChatToServer(agentName, json) {
    const socket = serverProxy.getSocket();
    if (!socket) {
        console.warn('[MindServerProxy] Cannot send bot chat: socket unavailable');
        return false;
    }
    socket.emit('chat-message', agentName, json);
    return true;
}

function emitToServer(eventName, ...args) {
    const socket = serverProxy.getSocket();
    if (!socket) {
        console.warn(`[MindServerProxy] Cannot emit '${eventName}': socket unavailable`);
        return false;
    }
    socket.emit(eventName, ...args);
    return true;
}

// for sending general output to server for display
export function sendOutputToServer(agentName, message) {
    return emitToServer('bot-output', agentName, message);
}

// for sending internal thoughts/plans to server for display
export function sendThoughtToServer(agentName, thought) {
    return emitToServer('bot-thought', agentName, thought);
}

// for sending structured planner/critic/executor traces
export function sendSystem2TraceToServer(agentName, trace) {
    return emitToServer('system2-trace', agentName, trace);
}

// for sending daily adventure logs to dashboard
export function sendAdventureLogToServer(agentName, entry) {
    return emitToServer('adventure-log', agentName, entry);
}
