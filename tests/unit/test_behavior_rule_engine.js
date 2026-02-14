import fs from 'fs';
import path from 'path';
import { BehaviorRuleEngine } from '../../src/agent/core/BehaviorRuleEngine.js';

function assertTrue(name, condition) {
    if (!condition) throw new Error(name);
    console.log(`PASS ${name}`);
}

const profileStore = new Map();
const agentName = `rule_test_${Date.now()}`;
const agent = {
    name: agentName,
    social: {
        ensureProfile(username) {
            if (!profileStore.has(username)) {
                profileStore.set(username, {
                    trustScore: 5,
                    instruction_reliability: 0,
                    accepted_rules: 0,
                    reverted_rules: 0
                });
            }
            return profileStore.get(username);
        }
    },
    memory: { absorb: async () => {} }
};

const engine = new BehaviorRuleEngine(agent);
engine.init();

const rule = engine.compileRule({
    intent: 'always_hold_shield_in_combat',
    condition: { domain: 'combat', trigger: 'always' },
    actionPatch: { combat: { forceShield: true, totemThreshold: 11 } }
}, 'Player1', 5);

const added = engine.addRule(rule);
assertTrue('rule added', !!added);

const combatPolicy = engine.getCombatPolicy();
assertTrue('combat policy forceShield applied', combatPolicy.forceShield === true);
assertTrue('combat policy threshold applied', combatPolicy.totemThreshold === 11);

const merged = engine.applyActionPolicy('enforce_combat_posture', { shield: false });
assertTrue('action policy merge still returns object', typeof merged === 'object');

engine.recordRuleOutcome(rule.id, 'reverted', { reason: 'test' });
assertTrue('rule removed after revert', engine.getActiveRules().length === 0);

engine.cleanup();

const rulesPath = path.resolve(process.cwd(), 'bots', agentName, 'behavior_rules.json');
assertTrue('behavior rules file created', fs.existsSync(rulesPath));

console.log('BehaviorRuleEngine tests passed.');
