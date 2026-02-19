
import fs from 'fs';
import path from 'path';
import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * RollbackManager.js
 * 
 * Insurance policy for the Safety Pipeline.
 * - Backs up skills before they are modified.
 * - Monitors skill failure rates.
 * - Automatically reverts skills that fail constantly after an update.
 */
export class RollbackManager {
    constructor(agent) {
        this.agent = agent;
        this.backupDir = path.join(process.cwd(), 'data', 'backups', 'skills');

        // Tracking failures for auto-rollback
        // { skillName: { failures: number, lastFailure: timestamp, trials: number } }
        this.skillHealth = new Map();

        // Thresholds
        this.ROLLBACK_THRESHOLD = 0.8; // 80% failure rate
        this.MIN_TRIALS = 5;          // Minimum attempts before judgment
        this.WINDOW_MS = 1000 * 60 * 60; // 1 Hour window

        this._ensureBackupDir();
        this._setupListeners();
    }

    _ensureBackupDir() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    _setupListeners() {
        // Monitor failures
        globalBus.subscribe(SIGNAL.SKILL_FAILED, this._handleSkillFailure.bind(this));
        globalBus.subscribe(SIGNAL.SKILL_SUCCESS, this._handleSkillSuccess.bind(this));
    }

    /**
     * Create a backup of a skill source file
     * @param {string} skillName 
     * @param {string} sourcePath 
     */
    async backupSkill(skillName, sourcePath) {
        try {
            if (fs.existsSync(sourcePath)) {
                const content = fs.readFileSync(sourcePath, 'utf8');
                const backupPath = path.join(this.backupDir, `${skillName}.js.bak`);
                fs.writeFileSync(backupPath, content);
                console.log(`[RollbackManager] 💾 Backup created for ${skillName}`);

                // Reset health stats on update
                this.skillHealth.set(skillName, { failures: 0, trials: 0 });
            }
        } catch (e) {
            console.error(`[RollbackManager] Failed to backup ${skillName}:`, e);
        }
    }

    /**
     * Restore a skill from backup
     * @param {string} skillName 
     */
    async restoreSkill(skillName, targetPath) {
        try {
            const backupPath = path.join(this.backupDir, `${skillName}.js.bak`);
            if (fs.existsSync(backupPath)) {
                const content = fs.readFileSync(backupPath, 'utf8');
                fs.writeFileSync(targetPath, content);
                console.log(`[RollbackManager] ⏪ REVERTED ${skillName} from backup.`);

                // Reload in registry
                if (this.agent.toolRegistry) {
                    await this.agent.toolRegistry._loadSkill(targetPath);
                }

                // Notify system
                globalBus.emitSignal(SIGNAL.RULE_REVERTED, { rule: skillName, reason: "High failure rate" });

                // Reset stats so we don't loop revert
                this.skillHealth.delete(skillName);
                return true;
            } else {
                console.warn(`[RollbackManager] No backup found for ${skillName}`);
                return false;
            }
        } catch (e) {
            console.error(`[RollbackManager] Restore failed for ${skillName}:`, e);
            return false;
        }
    }

    _handleSkillSuccess(data) {
        const name = data.skill || data.name; // Normalize payload
        if (!name) return;

        const stats = this.skillHealth.get(name) || { failures: 0, trials: 0 };
        stats.trials++;
        this.skillHealth.set(name, stats);
    }

    _handleSkillFailure(data) {
        const name = data.skill || data.name || (data.payload && data.payload.name);
        if (!name) return;

        // Only track dynamic skills (those we have backups for / are compatible with rollback)
        // Checks if backup exists to imply eligibility? Or rely on registry metadata?
        // Simple check: do we have a stats entry? (created on backup) - No, backup might happen earlier.
        // Let's check if backup exists lazily.
        const backupPath = path.join(this.backupDir, `${name}.js.bak`);
        if (!fs.existsSync(backupPath)) return;

        const stats = this.skillHealth.get(name) || { failures: 0, trials: 0 };
        stats.failures++;
        stats.trials++;
        stats.lastFailure = Date.now();
        this.skillHealth.set(name, stats);

        this._checkHealth(name, stats);
    }

    async _checkHealth(name, stats) {
        if (stats.trials < this.MIN_TRIALS) return;

        const failureRate = stats.failures / stats.trials;
        if (failureRate >= this.ROLLBACK_THRESHOLD) {
            console.warn(`[RollbackManager] 🚨 ${name} failure rate ${(failureRate * 100).toFixed(0)}%. Initiating Rollback...`);

            // Find path. Usually in/skills/library/dynamic/ or /library/
            // Agent doesn't store path in health map.
            // Retrieve from ToolRegistry or assume standard path?
            // Safer: Ask ToolRegistry
            const skill = this.agent.toolRegistry?.skills?.get(name);
            let targetPath = null;

            // Try to resolve path
            if (skill && this.agent.toolRegistry.loader) {
                // If using FileLoader, maybe we can find it?
                // HACK: Construct path based on convention for now
                const dynamicPath = path.join(process.cwd(), 'src/skills/library/dynamic', `${name}.js`);
                if (fs.existsSync(dynamicPath)) targetPath = dynamicPath;
                else {
                    const staticPath = path.join(process.cwd(), 'src/skills/library', `${name}.js`);
                    if (fs.existsSync(staticPath)) targetPath = staticPath;
                }
            }

            if (targetPath) {
                await this.restoreSkill(name, targetPath);
            } else {
                console.error(`[RollbackManager] Could not locate file for ${name} to restore.`);
            }
        }
    }
}
