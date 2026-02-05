
export class SocialProfile {
    constructor(name) {
        this.name = name;
        this.trust = 0; // -100 (Enemy) to 100 (Best Friend)
        this.role = 'neutral'; // 'admin', 'friend', 'neutral', 'enemy'
        this.first_seen = Date.now();
        this.last_seen = Date.now();
        this.interactions = 0;
        this.sentiment_history = []; // Last 5 sentiment scores
        this.stats = {
            gifts_given: 0,
            gifts_received: 0,
            attacks_on_bot: 0,
            attacks_from_bot: 0,
            chat_messages: 0
        };
    }

    updateTrust(delta, reason) {
        this.trust = Math.max(-100, Math.min(100, this.trust + delta));
        console.log(`[SocialProfile] ${this.name} trust changed by ${delta} (${reason}). New Score: ${this.trust}`);
        this.updateRole();
    }

    updateRole() {
        if (this.trust <= -50) this.role = 'enemy';
        else if (this.trust > 50) this.role = 'friend';
        else this.role = 'neutral';
    }

    recordInteraction(type, data) {
        this.interactions++;
        this.last_seen = Date.now();

        if (type === 'chat') {
            this.stats.chat_messages++;
        } else if (type === 'attack') {
            this.stats.attacks_on_bot++;
            this.updateTrust(-20, 'attacked bot');
        } else if (type === 'gift') {
            this.stats.gifts_received++;
            this.updateTrust(10, 'gave gift');
        }
    }

    getPermissions() {
        if (this.role === 'admin') return ['*'];

        const perms = ['chat', 'look'];

        if (this.trust >= 0) perms.push('follow');
        if (this.trust >= 20) perms.push('trade');
        if (this.trust >= 50) perms.push('build', 'mine', 'command');

        return perms;
    }

    can(action) {
        const perms = this.getPermissions();
        return perms.includes('*') || perms.includes(action);
    }

    toJSON() {
        return {
            name: this.name,
            trust: this.trust,
            role: this.role,
            first_seen: this.first_seen,
            last_seen: this.last_seen,
            interactions: this.interactions,
            stats: this.stats
        };
    }

    static fromJSON(json) {
        const profile = new SocialProfile(json.name);
        Object.assign(profile, json);
        return profile;
    }
}
