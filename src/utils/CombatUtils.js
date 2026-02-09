
import minecraftData from 'minecraft-data';

// Base damage values (Java Edition 1.16+)
const WEAPON_BASE_DAMAGE = {
    'sword': {
        'netherite': 8, 'diamond': 7, 'iron': 6, 'stone': 5, 'wood': 4, 'gold': 4
    },
    'axe': {
        'netherite': 10, 'diamond': 9, 'iron': 9, 'stone': 9, 'wood': 7, 'gold': 7
    },
    'trident': 9
};

const ATTACK_SPEED = {
    'sword': 1.6,
    'axe': {
        'netherite': 1.0, 'diamond': 1.0, 'iron': 0.9, 'stone': 0.8, 'wood': 0.8, 'gold': 1.0
    },
    'trident': 1.1
};

export class CombatUtils {

    /**
     * Calculate DPS for an item considering enchantments
     * @param {Item} item - Mineflayer item
     * @returns {number} Calculated DPS
     */
    static calculateDPS(item) {
        if (!item) return 0;

        const name = item.name;
        let damage = 1; // Fist deals 1
        let speed = 4.0; // Fist speed

        // 1. Identify Base Stats
        if (name.includes('sword')) {
            const material = name.split('_')[0];
            damage = WEAPON_BASE_DAMAGE.sword[material] || 4;
            speed = ATTACK_SPEED.sword;
        } else if (name.includes('axe')) {
            const material = name.split('_')[0];
            damage = WEAPON_BASE_DAMAGE.axe[material] || 7;
            speed = ATTACK_SPEED.axe[material] || 0.8;
        } else if (name.includes('trident')) {
            damage = WEAPON_BASE_DAMAGE.trident;
            speed = ATTACK_SPEED.trident;
        } else {
            return 1; // Not a weapon
        }

        // 2. Apply Enchantments
        if (item.nbt && item.nbt.value && item.nbt.value.Enchantments) {
            const enchants = item.nbt.value.Enchantments.value.value || []; // nbt structure is complex
            // Simplified NBT parsing (mineflayer typically processes this into .enchants array)

            // Check if mineflayer provided enchants array
            if (item.enchants) {
                for (const ench of item.enchants) {
                    // Sharpness (id: "sharpness" or 16)
                    if (ench.name === 'sharpness') {
                        // Java 1.16+: 0.5 * lvl + 0.5
                        damage += 0.5 * ench.lvl + 0.5;
                    }
                }
            }
        }

        return damage * speed;
    }

    /**
     * Get best weapon from inventory
     * @param {Bot} bot 
     * @param {string} mode - 'melee' or 'range'
     */
    static getBestWeapon(bot, mode = 'melee') {
        const items = bot.inventory.items();
        let bestWeapon = null;
        let bestScore = -1;

        for (const item of items) {
            let score = 0;

            if (mode === 'melee') {
                if (item.name.includes('sword') || item.name.includes('axe') || item.name.includes('trident')) {
                    score = this.calculateDPS(item);
                }
            } else if (mode === 'range') {
                if (item.name.includes('bow') || item.name.includes('crossbow')) {
                    score = 10; // Base score
                    // Add enchantment bonuses
                    if (item.enchants) {
                        item.enchants.forEach(e => {
                            if (e.name === 'power') score += e.lvl * 2;
                            if (e.name === 'infinity') score += 5;
                        });
                    }
                    if (item.name === 'crossbow') score += 1; // Preference?
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestWeapon = item;
            }
        }
        return bestWeapon;
    }

    /**
     * Get food priority score
     * Higher is better
     */
    static getFoodScore(item, currentHealth = 20) {
        if (!item) return -1;
        const name = item.name;

        // Harmful foods
        if (name === 'rotten_flesh') return currentHealth < 6 ? 1 : -10; // Only eat if critical
        if (name === 'spider_eye') return -20;
        if (name === 'pufferfish') return -50;
        if (name === 'poisonous_potato') return -5;
        if (name === 'chicken') return -2; // Raw chicken chance of hunger

        // Emergency Foods
        if (name === 'enchanted_golden_apple') return currentHealth < 10 ? 100 : 5; // Save for low health
        if (name === 'golden_apple') return currentHealth < 12 ? 50 : 4;

        // Standard Foods (Score = Food Points + Saturation)
        // Approximate values as we might not have mcData loaded here perfectly
        const foodValues = {
            'cooked_beef': 12.8 + 8,     // Saturation + Hunger
            'cooked_porkchop': 12.8 + 8,
            'golden_carrot': 14.4 + 6,
            'cooked_mutton': 9.6 + 6,
            'cooked_chicken': 7.2 + 6,
            'bread': 6 + 5,
            'baked_potato': 6 + 5,
            'carrot': 3.6 + 3,
            'apple': 2.4 + 4,
            'melon_slice': 1.2 + 2
        };

        return foodValues[name] || 1;
    }
}
