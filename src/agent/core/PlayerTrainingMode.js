
import fs from 'fs';
import path from 'path';
import { globalBus, SIGNAL } from './SignalBus.js';

export class PlayerTrainingMode {
    constructor(agent) {
        this.agent = agent;
        this.active = false;
        this.currentTrainee = null; // username
        this.sessionStats = null;
        this.difficulty = 1.0; // 0.5 to 2.0

        this.profilesPath = path.join(process.cwd(), 'bots', agent.name, 'player_profiles');
        if (!fs.existsSync(this.profilesPath)) fs.mkdirSync(this.profilesPath, { recursive: true });
    }

    async startSession(playerName) {
        if (this.active) return false;

        console.log(`[Training] 🥊 Starting sparring session with ${playerName}`);
        this.active = true;
        this.currentTrainee = playerName;
        this.sessionStats = {
            rounds: 0,
            botHits: 0,
            playerHits: 0,
            startTime: Date.now()
        };

        const profile = this._loadProfile(playerName);
        this.difficulty = this._calculateDifficulty(profile);

        // Find player entity
        const playerEntity = this.agent.bot.players[playerName]?.entity;
        if (!playerEntity) {
            this.agent.bot.chat(`I can't see you, ${playerName}. Come closer!`);
            this.active = false;
            return false;
        }

        // Notify CombatReflex to enter training mode
        if (this.agent.reflexes.combat) {
            this.agent.reflexes.combat.setTrainingMode(true, this.difficulty);
        }

        // Start sparring via Academy (equips weapon, enters combat)
        if (this.agent.combatAcademy) {
            await this.agent.combatAcademy.startPvPTraining(playerEntity);
        } else {
            // Fallback
            this.agent.reflexes.combat.enterCombat(playerEntity);
        }

        this.agent.bot.chat(`OK ${playerName}! Sparring mode ON. Difficulty: ${this.difficulty.toFixed(1)}. Say "stop" to end.`);
        return true;
    }

    async endSession() {
        if (!this.active) return;

        console.log(`[Training] 🛑 Ending session with ${this.currentTrainee}`);

        // Save stats
        if (this.currentTrainee) {
            const profile = this._loadProfile(this.currentTrainee);
            this._updateProfile(profile, this.sessionStats);
            this._saveProfile(this.currentTrainee, profile);

            this.agent.bot.chat(`GG! You hit me ${this.sessionStats.playerHits} times. I hit you ${this.sessionStats.botHits} times.`);
        }

        this.active = false;
        this.currentTrainee = null;

        if (this.agent.reflexes.combat) {
            this.agent.reflexes.combat.setTrainingMode(false);
        }
    }

    recordHit(source, target, damage) {
        if (!this.active || !this.sessionStats) return;

        if (source === 'bot' && target === 'player') {
            this.sessionStats.botHits++;
        } else if (source === 'player' && target === 'bot') {
            this.sessionStats.playerHits++;
        }
    }

    _loadProfile(username) {
        const p = path.join(this.profilesPath, `${username}.json`);
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
        return {
            username,
            sessions: 0,
            totalHitsDealt: 0,
            totalHitsTaken: 0,
            winRate: 0, // Simplified
            lastDifficulty: 1.0
        };
    }

    _saveProfile(username, profile) {
        const p = path.join(this.profilesPath, `${username}.json`);
        fs.writeFileSync(p, JSON.stringify(profile, null, 2));
    }

    _updateProfile(profile, stats) {
        profile.sessions++;
        profile.totalHitsDealt += stats.playerHits;
        profile.totalHitsTaken += stats.botHits;
        // Simple difficulty adjustment
        if (stats.playerHits > stats.botHits * 2) profile.lastDifficulty += 0.1;
        else if (stats.botHits > stats.playerHits * 2) profile.lastDifficulty -= 0.1;
        profile.lastDifficulty = Math.max(0.5, Math.min(2.0, profile.lastDifficulty));
    }

    _calculateDifficulty(profile) {
        return profile.lastDifficulty || 1.0;
    }
}
