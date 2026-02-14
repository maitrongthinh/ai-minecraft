import { ActionAPI } from '../../src/agent/core/ActionAPI.js';
import { BehaviorRuleEngine } from '../../src/agent/core/BehaviorRuleEngine.js';

function assertTrue(name, condition) {
    if (!condition) throw new Error(name);
    console.log(`PASS ${name}`);
}

const bot = {
    health: 8,
    food: 20,
    version: '1.20.4',
    inventory: {
        slots: new Array(46).fill(null),
        items() {
            return [
                { name: 'shield', count: 1 },
                { name: 'totem_of_undying', count: 1 }
            ];
        }
    },
    getEquipmentDestSlot(dest) {
        if (dest === 'off-hand') return 45;
        return 36;
    },
    equip: async (item, dest) => {
        if (dest === 'off-hand') bot.inventory.slots[45] = item;
    },
    entity: {
        position: {
            distanceTo(pos) {
                return Math.sqrt((pos.x ** 2) + ((pos.y - 64) ** 2) + (pos.z ** 2));
            }
        }
    }
};

const agent = {
    name: `integration_policy_${Date.now()}`,
    bot,
    memory: { absorb: async () => {} },
    social: {
        ensureProfile() {
            return { trustScore: 30 };
        }
    }
};

agent.behaviorRuleEngine = new BehaviorRuleEngine(agent);
agent.behaviorRuleEngine.init();

const rule = agent.behaviorRuleEngine.compileRule({
    intent: 'use_totem_when_low_health',
    condition: { domain: 'combat', trigger: 'always' },
    actionPatch: {
        combat: {
            forceTotem: true,
            totemThreshold: 12
        }
    },
    priority: 99
}, 'Trainer', 30);
agent.behaviorRuleEngine.addRule(rule);

const api = new ActionAPI(agent);
const posture = await api.enforce_combat_posture({ shield: true, totemThreshold: 10 });

assertTrue('combat posture succeeded', posture.success === true);
assertTrue('totem chosen due rule override', posture.mode === 'totem');
assertTrue('offhand is totem', bot.inventory.slots[45]?.name === 'totem_of_undying');

agent.behaviorRuleEngine.cleanup();
console.log('Mission learning integration test passed.');
