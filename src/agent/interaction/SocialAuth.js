import { globalBus, SIGNAL } from '../core/SignalBus.js';
// import settings from '../../settings.js'; // Causes issues in test env, use process.env or mock


/**
 * SocialAuth: Security Gatekeeper
 * 
 * Manages player authentication via secret handshake and tracks trust scores.
 * Enforces a "Zero Trust" policy by default for unknown players.
 */
export class SocialAuth {
    constructor(agent) {
        this.agent = agent;
        this.adminPassword = process.env.ADMIN_PASSWORD || 'mindcraft_admin'; // Default fallback (warn in logs)
        this.authenticatedSessions = new Map(); // username -> expiration timestamp
        this.sessionDuration = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Verify a handshake attempt
     * @param {string} username - Player username
     * @param {string} message - Chat message containing potential password
     * @returns {boolean} True if authenticated
     */
    verifyHandshake(username, message) {
        if (!message) return false;

        // Check if message contains the secret (simple inclusion check, or exact match?)
        // Let's use exact match or "auth <password>" format for security.
        // "auth <password>" is cleaner and avoids accidental triggers in normal chat.
        const cleanMsg = message.trim();
        if (cleanMsg === `auth ${this.adminPassword}` || cleanMsg === this.adminPassword) {
            this._createSession(username);
            return true;
        }
        return false;
    }

    /**
     * Check if a player is currently authenticated
     * @param {string} username 
     */
    isAuthenticated(username) {
        if (!this.authenticatedSessions.has(username)) return false;

        const expiration = this.authenticatedSessions.get(username);
        if (Date.now() > expiration) {
            this.authenticatedSessions.delete(username);
            return false;
        }
        // Refresh session on activity? Optional. Let's strict expire for now.
        // Or refresh on successful command? Let's refresh.
        this._refreshSession(username);
        return true;
    }

    /**
     * Check if a player is trusted enough for a specific action
     * @param {string} username 
     * @param {number} requiredTrust 
     */
    isTrusted(username, requiredTrust = 0) {
        // Whitelist bypass
        if (this.agent.social?.FRIENDS?.includes(username)) return true;
        if (this.agent.social?.ADMINS?.includes(username)) return true;

        const profile = this.agent.social?.getProfile(username);
        if (!profile) return false;

        return profile.trustScore >= requiredTrust;
    }

    _createSession(username) {
        this.authenticatedSessions.set(username, Date.now() + this.sessionDuration);
        console.log(`[SocialAuth] 🔓 Session created for ${username}`);
        globalBus.emitSignal(SIGNAL.SOCIAL_INTERACTION, {
            entity: username,
            message: '[AUTH_SUCCESS]',
            trust: 100,
            sentiment: 'positive'
        });
    }

    _refreshSession(username) {
        if (this.authenticatedSessions.has(username)) {
            this.authenticatedSessions.set(username, Date.now() + this.sessionDuration);
        }
    }

    revokeSession(username) {
        if (this.authenticatedSessions.delete(username)) {
            console.log(`[SocialAuth] 🔒 Session revoked for ${username}`);
        }
    }
}
