/**
 * Skill: gather_wood
 * 
 * @description Gathers wood from nearest tree using efficient pathfinding
 * @tags wood, gather, tree, resource
 * @metadata {
  "success_count": 0,
  "created_at": 1738750000000,
  "last_optimized": null,
  "version": 1
}
 */

async function gatherWood(bot, count = 10) {
    const { Goal } = require('mineflayer-pathfinder');
    const { checkInventorySpace } = require('../../utils/mcdata.js');
    checkInventorySpace(bot);
    const Vec3 = require('vec3');

    // Find nearest log block
    const log = bot.findBlock({
        matching: block => block.name.includes('log'),
        maxDistance: 64
    });

    if (!log) {
        throw new Error('No trees found nearby');
    }

    // Move to tree
    const goal = new Goal.GoalNear(log.position, 2);
    await bot.pathfinder.goto(goal);

    // Dig logs
    for (let i = 0; i < count; i++) {
        const nextLog = bot.findBlock({
            matching: block => block.name.includes('log'),
            maxDistance: 5
        });

        if (!nextLog) break;

        await bot.dig(nextLog);
    }

    return `Gathered wood logs`;
}

module.exports = gatherWood;
