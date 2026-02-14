/**
 * Milestones for the "The End" advancement tab.
 */
export function getEndMilestones(ladder) {
    const milestones = [];

    const add = (id, req, metric, detect, plan) => {
        milestones.push({
            id,
            category: 'end',
            prerequisites: req,
            successMetric: metric,
            detector: detect,
            taskPlan: plan
        });
    };

    // Need 'into_fire' (Blaze Rod) + 'war_pigs' (Pearl)? No, just general progression.
    // We assume 'we_need_to_go_deeper' is a standard prereq connection point

    add('the_end', ['we_need_to_go_deeper'], 'The End?',
        () => ladder.agent.bot.game.dimension === 'the_end',
        [{ type: 'skill', name: 'enter_end_portal', params: {} }]
    );

    add('free_the_end', ['the_end'], 'Free the End',
        () => ladder.agent.brain.memory.dragon_killed === true,
        [{ type: 'skill', name: 'kill_ender_dragon', params: {} }]
    );

    add('the_next_generation', ['free_the_end'], 'The Next Generation',
        () => ladder._countItem('dragon_egg') > 0,
        [{ type: 'action', name: 'gather_nearby', params: { matching: 'dragon_egg', count: 1 } }]
    );

    add('remote_getaway', ['free_the_end'], 'Remote Getaway',
        () => false, // Throw pearl through gateway
        []
    );

    add('the_city_at_the_end_of_the_game', ['remote_getaway'], 'The City at the End of the Game',
        () => ladder.agent.brain.memory.end_city_found === true,
        [{ type: 'skill', name: 'locate_structure', params: { structure: 'end_city' } }]
    );

    add('sky_is_the_limit', ['the_city_at_the_end_of_the_game'], 'Sky\'s the Limit',
        () => ladder._countItem('elytra') > 0,
        [{ type: 'skill', name: 'loot_end_city', params: {} }]
    );

    return milestones;
}
