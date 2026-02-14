/**
 * Milestones for the "Husbandry" advancement tab.
 */
export function getHusbandryMilestones(ladder) {
    const milestones = [];

    const add = (id, req, metric, detect, plan) => {
        milestones.push({
            id,
            category: 'husbandry',
            prerequisites: req,
            successMetric: metric,
            detector: detect,
            taskPlan: plan
        });
    };

    add('root_husbandry', [], 'Husbandry',
        () => ladder._countItem('wheat_seeds') > 0,
        [{ type: 'action', name: 'gather_nearby', params: { matching: 'wheat_seeds', count: 1 } }]
    );

    add('a_seedy_place', ['root_husbandry'], 'A Seedy Place',
        () => ladder._countItem('wheat') > 0,
        [{ type: 'skill', name: 'farming', params: { action: 'plant', crop: 'wheat' } }]
    );

    add('tactical_fishing', ['root_husbandry'], 'Tactical Fishing',
        () => ladder._countItem('cod') > 0, // or salmon, etc
        [{ type: 'action', name: 'fishing', params: {} }]
    );

    add('best_friends_forever', ['root_husbandry'], 'Best Friends Forever',
        () => false, // Tame animal
        []
    );

    add('breed_pig', ['root_husbandry'], 'Breed Pig',
        () => false,
        [{ type: 'skill', name: 'farming', params: { action: 'breed', animal: 'pig' } }]
    );

    add('breed_chicken', ['root_husbandry'], 'Breed Chicken',
        () => false,
        [{ type: 'skill', name: 'farming', params: { action: 'breed', animal: 'chicken' } }]
    );

    add('plant_carrot', ['root_husbandry'], 'Plant Carrot',
        () => ladder._countItem('carrot') > 0,
        [{ type: 'skill', name: 'farming', params: { action: 'plant', crop: 'carrot' } }]
    );

    add('plant_potato', ['root_husbandry'], 'Plant Potato',
        () => ladder._countItem('potato') > 0,
        [{ type: 'skill', name: 'farming', params: { action: 'plant', crop: 'potato' } }]
    );

    add('tame_wolf', ['root_husbandry'], 'Tame Wolf',
        () => false,
        [{ type: 'action', name: 'interact_entity', params: { target: 'wolf', item: 'bone' } }]
    );

    return milestones;
}
