import { globalBus, SIGNAL } from '../core/SignalBus.js';

/**
 * CriticAgent - Safety & Feasibility Validator
 * 
 * System 2 Component: Reviews plans before execution.
 * Checks for safety issues, resource availability, and feasibility.
 * 
 * Implements "Sandboxed Innovation" - validates before live execution.
 */
export class CriticAgent {
    constructor(agent) {
        this.agent = agent;
        this.maxRetries = 3;

        // Safety rules
        this.safetyRules = {
            // Forbidden actions without confirmation
            dangerous: ['tnt', 'lava', 'fire', 'creeper'],
            // Actions that need health check
            combatRequired: ['attack', 'fight', 'kill'],
            // Minimum health for risky actions
            minHealthForRisk: 10,
            // Minimum food for long tasks
            minFoodForLongTask: 8
        };

        console.log('[CriticAgent] Initialized');
    }

    /**
     * Review a plan for safety and feasibility
     * @param {Array} plan - Plan steps from PlannerAgent
     * @param {object} context - Current context
     * @returns {Promise<{approved: boolean, issues: Array, suggestions: Array, scores: object}>}
     */
    async review(plan, context = {}) {
        console.log(`[CriticAgent] Reviewing plan with ${plan.length} steps`);

        const issues = [];
        const suggestions = [];

        // Initial scores
        const scores = {
            safety: 1.0,
            resource: 1.0,
            efficiency: 1.0
        };

        // Get current bot state
        const botState = this._getBotState();

        // 1. Safety checks
        const safetyIssues = this._checkSafety(plan, botState);
        issues.push(...safetyIssues);
        scores.safety = this._calculateSafetyScore(safetyIssues);

        // 2. Resource feasibility
        const resourceIssues = await this._checkResources(plan, botState);
        issues.push(...resourceIssues);
        scores.resource = this._calculateResourceScore(resourceIssues);

        // 3. Skill availability & Efficiency
        const skillIssues = this._checkSkillAvailability(plan);
        issues.push(...skillIssues);

        const orderIssues = this._checkPlanOrder(plan);
        issues.push(...orderIssues);
        scores.efficiency = this._calculateEfficiencyScore(skillIssues, orderIssues, plan.length);

        // 4. Generate suggestions for issues
        for (const issue of issues) {
            const suggestion = this._generateSuggestion(issue, plan);
            if (suggestion) {
                suggestions.push(suggestion);
            }
        }

        // Determine approval based on weighted scores
        // Critical threshold: Safety MUST be > 0.8, Resource MUST be > 0.5
        const approved = scores.safety > 0.8 && scores.resource > 0.5;

        if (!approved) {
            console.log(`[CriticAgent] Plan REJECTED: Safety(${scores.safety.toFixed(2)}) Resource(${scores.resource.toFixed(2)})`);
        } else if (issues.length > 0) {
            console.log(`[CriticAgent] Plan APPROVED with ${issues.length} warnings. Efficiency: ${scores.efficiency.toFixed(2)}`);
        } else {
            console.log('[CriticAgent] Plan APPROVED with perfect scores');
        }

        return {
            approved,
            issues,
            suggestions,
            scores,
            summary: this._generateReviewSummary(issues, approved, scores)
        };
    }

    _calculateSafetyScore(issues) {
        let score = 1.0;
        for (const issue of issues) {
            if (issue.severity === 'critical') score -= 0.3;
            if (issue.severity === 'warning') score -= 0.1;
        }
        return Math.max(0, score);
    }

    _calculateResourceScore(issues) {
        let score = 1.0;
        for (const issue of issues) {
            if (issue.severity === 'critical') score -= 0.4;
            if (issue.severity === 'warning') score -= 0.15;
        }
        return Math.max(0, score);
    }

    _calculateEfficiencyScore(skillIssues, orderIssues, planLength) {
        let score = 1.0;
        // Penalize missing skills
        score -= skillIssues.length * 0.1;
        // Penalize bad order
        score -= orderIssues.length * 0.2;
        // Slight penalty for overly long plans if they have many warnings
        if (planLength > 10) score -= 0.1;

        return Math.max(0, score);
    }

    /**
     * Get current bot state
     * @private
     */
    _getBotState() {
        if (!this.agent.bot) {
            return {
                health: 20,
                food: 20,
                position: { x: 0, y: 64, z: 0 },
                inventory: []
            };
        }

        return {
            health: this.agent.bot.health || 20,
            food: this.agent.bot.food || 20,
            position: this.agent.bot.entity?.position || { x: 0, y: 64, z: 0 },
            inventory: this.agent.bot.inventory?.items() || [],
            isDay: this.agent.bot.time?.isDay ?? true
        };
    }

    /**
     * Check safety issues
     * @private
     */
    _checkSafety(plan, botState) {
        const issues = [];

        for (const step of plan) {
            const taskLower = (step.task + JSON.stringify(step.params)).toLowerCase();

            // Check for dangerous actions
            for (const dangerous of this.safetyRules.dangerous) {
                if (taskLower.includes(dangerous)) {
                    issues.push({
                        type: 'safety',
                        severity: 'critical',
                        step: step.id,
                        message: `Dangerous action detected: involves ${dangerous}`,
                        details: step.task
                    });
                }
            }

            // Check health for combat
            for (const combat of this.safetyRules.combatRequired) {
                if (taskLower.includes(combat)) {
                    if (botState.health < this.safetyRules.minHealthForRisk) {
                        issues.push({
                            type: 'safety',
                            severity: 'warning',
                            step: step.id,
                            message: `Low health (${botState.health}) for combat action`,
                            details: 'Recommend healing first'
                        });
                    }
                }
            }
        }

        // Check overall health
        if (botState.health < 5) {
            issues.push({
                type: 'safety',
                severity: 'critical',
                step: 0,
                message: 'Critical health! Must heal before any tasks',
                details: `Current health: ${botState.health}/20`
            });
        }

        // Check food for long tasks
        if (plan.length > 5 && botState.food < this.safetyRules.minFoodForLongTask) {
            issues.push({
                type: 'safety',
                severity: 'warning',
                step: 0,
                message: 'Low food for long task sequence',
                details: `Current food: ${botState.food}/20, plan has ${plan.length} steps`
            });
        }

        return issues;
    }

    /**
     * Check resource feasibility
     * @private
     */
    async _checkResources(plan, botState) {
        const issues = [];
        const inventory = botState.inventory;

        // Build inventory map
        const inventoryMap = {};
        for (const item of inventory) {
            inventoryMap[item.name] = (inventoryMap[item.name] || 0) + item.count;
        }

        // Check each step that requires specific resources
        for (const step of plan) {
            // Craft checks
            if (step.task === 'craft_items') {
                const item = step.params?.item;
                // For now, just warn about crafting without checking recipes
                if (item && !inventoryMap['crafting_table'] && this._needsCraftingTable(item)) {
                    issues.push({
                        type: 'resource',
                        severity: 'warning',
                        step: step.id,
                        message: `Crafting ${item} may need crafting table`,
                        details: 'Consider crafting table first'
                    });
                }
            }

            // Mining checks
            if (step.task === 'mine_ores') {
                const hasPickaxe = Object.keys(inventoryMap).some(k => k.includes('pickaxe'));
                if (!hasPickaxe) {
                    issues.push({
                        type: 'resource',
                        severity: 'critical',
                        step: step.id,
                        message: 'Mining requires pickaxe',
                        details: 'No pickaxe in inventory'
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Check if item needs crafting table
     * @private
     */
    _needsCraftingTable(item) {
        const needs3x3 = ['pickaxe', 'axe', 'sword', 'shovel', 'hoe', 'chest', 'furnace'];
        return needs3x3.some(n => item.includes(n));
    }

    /**
     * Check skill availability
     * @private
     */
    _checkSkillAvailability(plan) {
        const issues = [];

        if (!this.agent.toolRegistry) {
            return issues;
        }

        const availableSkills = new Set(
            this.agent.toolRegistry.listSkills().map(s => s.name)
        );

        for (const step of plan) {
            if (!availableSkills.has(step.task)) {
                issues.push({
                    type: 'skill',
                    severity: 'warning',
                    step: step.id,
                    message: `Skill not available: ${step.task}`,
                    details: 'Will attempt fallback execution'
                });
            }
        }

        return issues;
    }

    /**
     * Check plan logical order
     * @private
     */
    _checkPlanOrder(plan) {
        const issues = [];

        // Build dependency rules
        const dependencies = {
            'mine_ores': ['craft_items'], // Should craft pickaxe before mining
            'build_structure': ['gather_resources', 'craft_items'], // Should gather first
            'smelt_items': ['gather_resources'] // Need fuel and ore
        };

        const seenTasks = new Set();

        for (const step of plan) {
            const requiredBefore = dependencies[step.task];

            if (requiredBefore) {
                const missingDeps = requiredBefore.filter(dep => !seenTasks.has(dep));
                if (missingDeps.length > 0) {
                    // Check if any earlier step covers it
                    const hasPrior = plan.slice(0, step.id - 1).some(s =>
                        missingDeps.includes(s.task)
                    );

                    if (!hasPrior) {
                        issues.push({
                            type: 'order',
                            severity: 'warning',
                            step: step.id,
                            message: `${step.task} usually requires: ${missingDeps.join(', ')}`,
                            details: 'Consider reordering'
                        });
                    }
                }
            }

            seenTasks.add(step.task);
        }

        return issues;
    }

    /**
     * Generate suggestion for an issue
     * @private
     */
    _generateSuggestion(issue, plan) {
        switch (issue.type) {
            case 'safety':
                if (issue.message.includes('health')) {
                    return {
                        action: 'prepend',
                        step: { task: 'eat_food', params: { minHealth: 15 } },
                        reason: 'Heal before proceeding'
                    };
                }
                break;

            case 'resource':
                if (issue.message.includes('pickaxe')) {
                    return {
                        action: 'prepend',
                        step: { task: 'craft_items', params: { item: 'wooden_pickaxe', count: 1 } },
                        reason: 'Craft pickaxe first'
                    };
                }
                break;

            case 'order':
                return {
                    action: 'reorder',
                    suggestion: issue.details,
                    reason: issue.message
                };
        }

        return null;
    }

    /**
     * Generate review summary
     * @private
     */
    _generateReviewSummary(issues, approved, scores) {
        if (issues.length === 0) {
            return `Plan APPROVED with perfect scores! (Safety: ${scores.safety.toFixed(2)}, Resource: ${scores.resource.toFixed(2)}, Efficiency: ${scores.efficiency.toFixed(2)})`;
        }

        const critical = issues.filter(i => i.severity === 'critical').length;
        const warnings = issues.filter(i => i.severity === 'warning').length;

        if (!approved) {
            return `Plan BLOCKED: ${critical} critical issues must be resolved. Minimum safety threshold (0.80) or resource threshold (0.50) not met. Safety: ${scores.safety.toFixed(2)}, Resource: ${scores.resource.toFixed(2)}.`;
        }

        return `Plan approved with ${warnings} warnings. Safety: ${scores.safety.toFixed(2)}, Resource: ${scores.resource.toFixed(2)}, Efficiency: ${scores.efficiency.toFixed(2)}.`;
    }

    /**
     * Quick safety check for single action
     * @param {string} action - Action to check
     * @param {object} params - Action parameters
     * @returns {boolean} - Safe to proceed
     */
    quickCheck(action, params = {}) {
        const botState = this._getBotState();

        // Critical health check
        if (botState.health < 5) {
            return false;
        }

        // Don't allow dangerous actions
        const actionStr = (action + JSON.stringify(params)).toLowerCase();
        for (const dangerous of this.safetyRules.dangerous) {
            if (actionStr.includes(dangerous)) {
                return false;
            }
        }

        return true;
    }
}
