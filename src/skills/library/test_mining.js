/**
 * Skill: test_mining
 * 
 * @description Test skill for mining ores
 * @tags mining, test, ore
 * @metadata {
  "success_count": 0,
  "created_at": 1770282359550,
  "last_optimized": null,
  "version": 1
}
 */

async function testMining(bot, ore = 'iron_ore') {
    const block = bot.findBlock({
        matching: (b) => b.name === ore,
        maxDistance: 32
    });
    
    if (!block) {
        throw new Error(`No ${ore} found`);
    }
    
    await bot.dig(block);
    return `Mined ${ore}`;
}

module.exports = testMining;
