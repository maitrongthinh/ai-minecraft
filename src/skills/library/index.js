export * from './util.js';
export * from './movement_skills.js';
export * from './interaction_skills.js';
export * from './crafting_skills.js';
export * from './combat_skills.js';
export * from './social_skills.js';
// export * from './movement_skills.js'; // Already exported

import findShelterSkill from './find_shelter.js';
import gatherWoodSkill from './gather_wood.js';
import gatherResourcesSkill from './gather_resources.js';
import mineOresSkill from './mine_ores.js';
import craftItemsSkill from './craft_items.js';
import placeBlocksSkill from './place_blocks.js';
import smeltItemsSkill from './smelt_items.js';

function normalizeAgentOrBot(agentOrBot) {
    if (!agentOrBot) return { bot: null, actionAPI: null };
    if (agentOrBot.bot) return agentOrBot;
    const looksLikeBot =
        typeof agentOrBot.findBlock === 'function' ||
        typeof agentOrBot.chat === 'function' ||
        typeof agentOrBot.blockAt === 'function';
    if (looksLikeBot) {
        return { bot: agentOrBot, actionAPI: null };
    }
    return { bot: null, actionAPI: null };
}

// MCP-style wrappers exposed to CodeEngine sandbox. These wrappers allow generated
// code to call skills directly even when only a raw bot object is available.
export async function find_shelter(agentOrBot, options = {}) {
    const agent = normalizeAgentOrBot(agentOrBot);
    return findShelterSkill(agent, options);
}

export async function gather_wood(agentOrBot, options = {}) {
    const agent = normalizeAgentOrBot(agentOrBot);
    return gatherWoodSkill(agent, options);
}

export async function gather_resources(agentOrBot, options = {}) {
    const agent = normalizeAgentOrBot(agentOrBot);
    return gatherResourcesSkill(agent, options);
}

export async function mine_ores(agentOrBot, options = {}) {
    const agent = normalizeAgentOrBot(agentOrBot);
    return mineOresSkill(agent, options);
}

export async function craft_items(agentOrBot, options = {}) {
    const agent = normalizeAgentOrBot(agentOrBot);
    return craftItemsSkill(agent, options);
}

export async function place_blocks(agentOrBot, options = {}) {
    const agent = normalizeAgentOrBot(agentOrBot);
    return placeBlocksSkill(agent, options);
}

export async function smelt_items(agentOrBot, options = {}) {
    const agent = normalizeAgentOrBot(agentOrBot);
    return smeltItemsSkill(agent, options);
}
