import { CombatUtils } from '../../utils/CombatUtils.js';

export const metadata = {
    name: 'equip_best_weapon',
    description: 'Equips the best available weapon for melee or ranged combat.',
    parameters: {
        type: 'object',
        properties: {
            type: {
                type: 'string',
                enum: ['melee', 'range'],
                default: 'melee',
                description: 'Type of weapon to equip'
            }
        }
    },
    tags: ['combat', 'inventory']
};

export default async function equip_best_weapon(agent, options = {}) {
    const bot = agent.bot || agent;
    const { type = 'melee' } = options; // 'melee' or 'range'

    const bestWeapon = CombatUtils.getBestWeapon(bot, type);

    if (!bestWeapon) {
        return { success: false, message: "No suitable weapon found." };
    }

    try {
        if (agent.actionAPI) {
            const result = await agent.actionAPI.equip({
                itemName: bestWeapon.name,
                slot: 'hand'
            });
            return {
                success: result.success,
                message: result.success ? `Equipped ${bestWeapon.name}` : result.error
            };
        } else {
            await bot.equip(bestWeapon, 'hand');
            return { success: true, message: `Equipped ${bestWeapon.name}` };
        }
    } catch (err) {
        return { success: false, message: `Failed to equip: ${err.message}` };
    }
}
