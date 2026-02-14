/**
 * Milestones for the "Adventure" advancement tab.
 */
export function getAdventureMilestones(ladder) {
    const milestones = [];

    const add = (id, req, metric, detect, plan) => {
        milestones.push({
            id,
            category: 'adventure',
            prerequisites: req,
            successMetric: metric,
            detector: detect,
            taskPlan: plan
        });
    };

    add('voluntary_exile', [], 'Voluntary Exile',
        () => false, // Kill Raid Captain
        []
    );

    add('monster_hunter', [], 'Monster Hunter',
        () => ladder._countItem('bone') > 0 || ladder._countItem('rotten_flesh') > 0, // Simplified
        [{ type: 'skill', name: 'combat_hunt', params: { mobType: ['zombie', 'skeleton', 'spider'], count: 1 } }]
    );

    add('sweet_dreams', [], 'Sweet Dreams',
        () => false, // Sleep in bed
        [{ type: 'action', name: 'sleep', params: {} }]
    );

    add('hero_of_the_village', ['voluntary_exile'], 'Hero of the Village',
        () => false, // Finish raid
        []
    );

    add('adventuring_time', [], 'Adventuring Time',
        () => false, // Visit all biomes
        [{ type: 'action', name: 'explore', params: { radius: 2000 } }]
    );

    add('trade_villager', [], 'What a Deal!',
        () => ladder.agent.brain.memory.villager_traded === true,
        [{ type: 'action', name: 'trade', params: { npc: 'villager' } }]
    );

    add('hired_help', [], 'Hired Help',
        () => false, // Summon Iron Golem
        [{ type: 'action', name: 'place_structure', params: { structure: 'iron_golem' } }]
    );

    add('sticky_situation', [], 'Sticky Situation',
        () => false, // Jump into honey block to break fall
        []
    );

    add('ol_betsy', [], 'Ol\' Betsy',
        () => ladder._countItem('crossbow') > 0,
        [{ type: 'action', name: 'craft', params: { itemName: 'crossbow' } }]
    );

    add('who_is_the_pillager_now', ['ol_betsy'], 'Who is the Pillager Now?',
        () => false, // Kill Pillager with Crossbow
        [{ type: 'skill', name: 'combat_hunt', params: { mobType: 'pillager', weapon: 'crossbow' } }]
    );

    return milestones;
}
