/**
 * MCP-Compliant Skill: Smelt Items
 *
 * @skill smelt_items
 * @description Smelts items in a furnace with retry protection
 * @tags [smelting, crafting, survival]
 * @version 1.0.0
 */

import { RetryHelper } from '../../utils/RetryHelper.js';
import { smeltItem } from './crafting_skills.js';

export const metadata = {
    name: 'smelt_items',
    description: 'Smelts items in a furnace',
    parameters: {
        type: 'object',
        properties: {
            item: {
                type: 'string',
                description: 'Input item name to smelt, e.g. raw_iron'
            },
            count: {
                type: 'number',
                minimum: 1,
                maximum: 64,
                default: 1
            },
            retries: {
                type: 'number',
                minimum: 0,
                maximum: 5,
                default: 2
            }
        },
        required: ['item']
    },
    returns: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            attempts: { type: 'number' },
            message: { type: 'string' }
        }
    },
    tags: ['smelting', 'crafting', 'survival']
};

export default async function execute(agent, params = {}) {
    const { item, count = 1, retries = 2 } = params;
    const bot = agent?.bot || agent;
    if (!bot) {
        return { success: false, attempts: 0, message: 'Bot not initialized' };
    }

    if (agent?.actionAPI) {
        const result = await agent.actionAPI.smelt(item, count, { retries });
        return {
            success: result.success,
            attempts: result.attempts || 0,
            message: result.success
                ? `Smelted ${count}x ${item}`
                : `Failed to smelt ${item}: ${result.error}`
        };
    }

    let attempts = 0;
    try {
        await RetryHelper.retry(
            async () => {
                attempts++;
                const ok = await smeltItem(bot, item, count);
                if (!ok) throw new Error('smeltItem returned false');
            },
            {
                context: `smelt_items:${item}`,
                maxRetries: retries,
                baseDelay: 400,
                maxDelay: 1600
            }
        );
        return { success: true, attempts, message: `Smelted ${count}x ${item}` };
    } catch (error) {
        return { success: false, attempts, message: `Failed to smelt ${item}: ${error.message}` };
    }
}
