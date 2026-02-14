/**
 * SocialProfile.js: Data structure for tracking individual player relationships.
 */
export class SocialProfile {
    constructor(username) {
        this.username = username;
        this.trustScore = 0; // -100 to 100
        this.role = 'stranger'; // stranger, friend, admin
        this.lastSeen = Date.now();
        this.lastGreeting = 0;
        this.interactions = [];
        this.metadata = {};
        this.instruction_reliability = 0;
        this.accepted_rules = 0;
        this.reverted_rules = 0;
        this.last_rule_outcome = null;
    }

    addTrust(amount) {
        this.trustScore = Math.min(100, Math.max(-100, this.trustScore + amount));
        console.log(`[SocialProfile] ${this.username} trust adjusted: ${this.trustScore}`);
    }

    get trust() {
        return this.trustScore;
    }

    recordRuleOutcome(outcome, details = {}) {
        if (outcome === 'accepted') {
            this.accepted_rules += 1;
            this.instruction_reliability += 1;
        } else if (outcome === 'reverted') {
            this.reverted_rules += 1;
            this.instruction_reliability -= 2;
        }

        this.last_rule_outcome = {
            outcome,
            details,
            timestamp: Date.now()
        };
    }

    isTrusted(actionType = 'normal') {
        if (this.role === 'admin') return true;
        if (actionType === 'admin') return this.trustScore >= 90;
        if (actionType === 'destructive') return this.trustScore >= 50;
        return this.trustScore >= 0;
    }
}
