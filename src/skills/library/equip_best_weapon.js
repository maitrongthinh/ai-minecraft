import { CombatUtils } from '../../utils/CombatUtils.js';

/**
 * Skill: Equip Best Weapon
 */
export default async function equip_best_weapon(agent, options = {}) {
    const bot = agent.bot || agent;
    const { type = 'melee' } = options; // 'melee' or 'range'

    const bestWeapon = CombatUtils.getBestWeapon(bot, type);

    if (!bestWeapon) {
        return { success: false, message: "No suitable weapon found." };
    }

    try {
        await bot.equip(bestWeapon, 'hand');
        return { success: true, message: `Equipped ${bestWeapon.name}` };
    } catch (err) {
        return { success: false, message: `Failed to equip: ${err.message}` };
    }
}
