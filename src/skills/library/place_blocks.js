/**
 * MCP-Compliant Skill: Place Blocks
 *
 * @skill place_blocks
 * @description Places a block at a target world coordinate
 * @tags [building, placement, survival]
 * @version 1.0.0
 */

import { RetryHelper } from '../../utils/RetryHelper.js';
import { placeBlock } from './interaction_skills.js';

export const metadata = {
    name: 'place_blocks',
    description: 'Places a block at a world coordinate',
    parameters: {
        type: 'object',
        properties: {
            block: {
                type: 'string',
                description: 'Block name to place, e.g. cobblestone'
            },
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
            retries: {
                type: 'number',
                minimum: 0,
                maximum: 5,
                default: 2
            }
        },
        required: ['block', 'x', 'y', 'z']
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            attempts: { type: 'number' },
            message: { type: 'string' }
        }
    },
    tags: ['building', 'placement', 'survival']
};

export default async function execute(agent, params = {}) {
    const { block, x, y, z, retries = 2 } = params;
    const bot = agent?.bot || agent;
    if (!bot) {
        return { success: false, attempts: 0, message: 'Bot not initialized' };
    }
    if (!block || typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        return {
            success: false,
            attempts: 0,
            message: 'Invalid parameters: block, x, y, z are required'
        };
    }

    if (agent?.actionAPI) {
        const result = await agent.actionAPI.place(block, { x, y, z }, { retries });
        return {
            success: result.success,
            attempts: result.attempts || 0,
            message: result.success
                ? `Placed ${block} at (${x}, ${y}, ${z})`
                : `Failed to place ${block}: ${result.error}`
        };
    }

    let attempts = 0;
    try {
        await RetryHelper.retry(
            async () => {
                attempts++;
                const ok = await placeBlock(bot, block, x, y, z);
                if (!ok) throw new Error('placeBlock returned false');
            },
            {
                context: `place_blocks:${block}`,
                maxRetries: retries,
                baseDelay: 250,
                maxDelay: 1200
            }
        );
        return { success: true, attempts, message: `Placed ${block} at (${x}, ${y}, ${z})` };
    } catch (error) {
        return { success: false, attempts, message: `Failed to place ${block}: ${error.message}` };
    }
}
