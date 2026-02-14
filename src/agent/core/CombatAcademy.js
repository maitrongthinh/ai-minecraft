
import { globalBus, SIGNAL } from '../core/SignalBus.js';

export class CombatAcademy {
    constructor(agent) {
        this.agent = agent;
        this.active = false;
        this.sessionStats = {
            fights: 0,
            wins: 0,
            losses: 0
        };
    }

    /**
     * Start a training session.
     * @param {string} mobType - e.g. 'zombie', 'skeleton'
     * @param {number} rounds - Number of rounds to fight
     */
    async startTraining(mobType = 'zombie', rounds = 5) {
        if (this.active) return;
        this.active = true;
        console.log(`[CombatAcademy] 🏫 Starting training session: ${rounds} rounds vs ${mobType}`);

        for (let i = 0; i < rounds; i++) {
            if (!this.active) break;
            console.log(`[CombatAcademy] 🔔 Round ${i + 1}/${rounds}`);

            await this._prepareArena();
            const mob = await this._spawnMob(mobType);

            if (mob) {
                const won = await this._fight(mob);
                if (won) {
                    this.sessionStats.wins++;
                } else {
                    this.sessionStats.losses++;
                }
                this.sessionStats.fights++;

                // Allow EvolutionEngine to process result
                if (this.agent.evolution) {
                    this.agent.evolution.recordCombatResult(won);
                }
            }

            await this._cleanup();
            await new Promise(r => setTimeout(r, 2000)); // Rest between rounds
        }

        this.active = false;
        console.log(`[CombatAcademy] 🏁 Session ended. Stats: ${JSON.stringify(this.sessionStats)}`);
    }

    stop() {
        this.active = false;
    }

    async _prepareArena() {
        // Heal bot before fight
        // Assume in creative/dev env or has food
        if (this.agent.bot.game.gameMode === 'creative') {
            this.agent.bot.chat('/effect give @s instant_health 1 255');
            this.agent.bot.chat('/effect give @s saturation 1 255');
        }
    }

    async _spawnMob(mobType) {
        const bot = this.agent.bot;
        // Spawn 5 blocks away
        const pos = bot.entity.position.offset(5, 0, 0);

        // Command to spawn
        bot.chat(`/summon ${mobType} ${pos.x} ${pos.y} ${pos.z}`);

        // Wait for entity to appear
        return new Promise(resolve => {
            const waitForMob = (entity) => {
                if (entity.name === mobType && entity.position.distanceTo(bot.entity.position) < 10) {
                    bot.removeListener('entitySpawn', waitForMob);
                    resolve(entity);
                }
            };
            bot.on('entitySpawn', waitForMob);

            // Timeout
            setTimeout(() => {
                bot.removeListener('entitySpawn', waitForMob);
                resolve(null);
            }, 5000);
        });
    }

    async _fight(mob) {
        this.agent.reflexes.combat.enterCombat(mob);

        return new Promise(resolve => {
            const checkEnd = setInterval(() => {
                // Win Condition
                if (!mob.isValid || (mob.metadata?.[6] <= 0)) { // Mob dead
                    clearInterval(checkEnd);
                    this.agent.reflexes.combat.exitCombat();
                    resolve(true);
                }
                // Loss Condition
                if (this.agent.bot.health <= 0) {
                    clearInterval(checkEnd);
                    this.agent.reflexes.combat.exitCombat();
                    resolve(false);
                }
            }, 100);
        });
    }

    async _cleanup() {
        // Kill all mobs to reset
        this.agent.bot.chat('/kill @e[type=!player]');
    }

    /**
     * Phase 6: Start PvP Sparring
     * @param {Entity} playerEntity 
     */
    async startPvPTraining(playerEntity) {
        console.log(`[CombatAcademy] ⚔️ Sparring with ${playerEntity.username}`);
        // Equip weak weapon
        const weakWeapons = ['wooden_sword', 'stone_sword', 'stick'];
        const inventory = this.agent.bot.inventory.items();
        const weapon = inventory.find(i => weakWeapons.includes(i.name)) || inventory.find(i => i.name.includes('sword'));

        if (weapon) {
            await this.agent.bot.equip(weapon, 'hand');
        } else {
            // Unequip to use fist
            await this.agent.bot.unequip('hand');
        }

        this.agent.reflexes.combat.enterCombat(playerEntity);
        // TODO: Set a flag in combat reflex to limit aggression/damage
    }
}
