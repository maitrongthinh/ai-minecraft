import { globalBus, SIGNAL } from './SignalBus.js';

function normalize(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export class ChatInstructionLearner {
    constructor(agent, ruleEngine) {
        this.agent = agent;
        this.ruleEngine = ruleEngine;

        this.patterns = [
            {
                id: 'always_shield',
                regexes: [
                    /always\s+(hold|use|equip).*(shield)/,
                    /luon\s+cam\s+khien/,
                    /khi\s+chien\s+dau.*khien/
                ],
                intent: 'always_hold_shield_in_combat',
                condition: { domain: 'combat', trigger: 'always' },
                actionPatch: {
                    combat: {
                        forceShield: true
                    },
                    actions: {
                        enforce_combat_posture: {
                            params: { shield: true }
                        }
                    }
                },
                priority: 90,
                ttlMs: 14 * 24 * 60 * 60 * 1000
            },
            {
                id: 'totem_low_health',
                regexes: [
                    /use\s+totem.*low\s+health/,
                    /totem.*when.*low\s+hp/,
                    /dung\s+totem.*thap\s+mau/,
                    /totem.*it\s+mau\s+thap/
                ],
                intent: 'use_totem_when_low_health',
                condition: { domain: 'combat', trigger: 'always' },
                actionPatch: {
                    combat: {
                        forceTotem: true,
                        totemThreshold: 12
                    },
                    survival: {
                        critical_health_threshold: 6
                    },
                    actions: {
                        enforce_combat_posture: {
                            params: { shield: true, totemThreshold: 12 }
                        }
                    }
                },
                priority: 95,
                ttlMs: 14 * 24 * 60 * 60 * 1000
            },
            {
                id: 'retreat_early',
                regexes: [
                    /retreat\s+earlier/,
                    /run\s+away\s+earlier/,
                    /rut\s+som\s+hon/,
                    /thap\s+mau.*rut/
                ],
                intent: 'retreat_earlier_when_low_health',
                condition: { domain: 'combat', trigger: 'always' },
                actionPatch: {
                    combat: {
                        retreatHealthThreshold: 8
                    },
                    survival: {
                        low_health_threshold: 8
                    }
                },
                priority: 80,
                ttlMs: 7 * 24 * 60 * 60 * 1000
            },
            {
                id: 'start_training',
                regexes: [
                    /let'?s?\s*(train|spar|fight|practice)/i,
                    /train\s+(with\s+)?me/i,
                    /dau\s+tap/i,   // Vietnamese
                    /luyen\s+tap/i
                ],
                intent: 'start_pvp_training',
                condition: { domain: 'training', trigger: 'chat' },
                actionPatch: {},
                priority: 100,
                ttlMs: 0 // Immediate action
            },
            {
                id: 'stop_training',
                regexes: [
                    /stop\s+training/i,
                    /end\s+spar/i,
                    /dung\s+lai/i,
                    /stop\s+it/i
                ],
                intent: 'stop_pvp_training',
                condition: { domain: 'training', trigger: 'chat' },
                actionPatch: {},
                priority: 100,
                ttlMs: 0
            },
            {
                id: 'dump_core',
                regexes: [
                    /^!dump/i,
                    /^!core/i,
                    /extract\s+core/i,
                    /trich\s+xuat\s+du\s+lieu/i
                ],
                intent: 'extract_core_intelligence',
                condition: { domain: 'admin', trigger: 'chat' },
                actionPatch: {},
                priority: 100,
                ttlMs: 0
            }
        ];

        // Phase 3 Fix: Wire up SOCIAL_INTERACTION Listener
        globalBus.subscribe(SIGNAL.SOCIAL_INTERACTION, (event) => {
            const { entity, message } = event.payload || {};
            if (entity && message) {
                this.handleChatMessage(entity, message);
            }
        });
    }

    parseInstruction(message) {
        const normalized = normalize(message);
        if (!normalized) return null;

        for (const pattern of this.patterns) {
            if (pattern.regexes.some(regex => regex.test(normalized))) {
                return {
                    sourceText: message,
                    intent: pattern.intent,
                    condition: pattern.condition,
                    actionPatch: pattern.actionPatch,
                    priority: pattern.priority,
                    ttlMs: pattern.ttlMs
                };
            }
        }

        return null;
    }

    handleChatMessage(username, message) {
        if (!username || !message || !this.ruleEngine) return null;
        if (username === this.agent?.name || username === 'system') return null;

        const parsed = this.parseInstruction(message);
        if (!parsed) return null;

        if (parsed.intent === 'start_pvp_training') {
            if (this.agent.playerTraining) {
                this.agent.playerTraining.startSession(username);
                return { id: 'training_started', intent: parsed.intent };
            }
        } else if (parsed.intent === 'stop_pvp_training') {
            if (this.agent.playerTraining) {
                this.agent.playerTraining.endSession();
                return { id: 'training_stopped', intent: parsed.intent };
            }
        } else if (parsed.intent === 'extract_core_intelligence') {
            if (this.agent.extractor) {
                this.agent.extractor.exportCore().then(path => {
                    this.agent.bot.chat(`Core dumped to: ${path}`);
                });
                return { id: 'core_dumped', intent: parsed.intent };
            }
        }

        const trustScore = this.ruleEngine.getPlayerTrustScore(username);
        const rule = this.ruleEngine.compileRule(parsed, username, trustScore);
        const added = this.ruleEngine.addRule(rule);
        if (!added) return null;

        const profile = this.agent?.social?.ensureProfile
            ? this.agent.social.ensureProfile(username)
            : this.agent?.social?.getProfile?.(username);

        if (profile) {
            profile.accepted_rules = Number(profile.accepted_rules || 0) + 1;
            profile.last_rule_outcome = {
                ruleId: added.id,
                outcome: 'applied',
                timestamp: Date.now()
            };
            if (typeof profile.recordRuleOutcome === 'function') {
                profile.recordRuleOutcome('accepted', { ruleId: added.id, intent: added.intent });
            }
        }

        globalBus.emitSignal(SIGNAL.CHAT_RECEIVED, {
            source: username,
            message,
            learnedRule: added.id
        });

        return added;
    }

    cleanup() {
        // Reserved for future listener ownership.
    }
}

export default ChatInstructionLearner;
