import fs from 'fs';
import path from 'path';

export class HealthMonitor {
    constructor(agent) {
        this.agent = agent;
        this.interval = 10000; // 10 seconds
        this.lockFile = path.resolve('./health.lock');
        this.timer = null;
    }

    start() {
        console.log(`[HealthMonitor] Starting heartbeat on ${this.lockFile}`);
        this.beat();
        this.timer = setInterval(() => this.beat(), this.interval);
    }

    beat() {
        if (!this.agent.running) {
            this.stop();
            return;
        }

        const data = {
            pid: process.pid,
            timestamp: Date.now(),
            name: this.agent.name,
            status: 'HEALTHY'
        };

        try {
            fs.writeFileSync(this.lockFile, JSON.stringify(data), 'utf8');
        } catch (err) {
            console.error('[HealthMonitor] Failed to write heartbeat:', err);
        }
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        try {
            if (fs.existsSync(this.lockFile)) fs.unlinkSync(this.lockFile);
        } catch (e) { }
    }
}
