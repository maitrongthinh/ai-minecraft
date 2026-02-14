

import { AdvancementLadder } from '../../src/agent/core/AdvancementLadder.js';


const mockAgent = {
    bot: {
        inventory: { items: () => [] },
        game: { dimension: 'overworld' }
    },
    brain: { memory: {} }
};

async function testAdvancementLadder() {
    console.log('--- Testing AdvancementLadder ---');
    const ladder = new AdvancementLadder(mockAgent);
    const milestones = ladder.listMilestones();

    console.log(`Total Milestones: ${milestones.length}`);
    if (milestones.length < 50) {
        console.error('❌ Too few milestones found. Expected > 50.');
        process.exit(1);
    }

    const categories = {};
    milestones.forEach(m => {
        categories[m.category] = (categories[m.category] || 0) + 1;
    });

    console.log('Milestones by Category:', categories);

    const requiredCategories = ['story', 'nether', 'end', 'adventure', 'husbandry'];
    for (const cat of requiredCategories) {
        if (!categories[cat]) {
            console.error(`❌ Missing category: ${cat}`);
            process.exit(1);
        }
    }

    // Check dependency chain example
    const diamondPick = ladder.getMilestone('diamond_pickaxe');
    if (!diamondPick || !diamondPick.prerequisites.includes('find_diamonds')) {
        console.error('❌ Dependency check failed for diamond_pickaxe');
        process.exit(1);
    }

    console.log('✅ AdvancementLadder Structure Verified.');
}

testAdvancementLadder().catch(console.error);
