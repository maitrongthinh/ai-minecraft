/**
 * DebugCommands.js
 * 
 * In-game debug command interface for controlling and monitoring bot.
 * Commands are triggered via Minecraft chat with "!debug" prefix.
 * 
 * Available Commands:
 * - !debug status      → Show system status
 * - !debug budget      → Show API budget remaining
 * - !debug memory query <text> → Test Cognee recall
 * - !debug skill list  → List loaded skills
 * - !debug log on/off  → Toggle verbose logging
 * - !debug watchdog on/off → Toggle watchdog
 * - !debug stats       → Show log statistics
 */

import { ActionLogger } from '../../utils/ActionLogger.js';

export class DebugCommands {
    constructor(agent) {
        this.agent = agent;
    }

    /**
     * Check if message is a debug command
     * @param {string} message 
     * @returns {boolean}
     */
    isDebugCommand(message) {
        return message.toLowerCase().startsWith('!debug');
    }

    /**
     * Handle debug command and return response
     * @param {string} message 
     * @returns {Promise<string>}
     */
    async handle(message) {
        const parts = message.substring(6).trim().split(' '); // Remove "!debug"
        const cmd = parts[0]?.toLowerCase() || 'help';
        const args = parts.slice(1);

        ActionLogger.debug('command_received', { cmd, args });

        try {
            switch (cmd) {
                case 'status':
                    return this.getStatus();
                case 'budget':
                    return this.getBudget();
                case 'memory':
                    return await this.handleMemory(args);
                case 'skill':
                    return this.handleSkill(args);
                case 'log':
                    return this.handleLog(args);
                case 'watchdog':
                    return this.handleWatchdog(args);
                case 'stats':
                    return this.getStats();
                case 'help':
                default:
                    return this.getHelp();
            }
        } catch (err) {
            ActionLogger.error('debug_command_failed', { cmd, error: err.message });
            return `❌ Error: ${err.message}`;
        }
    }

    getStatus() {
        const brain = this.agent.brain;
        const cognee = this.agent.cogneeMemory;
        const skills = this.agent.skillLibrary;
        const watchdog = this.agent.watchdog;

        const status = [
            '📊 **SYSTEM STATUS**',
            `🧠 Model: ${brain?.model?.model || 'Unknown'}`,
            `💰 Budget: ${brain?.requestCount || 0}/${brain?.limit || 200}`,
            `🌍 World ID: ${this.agent.world_id || 'Not set'}`,
            `📚 Cognee: ${cognee ? '✅ Connected' : '❌ Offline'}`,
            `🔧 Skills: ${skills ? (skills.skills?.size || 0) + ' loaded' : '❌ Not init'}`,
            `👁 Watchdog: ${watchdog?.enabled ? '✅ Active' : '⏸ Disabled'}`,
        ];

        return status.join('\n');
    }

    getBudget() {
        const brain = this.agent.brain;
        if (!brain) return '❌ Brain not initialized';

        const used = brain.requestCount || 0;
        const limit = brain.limit || 200;
        const remaining = limit - used;
        const pct = Math.round((used / limit) * 100);

        const windowReset = new Date(brain.windowStart + brain.windowSize);

        return [
            '💰 **API BUDGET**',
            `Used: ${used}/${limit} (${pct}%)`,
            `Remaining: ${remaining} requests`,
            `Window resets: ${windowReset.toLocaleTimeString()}`
        ].join('\n');
    }

    async handleMemory(args) {
        if (args[0] !== 'query' || !args.slice(1).length) {
            return '❓ Usage: !debug memory query <text>';
        }

        const queryText = args.slice(1).join(' ');
        const cognee = this.agent.cogneeMemory;

        if (!cognee) {
            return '❌ Cognee Memory not initialized';
        }

        try {
            const result = await cognee.recall(this.agent.world_id, queryText, 5);
            if (result.success && result.count > 0) {
                return `📝 **MEMORY RESULTS (${result.count})**\n${result.results.join('\n')}`;
            } else {
                return '📝 No relevant memories found';
            }
        } catch (err) {
            return `❌ Memory query failed: ${err.message}`;
        }
    }

    handleSkill(args) {
        if (args[0] !== 'list') {
            return '❓ Usage: !debug skill list';
        }

        const skills = this.agent.skillLibrary;
        if (!skills || !skills.skills) {
            return '❌ SkillLibrary not initialized';
        }

        if (skills.skills.size === 0) {
            return '📚 No skills loaded';
        }

        const list = [];
        for (const [name, skill] of skills.skills) {
            list.push(`• ${name} (${skill.successCount || 0} uses)`);
        }

        return `📚 **SKILLS (${list.length})**\n${list.join('\n')}`;
    }

    handleLog(args) {
        const mode = args[0]?.toLowerCase();

        if (mode === 'on') {
            ActionLogger.setVerbose(true);
            return '📝 Verbose logging: ON';
        } else if (mode === 'off') {
            ActionLogger.setVerbose(false);
            return '📝 Verbose logging: OFF';
        } else {
            return '❓ Usage: !debug log on/off';
        }
    }

    handleWatchdog(args) {
        const mode = args[0]?.toLowerCase();
        const watchdog = this.agent.watchdog;

        if (!watchdog) {
            return '❌ Watchdog not initialized';
        }

        if (mode === 'on') {
            watchdog.enabled = true;
            ActionLogger.reflex('watchdog_enabled', {});
            return '👁 Watchdog: ENABLED';
        } else if (mode === 'off') {
            watchdog.enabled = false;
            ActionLogger.reflex('watchdog_disabled', {});
            return '👁 Watchdog: DISABLED';
        } else {
            return `❓ Usage: !debug watchdog on/off\nCurrent: ${watchdog.enabled ? 'ON' : 'OFF'}`;
        }
    }

    getStats() {
        const stats = ActionLogger.getStats();
        const lines = [`📈 **LOG STATS (Today)**`, `Total entries: ${stats.total}`];

        if (stats.byCategory) {
            for (const [cat, count] of Object.entries(stats.byCategory)) {
                lines.push(`• ${cat}: ${count}`);
            }
        }

        return lines.join('\n');
    }

    getHelp() {
        return [
            '🔧 **DEBUG COMMANDS**',
            '• !debug status - System overview',
            '• !debug budget - API budget',
            '• !debug memory query <text> - Test recall',
            '• !debug skill list - List skills',
            '• !debug log on/off - Toggle verbose',
            '• !debug watchdog on/off - Toggle watchdog',
            '• !debug stats - Log statistics'
        ].join('\n');
    }
}
