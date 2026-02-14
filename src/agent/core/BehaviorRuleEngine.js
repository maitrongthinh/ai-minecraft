import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import settings from '../../../settings.js';
import { globalBus, SIGNAL } from './SignalBus.js';

function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return base;
    }

    const output = { ...(base || {}) };
    for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            output[key] = deepMerge(output[key] || {}, value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

export class BehaviorRuleEngine {
    constructor(agent) {
        this.agent = agent;
        this.rules = [];
        this.metrics = {
            totalLearned: 0,
            activeRules: 0,
            revertedRules: 0,
            lastUpdated: Date.now()
        };

        this.rulesPath = null;
        this.metricsPath = null;
        this.cleanupInterval = null;
        this.ruleStats = new Map();
        this._unsubscribers = [];

        this.nonOverridableSafetyKeys = new Set([
            'disable_self_preservation',
            'disable_death_recovery',
            'disable_watchdog',
            'allow_destructive_commands'
        ]);
    }

    init() {
        this._resolvePaths();
        this._load();

        if (!this.cleanupInterval) {
            this.cleanupInterval = setInterval(() => {
                this.pruneExpiredRules();
            }, 60_000);
        }

        this._attachOutcomeSignals();
    }

    _resolvePaths() {
        const name = this.agent?.name || 'Agent';
        const baseDir = path.resolve(process.cwd(), 'bots', name);
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }

        this.rulesPath = path.join(baseDir, 'behavior_rules.json');
        this.metricsPath = path.join(baseDir, 'learning_metrics.json');
    }

    _readJson(filePath, fallback) {
        try {
            if (!filePath || !fs.existsSync(filePath)) return fallback;
            const raw = fs.readFileSync(filePath, 'utf8');
            if (!raw.trim()) return fallback;
            return JSON.parse(raw);
        } catch (error) {
            console.warn(`[BehaviorRuleEngine] Failed to read ${filePath}: ${error.message}`);
            return fallback;
        }
    }

    _writeJson(filePath, data) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.warn(`[BehaviorRuleEngine] Failed to write ${filePath}: ${error.message}`);
        }
    }

    _load() {
        const loadedRules = this._readJson(this.rulesPath, []);
        this.rules = Array.isArray(loadedRules) ? loadedRules : [];

        const loadedMetrics = this._readJson(this.metricsPath, null);
        if (loadedMetrics && typeof loadedMetrics === 'object') {
            this.metrics = { ...this.metrics, ...loadedMetrics };
        }

        this.pruneExpiredRules(false);
    }

    save() {
        this.metrics.activeRules = this.getActiveRules().length;
        this.metrics.lastUpdated = Date.now();

        this._writeJson(this.rulesPath, this.rules);
        this._writeJson(this.metricsPath, this.metrics);
    }

    pruneExpiredRules(emitSignals = true) {
        const before = this.rules.length;
        const now = Date.now();
        this.rules = this.rules.filter(rule => {
            if (!rule || rule.active === false) return false;
            if (!rule.expiresAt) return true;
            return rule.expiresAt > now;
        });

        if (before !== this.rules.length) {
            if (emitSignals) {
                globalBus.emitSignal(SIGNAL.RULE_REVERTED, {
                    reason: 'expired',
                    removed: before - this.rules.length,
                    timestamp: Date.now()
                });
            }
            this.save();
        }
    }

    getPlayerTrustScore(username) {
        if (!username) return 0;
        const profile = this.agent?.social?.ensureProfile
            ? this.agent.social.ensureProfile(username)
            : this.agent?.social?.getProfile?.(username);

        const trust = profile?.trustScore;
        return Number.isFinite(trust) ? trust : 0;
    }

    compileRule({
        intent,
        sourceText,
        condition,
        actionPatch,
        priority = 50,
        ttlMs,
        scope = 'global'
    }, sourcePlayer, trustScore = 0) {
        const now = Date.now();
        const defaultTtl = trustScore >= 25 ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;

        return {
            id: randomUUID(),
            intent: intent || 'custom_instruction',
            sourceText: sourceText || '',
            sourcePlayer: sourcePlayer || 'unknown',
            trustScore,
            scope,
            condition: condition || { domain: 'global', trigger: 'always' },
            actionPatch: actionPatch || {},
            priority,
            createdAt: now,
            expiresAt: now + (ttlMs || defaultTtl),
            version: 1,
            active: true
        };
    }

    _isRuleSafe(rule) {
        if (!rule || typeof rule !== 'object') return false;

        const patchText = JSON.stringify(rule.actionPatch || {}).toLowerCase();
        if (patchText.includes('rm ') || patchText.includes('shutdown') || patchText.includes('reset --hard')) {
            return false;
        }

        for (const forbiddenKey of this.nonOverridableSafetyKeys) {
            if (patchText.includes(forbiddenKey)) {
                return false;
            }
        }

        return true;
    }

    addRule(rule) {
        if (!this._isRuleSafe(rule)) {
            console.warn('[BehaviorRuleEngine] Rejected unsafe rule');
            return null;
        }

        this.rules.push(rule);
        this.rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        this.ruleStats.set(rule.id, { positive: 0, negative: 0 });

        this.metrics.totalLearned += 1;
        this.save();

        globalBus.emitSignal(SIGNAL.RULE_LEARNED, {
            id: rule.id,
            intent: rule.intent,
            sourcePlayer: rule.sourcePlayer,
            trustScore: rule.trustScore
        });

        globalBus.emitSignal(SIGNAL.RULE_APPLIED, {
            id: rule.id,
            priority: rule.priority,
            timestamp: Date.now()
        });

        try {
            this.agent?.memory?.absorb('experience', {
                facts: [`Learned behavior rule: ${rule.intent} from ${rule.sourcePlayer}`],
                metadata: { type: 'behavior_rule', ruleId: rule.id, trustScore: rule.trustScore }
            });
        } catch {
            // no-op
        }

        return rule;
    }

    _attachOutcomeSignals() {
        if (this._unsubscribers.length > 0) return;

        const reward = () => this._updateRecentRuleStats('positive');
        const penalize = () => this._updateRecentRuleStats('negative');

        this._unsubscribers.push(globalBus.subscribe(SIGNAL.TASK_COMPLETED, reward));
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.TASK_FAILED, penalize));
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.ACTION_FAILED, penalize));
        this._unsubscribers.push(globalBus.subscribe(SIGNAL.DEATH, penalize));
    }

    _selectRecentRule() {
        const now = Date.now();
        const recent = this.getActiveRules()
            .filter(rule => now - (rule.createdAt || 0) < 24 * 60 * 60 * 1000)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return recent[0] || null;
    }

    _updateRecentRuleStats(type) {
        const rule = this._selectRecentRule();
        if (!rule) return;

        const stats = this.ruleStats.get(rule.id) || { positive: 0, negative: 0 };
        if (type === 'positive') {
            stats.positive += 1;
            this.ruleStats.set(rule.id, stats);
            if (stats.positive > 0 && stats.negative === 0) {
                this.recordRuleOutcome(rule.id, 'improved', { source: 'runtime_feedback' });
            }
            return;
        }

        stats.negative += 1;
        this.ruleStats.set(rule.id, stats);
        if (stats.negative >= 3) {
            this.recordRuleOutcome(rule.id, 'reverted', {
                source: 'runtime_feedback',
                reason: 'negative_events_threshold'
            });
        } else {
            this.save();
        }
    }

    getActiveRules(domain = null) {
        this.pruneExpiredRules(false);

        const all = this.rules.filter(r => r && r.active !== false);
        if (!domain) return all;

        return all.filter(rule => {
            const ruleDomain = rule?.condition?.domain || 'global';
            return ruleDomain === 'global' || ruleDomain === domain;
        });
    }

    removeRule(ruleId, reason = 'manual') {
        const idx = this.rules.findIndex(r => r.id === ruleId);
        if (idx === -1) return false;

        const [removed] = this.rules.splice(idx, 1);
        this.metrics.revertedRules += 1;
        this.save();

        globalBus.emitSignal(SIGNAL.RULE_REVERTED, {
            id: removed.id,
            reason,
            sourcePlayer: removed.sourcePlayer,
            timestamp: Date.now()
        });

        return true;
    }

    _conditionMatches(rule, context = {}) {
        const condition = rule?.condition || {};
        if (!condition.trigger || condition.trigger === 'always') return true;

        if (condition.trigger === 'health_below') {
            const health = context.health ?? this.agent?.bot?.health ?? 20;
            return health < (condition.value ?? 10);
        }

        if (condition.trigger === 'action') {
            return context.actionName && context.actionName === condition.value;
        }

        return true;
    }

    _mergeRulePatches(domain, context = {}) {
        const rules = this.getActiveRules(domain);
        let merged = {};

        for (const rule of rules) {
            if (!this._conditionMatches(rule, context)) continue;
            merged = deepMerge(merged, rule.actionPatch || {});
        }

        return merged;
    }

    getCombatPolicy(context = {}) {
        const defaults = {
            forceShield: false,
            forceTotem: false,
            totemThreshold: 10,
            retreatHealthThreshold: 6
        };

        const patch = this._mergeRulePatches('combat', context);
        return deepMerge(defaults, patch.combat || {});
    }

    getSelfPreservationPolicy(context = {}) {
        const profile = this.agent?.config?.profile?.behavior?.self_preservation || {};
        const defaults = {
            low_health_threshold: profile.low_health_threshold ?? 6,
            critical_health_threshold: profile.critical_health_threshold ?? 4,
            panic_distance: profile.panic_distance ?? 10
        };

        const patch = this._mergeRulePatches('survival', context);
        return deepMerge(defaults, patch.survival || {});
    }

    getActionPolicy(actionName, params = {}) {
        const patch = this._mergeRulePatches('action', { actionName, params });
        const globalPatch = patch.actions?.['*'] || {};
        const specificPatch = patch.actions?.[actionName] || {};

        return deepMerge(globalPatch, specificPatch);
    }

    applyActionPolicy(actionName, params = {}) {
        const policy = this.getActionPolicy(actionName, params);
        if (!policy || Object.keys(policy).length === 0) {
            return params;
        }

        if (policy.blocked === true) {
            throw new Error(`Action blocked by behavior policy: ${actionName}`);
        }

        const effective = deepMerge(params || {}, policy.params || {});
        return effective;
    }

    getPlannerGuardrails() {
        const active = this.getActiveRules();
        if (active.length === 0) return '';

        const lines = active
            .slice(0, 8)
            .map(rule => `- ${rule.intent} (source: ${rule.sourcePlayer}, trust: ${rule.trustScore})`);

        return ['Behavior rules currently active:', ...lines].join('\n');
    }

    recordRuleOutcome(ruleId, outcome, details = {}) {
        const rule = this.rules.find(r => r.id === ruleId);
        if (!rule) return;

        const profile = this.agent?.social?.ensureProfile
            ? this.agent.social.ensureProfile(rule.sourcePlayer)
            : this.agent?.social?.getProfile?.(rule.sourcePlayer);

        if (profile) {
            profile.instruction_reliability = Number(profile.instruction_reliability || 0);
            profile.accepted_rules = Number(profile.accepted_rules || 0);
            profile.reverted_rules = Number(profile.reverted_rules || 0);

            if (outcome === 'improved') {
                profile.instruction_reliability += 1;
            } else if (outcome === 'reverted') {
                profile.instruction_reliability -= 2;
                profile.reverted_rules += 1;
            }

            profile.last_rule_outcome = {
                ruleId,
                outcome,
                timestamp: Date.now(),
                details
            };
        }

        if (outcome === 'reverted') {
            this.removeRule(ruleId, details.reason || 'negative_outcome');
        } else {
            this.save();
        }
    }

    cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this._unsubscribers.length > 0) {
            for (const unsub of this._unsubscribers) {
                try {
                    unsub();
                } catch {
                    // no-op
                }
            }
            this._unsubscribers = [];
        }
        this.save();
    }
}

export default BehaviorRuleEngine;
