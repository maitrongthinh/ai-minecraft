/**
 * MCP-Compliant Skill: Defend Position
 * 
 * @skill defend_position
 * @description Defends current position by attacking hostile mobs
 * @tags [combat, defense, survival]
 * @version 1.0.0
 */

export const metadata = {
    name: 'defend_position',
    description: 'Defends current location from hostile mobs',
    parameters: {
        type: 'object',
        properties: {
            duration: {
                type: 'number',
                minimum: 5,
                maximum: 300,
                default: 60,
                description: 'How long to defend (in seconds)'
            },
            radius: {
                type: 'number',
                minimum: 5,
                maximum: 32,
                default: 16,
                description: 'Defense radius in blocks'
            },
            priority: {
                type: 'string',
                enum: ['nearest', 'weakest', 'strongest'],
                default: 'nearest',
                description: 'Target prioritization strategy'
            }
        }
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            mobsDefeated: { type: 'number' },
            timeElapsed: { type: 'number' },
            message: { type: 'string' }
        }
    },
    tags: ['combat', 'defense', 'survival']
};

export default async function execute(agent, params) {
    const { duration = 60, radius = 16, priority = 'nearest' } = params;
    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);

    try {
        console.log(`[defend_position] Defending for ${duration}s...`);

        if (!agent.bot) {
            return {
                success: false,
                mobsDefeated: 0,
                timeElapsed: 0,
                message: 'Bot not initialized'
            };
        }

        let mobsDefeated = 0;
        const centerPos = agent.bot.entity.position.clone();

        // Defense loop
        while (Date.now() < endTime) {
            // Find hostile mobs nearby
            const hostiles = Object.values(agent.bot.entities)
                .filter(e => {
                    if (e === agent.bot.entity) return false;
                    if (!e.name) return false;

                    const hostile = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman']
                        .some(mob => e.name.includes(mob));

                    if (!hostile) return false;

                    const distance = e.position.distanceTo(centerPos);
                    return distance <= radius;
                });

            if (hostiles.length === 0) {
                // No threats, wait a bit
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            // Select target based on priority
            let target = hostiles[0];

            if (priority === 'nearest') {
                target = hostiles.reduce((nearest, mob) => {
                    const dist1 = mob.position.distanceTo(agent.bot.entity.position);
                    const dist2 = nearest.position.distanceTo(agent.bot.entity.position);
                    return dist1 < dist2 ? mob : nearest;
                });
            } else if (priority === 'weakest') {
                target = hostiles.reduce((weakest, mob) => {
                    return (mob.health || 20) < (weakest.health || 20) ? mob : weakest;
                });
            } else if (priority === 'strongest') {
                target = hostiles.reduce((strongest, mob) => {
                    return (mob.health || 20) > (strongest.health || 20) ? mob : strongest;
                });
            }

            // Attack target
            try {
                await agent.bot.attack(target);

                // Check if target is dead
                if (!agent.bot.entities[target.id]) {
                    mobsDefeated++;
                }

                // Brief pause between attacks
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.warn('[defend_position] Attack failed:', error.message);
            }
        }

        const timeElapsed = Math.floor((Date.now() - startTime) / 1000);

        return {
            success: true,
            mobsDefeated,
            timeElapsed,
            message: `Defended position for ${timeElapsed}s, defeated ${mobsDefeated} mobs`
        };

    } catch (error) {
        console.error('[defend_position] Error:', error);
        return {
            success: false,
            mobsDefeated: 0,
            timeElapsed: Math.floor((Date.now() - startTime) / 1000),
            message: `Error: ${error.message}`
        };
    }
}
