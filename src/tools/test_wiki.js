/**
 * Test: Phase 6 - Minecraft Wiki Scraper
 * 
 * Run: node src/tools/test_wiki.js
 */

import { MinecraftWiki } from './MinecraftWiki.js';

console.log('='.repeat(60));
console.log('  Phase 6: External Knowledge Verification');
console.log('='.repeat(60) + '\n');

const wiki = new MinecraftWiki(null); // No agent needed for scraping

async function runTests() {
    // --- Test 1: Recipe Search ---
    console.log('[1/3] Testing Recipe Search (Iron Pickaxe)...');
    try {
        const recipe = await wiki.searchRecipe("iron_pickaxe");
        if (recipe && recipe.recipes && recipe.recipes.length > 0) {
            console.log('  ✓ Recipe found:', recipe.recipes[0].output);
            console.log('    Ingredients:', recipe.recipes[0].ingredients.join(', '));
        } else {
            console.log('  ✗ Recipe NOT found or parse error');
            console.log('    Result:', recipe);
        }
    } catch (err) {
        console.error('  ✗ Error:', err);
    }

    // --- Test 2: Mob Info ---
    console.log('\n[2/3] Testing Mob Info (Zombie)...');
    try {
        const mob = await wiki.getMobInfo("zombie");
        if (mob && mob.hp) {
            console.log('  ✓ Mob info found:', mob.name);
            console.log('    HP:', mob.hp);
        } else {
            console.log('  ✗ Mob info NOT found or parse error');
            console.log('    Result:', mob);
        }
    } catch (err) {
        console.error('  ✗ Error:', err);
    }

    // --- Test 3: Caching ---
    console.log('\n[3/3] Testing Cache...');
    const start = Date.now();
    await wiki.searchRecipe("iron_pickaxe"); // Same search
    const end = Date.now();
    const duration = end - start;

    // Should be instant (< 50ms)
    if (duration < 50) {
        console.log(`  ✓ Cache HIT (Duration: ${duration}ms)`);
    } else {
        console.log(`  ⚠ Cache MISS or Slow IO (Duration: ${duration}ms)`);
    }
}

runTests();
