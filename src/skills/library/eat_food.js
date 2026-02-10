import { CombatUtils } from '../../utils/CombatUtils.js';

export default async function eat_food(agent, options = {}) {
    const bot = agent.bot || agent;
    const { priority_only = true } = options;

    const food = bot.inventory.items().filter(item => CombatUtils.getFoodScore(item, bot.health) > 0 || !priority_only);

    if (food.length === 0) {
        return { success: false, message: "No food found in inventory." };
    }

    // Sort by Food Score (Saturation + Hunger)
    // Avoids rotten flesh unless desperate
    const currentHealth = bot.health;
    food.sort((a, b) => {
        const scoreA = CombatUtils.getFoodScore(a, currentHealth);
        const scoreB = CombatUtils.getFoodScore(b, currentHealth);
        return scoreB - scoreA;
    });

    const bestFood = food[0];
    const bestScore = CombatUtils.getFoodScore(bestFood, currentHealth);

    // Safety Check: Don't eat poison if healthy
    if (bestScore < 0 && currentHealth > 6) {
        return { success: false, message: "Only harmful food available. Saving for emergency." };
    }

    try {
        await bot.equip(bestFood, 'hand');
        await bot.consume();
        return { success: true, message: `Ate ${bestFood.name}` };
    } catch (err) {
        return { success: false, message: `Failed to eat: ${err.message}` };
    }
}
