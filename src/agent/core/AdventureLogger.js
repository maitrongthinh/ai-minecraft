import fs from 'fs/promises';
import path from 'path';
import settings from '../../../settings.js';
import { ActionLogger } from '../../utils/ActionLogger.js';
import { sendAdventureLogToServer } from '../mindserver_proxy.js';

export class AdventureLogger {
    constructor(agent, options = {}) {
        this.agent = agent;
        this.enabled = options.enabled ?? true;
        this.maxHistoryEntries = options.maxHistoryEntries ?? 40;
        this.lastLoggedDay = null;
        this.isWriting = false;

        this.adventureDir = path.resolve(process.cwd(), 'bots', this.agent.name, 'adventure');
        this.mainLogPath = path.join(this.adventureDir, 'adventure_log.md');
    }

    async initialize() {
        if (!this.enabled) return;
        await fs.mkdir(this.adventureDir, { recursive: true });
        const day = this._getCurrentDay();
        if (day !== null) {
            this.lastLoggedDay = day;
        }
    }

    async onSunrise() {
        if (!this.enabled || this.isWriting) return;
        const day = this._getCurrentDay();
        if (day === null) return;

        if (this.lastLoggedDay === null) {
            this.lastLoggedDay = day;
            return;
        }

        if (day <= this.lastLoggedDay) return;

        this.isWriting = true;
        try {
            for (let d = this.lastLoggedDay; d < day; d++) {
                await this._writeEntryForDay(d);
            }
            this.lastLoggedDay = day;
        } catch (error) {
            ActionLogger.error('adventure_log_failed', { error: error.message });
        } finally {
            this.isWriting = false;
        }
    }

    _getCurrentDay() {
        const botDay = this.agent?.bot?.time?.day;
        if (typeof botDay === 'number' && Number.isFinite(botDay)) {
            return Math.floor(botDay);
        }
        const ticks = this.agent?.bot?.time?.time;
        if (typeof ticks === 'number' && Number.isFinite(ticks)) {
            return Math.floor(ticks / 24000);
        }
        return null;
    }

    async _writeEntryForDay(dayIndex) {
        const dayNumber = dayIndex + 1;
        const createdAt = new Date().toISOString();
        const summary = await this._generateSummary(dayNumber);
        const screenshotUrl = await this._captureScreenshot(dayNumber);
        const stateLine = this._buildStateLine();
        const objective = this.agent?.config?.profile?.objective || settings.objective || 'Beat Minecraft';

        const markdownLines = [
            `## Day ${dayNumber} (${createdAt})`,
            '',
            summary,
            '',
            `- Objective: ${objective}`,
            `- ${stateLine}`,
            screenshotUrl ? `- Screenshot: ${screenshotUrl}` : '- Screenshot: (unavailable)',
            '',
            screenshotUrl ? `![Day ${dayNumber} snapshot](${screenshotUrl})` : '',
            '',
            '---',
            ''
        ];
        const markdown = markdownLines.filter(Boolean).join('\n');

        await fs.appendFile(this.mainLogPath, markdown, 'utf8');
        await fs.writeFile(path.join(this.adventureDir, `day-${dayNumber}.md`), markdown, 'utf8');

        sendAdventureLogToServer(this.agent.name, {
            day: dayNumber,
            createdAt,
            summary,
            markdown,
            screenshotUrl
        });

        ActionLogger.action('adventure_log_written', {
            agent: this.agent.name,
            day: dayNumber,
            screenshot: Boolean(screenshotUrl)
        });
    }

    _buildStateLine() {
        const bot = this.agent?.bot;
        const p = bot?.entity?.position;
        const health = typeof bot?.health === 'number' ? bot.health.toFixed(1) : '?';
        const food = typeof bot?.food === 'number' ? bot.food.toFixed(1) : '?';
        if (p) {
            return `Position: x=${Math.floor(p.x)} y=${Math.floor(p.y)} z=${Math.floor(p.z)} | Health: ${health}/20 | Hunger: ${food}/20`;
        }
        return `Position: unknown | Health: ${health}/20 | Hunger: ${food}/20`;
    }

    async _generateSummary(dayNumber) {
        const fallback = this._buildFallbackSummary(dayNumber);
        try {
            const historyTurns = this.agent?.history?.getHistory?.() || [];
            const recent = historyTurns.slice(-this.maxHistoryEntries)
                .map(t => `${t.role || 'unknown'}: ${String(t.content || '').replace(/\s+/g, ' ').trim()}`)
                .filter(Boolean)
                .slice(-25);

            const promptTurns = [
                {
                    role: 'system',
                    content: 'You are writing a concise Minecraft adventure journal from the bot first-person perspective. Return 2-4 sentences.'
                },
                {
                    role: 'user',
                    content: `Day ${dayNumber} recap. Recent events:\n${recent.join('\n') || '(no recent events)'}\nWrite a vivid but factual summary.`
                }
            ];

            const summary = await Promise.race([
                this.agent.brain.chat(promptTurns),
                new Promise((_, reject) => setTimeout(() => reject(new Error('summary_timeout')), 15000))
            ]);

            if (typeof summary === 'string' && summary.trim().length > 0 && !summary.includes('Provider temporarily unavailable')) {
                return summary.trim();
            }
        } catch (error) {
            ActionLogger.debug('adventure_summary_fallback', { reason: error.message });
        }
        return fallback;
    }

    _buildFallbackSummary(dayNumber) {
        const bot = this.agent?.bot;
        const inv = bot?.inventory?.items?.() || [];
        const topItems = inv
            .sort((a, b) => b.count - a.count)
            .slice(0, 4)
            .map(i => `${i.count} ${i.name}`)
            .join(', ');

        const biome = bot?.biome?.name || 'unknown biome';
        return `Day ${dayNumber}: I focused on survival progress in ${biome}. ` +
            `I kept moving the objective forward${topItems ? ` and currently carry ${topItems}` : ''}.`;
    }

    async _captureScreenshot(dayNumber) {
        const camera = this.agent?.vision_interpreter?.camera;
        if (!camera || typeof camera.capture !== 'function') {
            return null;
        }

        try {
            const shotId = await camera.capture();
            const src = path.resolve(process.cwd(), 'bots', this.agent.name, 'screenshots', `${shotId}.jpg`);
            const fileName = `day-${dayNumber}-${Date.now()}.jpg`;
            const dst = path.join(this.adventureDir, fileName);
            await fs.copyFile(src, dst);
            return `/bots/${this.agent.name}/adventure/${fileName}`;
        } catch (error) {
            ActionLogger.debug('adventure_screenshot_failed', { error: error.message });
            return null;
        }
    }
}

export default AdventureLogger;
