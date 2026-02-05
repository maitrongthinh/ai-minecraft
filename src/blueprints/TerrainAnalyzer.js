
import { Vec3 } from 'vec3';

export class TerrainAnalyzer {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Analyze the terrain for a blueprint at a specific position
     * @param {Object} blueprint - The blueprint object with .blocks [[[...]]]
     * @param {Vec3} startPos - The bottom-north-west corner of the build
     * @returns {Object} Analysis result { obstructionCount, foundationCount, obstructions: [], foundations: [] }
     */
    analyze(blueprint, startPos) {
        const result = {
            obstructionCount: 0,
            foundationCount: 0,
            obstructions: [], // Blocks that need to be removed (trees, dirt)
            foundations: []   // Positions that need filling (air, water) below the build
        };

        if (!blueprint.blocks) return result;

        const sizeY = blueprint.blocks.length;
        const sizeZ = blueprint.blocks[0].length;
        const sizeX = blueprint.blocks[0][0].length;

        // 1. Check for Obstructions (Blocks inside the build area)
        for (let y = 0; y < sizeY; y++) {
            for (let z = 0; z < sizeZ; z++) {
                for (let x = 0; x < sizeX; x++) {
                    // If blueprint has a block here
                    if (blueprint.blocks[y][z][x]) {
                        const worldPos = startPos.offset(x, y, z);
                        const block = this.bot.blockAt(worldPos);

                        // If there IS a real block here, and it's not air/water/grass (replaceable)
                        // Actually, even grass should be cleared if we want it perfect
                        if (block && block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
                            // If it matches blueprint (e.g. we are repairing), ignore
                            // This is a naive check. For now, assume any existing hard block is an obstruction if we want to build
                            // But usually we just overwrite. However, if it's a tree, we should chop it.

                            // Let's refine: If it's "leaves" or "log", mark as obstruction to CLEAR first.
                            if (block.name.includes('log') || block.name.includes('leaves') || block.name === 'cactus') {
                                result.obstructionCount++;
                                result.obstructions.push(worldPos);
                            }
                        }
                    }
                }
            }
        }

        // 2. Check for Foundation (Blocks below the first layer)
        // Only check under non-air blueprint blocks in the bottom layer (y=0)
        const y = 0;
        for (let z = 0; z < sizeZ; z++) {
            for (let x = 0; x < sizeX; x++) {
                if (blueprint.blocks[y][z][x]) {
                    const worldPos = startPos.offset(x, y - 1, z); // Check block BELOW
                    const block = this.bot.blockAt(worldPos);

                    // If it's air or liquid, we need a foundation
                    if (!block || block.name === 'air' || block.name === 'water' || block.name === 'lava' || block.name === 'flowing_water') {
                        result.foundationCount++;
                        result.foundations.push(worldPos);
                    }
                }
            }
        }

        return result;
    }

    /**
     * Clear obstructions and build foundations
     * Note: This is a generator/async process in a real bot, here we provide the plan
     */
    /**
     * Clear obstructions and build foundations
     * @param {Object} analysis - Result from analyze()
     * @param {Object} agent - The agent instance (to access skills)
     */
    async prepareSite(analysis, agent) {
        if (analysis.obstructionCount > 0) {
            console.log(`[TerrainAnalyzer] Clearing ${analysis.obstructionCount} obstructions...`);

            // Dynamic import to avoid circular dependencies if any
            const skills = await import('../library/skills.js');

            for (const pos of analysis.obstructions) {
                // Check if block still exists
                const block = this.bot.blockAt(pos);
                if (block && block.name !== 'air') {
                    console.log(`[TerrainAnalyzer] Removing ${block.name} at ${pos}`);
                    await agent.actions.runAction('terraform:clear', async () => {
                        await skills.breakBlockAt(this.bot, pos.x, pos.y, pos.z);
                    });
                }
            }
        }

        if (analysis.foundationCount > 0) {
            console.log(`[TerrainAnalyzer] Laying ${analysis.foundationCount} foundation blocks...`);
            // Foundation logic: Place dirt/stone under the build
            // Assuming bot has blocks. This is a bit more complex, treating as "Needs Support" for now.
            // For MVP, we just log this. Implementing auto-fill requires inventory management.
            console.warn('[TerrainAnalyzer] Foundation needed but auto-fill not fully implemented yet.');
        }

        return true;
    }
}
