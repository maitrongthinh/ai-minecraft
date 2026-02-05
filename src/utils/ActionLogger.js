/**
 * ActionLogger.js
 * 
 * Centralized file-based logging system for all bot actions.
 * Creates daily rotated log files in logs/ directory.
 * 
 * Categories:
 * - API: AI model requests/responses
 * - ACTION: Bot actions (mine, craft, move)
 * - SKILL: Skill learning/optimization
 * - MEMORY: Cognee store/recall
 * - REFLEX: Death recovery, watchdog
 * - ERROR: Errors and exceptions
 * - DEBUG: Debug commands and status
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.resolve(__dirname, '../../logs');

class ActionLogger {
    constructor() {
        this.buffer = [];
        this.flushInterval = 5000; // 5 seconds
        this.maxBufferSize = 10;
        this.enabled = true;
        this.verboseMode = false;

        this.ensureLogsDir();
        this.startFlushTimer();

        console.log('[ActionLogger] Initialized. Logs will be saved to:', LOGS_DIR);
    }

    ensureLogsDir() {
        if (!fs.existsSync(LOGS_DIR)) {
            fs.mkdirSync(LOGS_DIR, { recursive: true });
        }
    }

    getLogFilePath() {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return path.join(LOGS_DIR, `${date}.log`);
    }

    /**
     * Log an event
     * @param {string} category - API, ACTION, SKILL, MEMORY, REFLEX, ERROR, DEBUG
     * @param {string} event - Event name
     * @param {object} data - Additional data
     * @param {string} worldId - Optional world ID
     */
    log(category, event, data = {}, worldId = null) {
        if (!this.enabled) return;

        const entry = {
            timestamp: new Date().toISOString(),
            category: category.toUpperCase(),
            event,
            data,
            world_id: worldId,
            request_id: data.requestId || null // Task 29: Link Vision -> Thought -> Action
        };

        this.buffer.push(entry);

        // Console output for verbose mode or errors
        if (this.verboseMode || category === 'ERROR') {
            console.log(`[ActionLogger][${category}] ${event}:`, JSON.stringify(data).substring(0, 200));
        }

        // Auto-flush if buffer is full
        if (this.buffer.length >= this.maxBufferSize) {
            this.flush();
        }
    }

    // Convenience methods
    api(event, data, worldId) { this.log('API', event, data, worldId); }
    action(event, data, worldId) { this.log('ACTION', event, data, worldId); }
    skill(event, data, worldId) { this.log('SKILL', event, data, worldId); }
    memory(event, data, worldId) { this.log('MEMORY', event, data, worldId); }
    reflex(event, data, worldId) { this.log('REFLEX', event, data, worldId); }
    error(event, data, worldId) { this.log('ERROR', event, data, worldId); }
    debug(event, data, worldId) { this.log('DEBUG', event, data, worldId); }

    flush() {
        if (this.buffer.length === 0) return;

        const logPath = this.getLogFilePath();
        const lines = this.buffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';

        try {
            fs.appendFileSync(logPath, lines, 'utf8');
            this.buffer = [];
        } catch (err) {
            console.error('[ActionLogger] Failed to write logs:', err.message);
        }
    }

    startFlushTimer() {
        setInterval(() => this.flush(), this.flushInterval);
    }

    setVerbose(enabled) {
        this.verboseMode = enabled;
        console.log(`[ActionLogger] Verbose mode: ${enabled ? 'ON' : 'OFF'}`);
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`[ActionLogger] Logging: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Get statistics from today's log
     */
    getStats() {
        const logPath = this.getLogFilePath();
        if (!fs.existsSync(logPath)) {
            return { total: 0, byCategory: {} };
        }

        try {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.trim().split('\n').filter(l => l);
            const stats = { total: lines.length, byCategory: {} };

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    const cat = entry.category || 'UNKNOWN';
                    stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
                } catch { }
            }

            return stats;
        } catch (err) {
            return { total: 0, byCategory: {}, error: err.message };
        }
    }

    /**
     * Get recent log entries
     * @param {number} count - Number of entries to return
     */
    getRecent(count = 10) {
        const logPath = this.getLogFilePath();
        if (!fs.existsSync(logPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.trim().split('\n').filter(l => l);
            return lines.slice(-count).map(l => {
                try { return JSON.parse(l); } catch { return { raw: l }; }
            });
        } catch (err) {
            return [];
        }
    }
}

// Singleton instance
const logger = new ActionLogger();

export { logger as ActionLogger };
export default logger;
