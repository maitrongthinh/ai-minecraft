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
    }

    addTrust(amount) {
        this.trustScore = Math.min(100, Math.max(-100, this.trustScore + amount));
        console.log(`[SocialProfile] ${this.username} trust adjusted: ${this.trustScore}`);
    }

    get trust() {
        return this.trustScore;
    }

    isTrusted(actionType = 'normal') {
        if (this.role === 'admin') return true;
        if (actionType === 'admin') return this.trustScore >= 90;
        if (actionType === 'destructive') return this.trustScore >= 50;
        return this.trustScore >= 0;
    }
}
