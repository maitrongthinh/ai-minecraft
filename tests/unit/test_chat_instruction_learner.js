import { ChatInstructionLearner } from '../../src/agent/core/ChatInstructionLearner.js';

function assertTrue(name, condition) {
    if (!condition) throw new Error(name);
    console.log(`PASS ${name}`);
}

const profileStore = new Map();
const agent = {
    name: 'BotA',
    social: {
        ensureProfile(username) {
            if (!profileStore.has(username)) {
                profileStore.set(username, { accepted_rules: 0 });
            }
            return profileStore.get(username);
        }
    }
};

const createdRules = [];
const ruleEngine = {
    getPlayerTrustScore: () => 10,
    compileRule(parsed, source, trust) {
        return { id: 'rule-1', ...parsed, sourcePlayer: source, trustScore: trust };
    },
    addRule(rule) {
        createdRules.push(rule);
        return rule;
    }
};

const learner = new ChatInstructionLearner(agent, ruleEngine);

const parsed = learner.parseInstruction('luon cam khien khi chien dau');
assertTrue('parses vietnamese shield instruction', parsed?.intent === 'always_hold_shield_in_combat');

const rule = learner.handleChatMessage('Player1', 'use totem when low health');
assertTrue('creates rule from chat', !!rule);
assertTrue('rule intent matches totem pattern', rule.intent === 'use_totem_when_low_health');
assertTrue('profile accepted rule count updated', profileStore.get('Player1').accepted_rules >= 1);

console.log('ChatInstructionLearner tests passed.');
