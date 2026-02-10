import mineOres from './mine_ores.js';

export const metadata = {
    name: 'test_mining',
    description: 'Sanity-check mining skill used by integration tests',
    parameters: {
        type: 'object',
        properties: {
            oreType: {
                type: 'string',
                default: 'iron_ore'
            },
            count: {
                type: 'number',
                minimum: 1,
                maximum: 8,
                default: 1
            }
        },
        required: []
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            mined: { type: 'number' },
            message: { type: 'string' }
        }
    },
    tags: ['test', 'mining']
};

export default async function execute(agent, params = {}) {
    const oreType = params.oreType || 'iron_ore';
    const count = params.count || 1;
    return await mineOres(agent, { oreType, count, maxDistance: 32 });
}
