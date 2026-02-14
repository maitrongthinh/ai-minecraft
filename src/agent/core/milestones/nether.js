/**
 * Milestones for the "Nether" advancement tab.
 */
export function getNetherMilestones(ladder) {
    const milestones = [];

    const add = (id, req, metric, detect, plan) => {
        milestones.push({
            id,
            category: 'nether',
            prerequisites: req,
            successMetric: metric,
            detector: detect,
            taskPlan: plan
        });
    };

    add('return_to_sender', ['we_need_to_go_deeper'], 'Return to Sender',
        () => false, // Kill Ghast with fireball
        []
    );

    add('those_were_the_days', ['we_need_to_go_deeper'], 'Those Were the Days',
        () => false, // Find Bastion
        [{ type: 'skill', name: 'locate_structure', params: { structure: 'bastion_remnant' } }]
    );

    add('hidden_in_the_depths', ['we_need_to_go_deeper'], 'Hidden in the Depths',
        () => ladder._countItem('ancient_debris') > 0,
        [{ type: 'skill', name: 'mine_ancient_debris', params: { count: 1 } }]
    );

    add('subspace_bubble', ['we_need_to_go_deeper'], 'Subspace Bubble',
        () => false, // Use Nether to travel 7km in Overworld
        []
    );

    add('a_terrible_fortress', ['we_need_to_go_deeper'], 'A Terrible Fortress',
        () => ladder.agent.brain.memory.fortress_location != null,
        [{ type: 'skill', name: 'locate_structure', params: { structure: 'fortress' } }]
    );

    add('who_is_cutting_onions', ['we_need_to_go_deeper'], 'Who is Cutting Onions?',
        () => ladder._countItem('crying_obsidian') > 0,
        [{ type: 'action', name: 'gather_nearby', params: { matching: 'crying_obsidian', count: 1 } }]
    );

    add('not_quite_nine_lives', ['we_need_to_go_deeper'], 'Not Quite Nine Lives',
        () => false, // Charge Respawn Anchor to max
        []
    );

    add('this_boat_has_legs', ['we_need_to_go_deeper'], 'This Boat Has Legs',
        () => false, // Ride Strider
        []
    );

    add('uneasy_alliance', ['return_to_sender'], 'Uneasy Alliance',
        () => false, // Rescue Ghast to Overworld
        []
    );

    add('war_pigs', ['those_were_the_days'], 'War Pigs',
        () => false, // Loot Bastion Chest
        []
    );

    add('country_lode_take_me_home', ['hidden_in_the_depths'], 'Country Lode, Take Me Home',
        () => false, // Use Lodestone
        []
    );

    add('cover_me_in_debris', ['hidden_in_the_depths'], 'Cover Me in Debris',
        () => ladder._hasAny(['netherite_chestplate', 'netherite_leggings', 'netherite_boots', 'netherite_helmet']),
        [{ type: 'action', name: 'craft_netherite', params: {} }]
    );

    add('spooky_scary_skeleton', ['a_terrible_fortress'], 'Spooky Scary Skeleton',
        () => ladder._countItem('wither_skeleton_skull') > 0,
        [{ type: 'skill', name: 'combat_hunt', params: { mobType: 'wither_skeleton', count: 1 } }]
    );

    add('into_fire', ['a_terrible_fortress'], 'Into Fire',
        () => ladder._countItem('blaze_rod') > 0,
        [{ type: 'skill', name: 'combat_hunt', params: { mobType: 'blaze', count: 1 } }]
    );

    add('withering_heights', ['spooky_scary_skeleton'], 'Withering Heights',
        () => ladder._countItem('nether_star') > 0,
        [{ type: 'action', name: 'combat', params: { target: 'wither' } }]
    );

    add('local_brewery', ['into_fire'], 'Local Brewery',
        () => ladder._countItem('potion') > 0, // Simplified check
        [{ type: 'action', name: 'brew_potion', params: {} }]
    );

    add('bring_home_the_beacon', ['withering_heights'], 'Bring Home the Beacon',
        () => ladder._countItem('beacon') > 0,
        [{ type: 'action', name: 'craft', params: { itemName: 'beacon' } }]
    );

    return milestones;
}
