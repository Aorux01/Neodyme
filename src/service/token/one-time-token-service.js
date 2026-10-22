const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const LoggerService = require('../logger/logger-service');
const ConfigManager = require('../../manager/config-manager');

const TOKENS_FILE = path.join(__dirname, '../../../data/one-time-tokens.json');
const PURGE_INTERVAL_MS = 10 * 60 * 1000;

// Config key and default lifetime in minutes for each token type.
const LIFETIMES = {
    verify: ['verifyTokenMinutes', 1440],
    reset: ['resetTokenMinutes', 30],
    magic: ['magicLinkMinutes', 10],
    mfa: ['mfaTokenMinutes', 5],
    oauth: ['oauthStateMinutes', 10]
};

class OneTimeTokenService {
    static tokens = new Map();
    static cooldowns = new Map();
    static purgeTimer = null;

    static async initialize() {
        this.load();
        this.purgeExpired();

        if (!this.purgeTimer) {
            this.purgeTimer = setInterval(() => this.purgeExpired(), PURGE_INTERVAL_MS);
            this.purgeTimer.unref();
        }
    }

    static load() {
        this.tokens.clear();
        try {
            if (!fs.existsSync(TOKENS_FILE)) return;
            const stored = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
            for (const [hash, record] of Object.entries(stored)) this.tokens.set(hash, record);
        } catch (error) {
            LoggerService.log('warn', `Could not read one-time tokens: ${error.message}`);
        }
    }

    static save() {
        try {
            fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
            const temp = `${TOKENS_FILE}.tmp`;
            fs.writeFileSync(temp, JSON.stringify(Object.fromEntries(this.tokens)), 'utf8');
            fs.renameSync(temp, TOKENS_FILE);
        } catch (error) {
            LoggerService.log('error', `Could not save one-time tokens: ${error.message}`);
        }
    }

    static hash(rawToken) {
        return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
    }

    static lifetimeMs(type) {
        const [key, fallback] = LIFETIMES[type];
        return Math.max(1, Number(ConfigManager.get(key, fallback)) || fallback) * 60 * 1000;
    }

    static purgeExpired() {
        const now = Date.now();
        let removed = 0;

        for (const [hash, record] of this.tokens) {
            if (record.expiresAt <= now) {
                this.tokens.delete(hash);
                removed++;
            }
        }
        for (const [key, until] of this.cooldowns) {
            if (until <= now) this.cooldowns.delete(key);
        }

        if (removed > 0) this.save();
    }

    // Issuing a token cancels any earlier token of the same type for that account.
    static async issue(type, accountId, { meta = null, ttlMs = null } = {}) {
        if (!LIFETIMES[type]) throw new Error(`Unknown token type: ${type}`);

        this.revokeFor(accountId, type, false);

        const token = crypto.randomBytes(32).toString('base64url');
        const lifetime = ttlMs !== null ? ttlMs : this.lifetimeMs(type);
        const record = { type, accountId, meta, createdAt: Date.now(), expiresAt: Date.now() + lifetime };

        this.tokens.set(this.hash(token), record);
        this.save();

        return { token, expiresAt: record.expiresAt, lifetimeMs: lifetime };
    }

    // Returns the record and burns the token, or null when it is unknown, expired
    // or of another type. A token of the wrong type is left untouched.
    static async consume(type, rawToken) {
        if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 200) return null;

        const hash = this.hash(rawToken);
        const record = this.tokens.get(hash);
        if (!record || record.type !== type) return null;

        this.tokens.delete(hash);
        this.save();

        return record.expiresAt > Date.now() ? record : null;
    }

    // Counts a try against a token without burning it. Past maxAttempts the
    // token is destroyed and the caller has to start over.
    static attempt(type, rawToken, maxAttempts) {
        if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 200) return { error: 'invalid' };

        const hash = this.hash(rawToken);
        const record = this.tokens.get(hash);
        if (!record || record.type !== type) return { error: 'invalid' };

        if (record.expiresAt <= Date.now()) {
            this.tokens.delete(hash);
            this.save();
            return { error: 'invalid' };
        }

        record.attempts = (record.attempts || 0) + 1;
        if (record.attempts > maxAttempts) {
            this.tokens.delete(hash);
            this.save();
            return { error: 'locked' };
        }

        this.save();
        return { record };
    }

    static updateMeta(rawToken, patch) {
        const record = this.tokens.get(this.hash(rawToken));
        if (!record) return false;
        record.meta = { ...(record.meta || {}), ...patch };
        this.save();
        return true;
    }

    static peek(type, rawToken) {
        if (typeof rawToken !== 'string') return false;
        const record = this.tokens.get(this.hash(rawToken));
        return !!record && record.type === type && record.expiresAt > Date.now();
    }

    static revokeFor(accountId, type = null, persist = true) {
        let removed = 0;
        for (const [hash, record] of this.tokens) {
            if (record.accountId === accountId && (!type || record.type === type)) {
                this.tokens.delete(hash);
                removed++;
            }
        }
        if (removed > 0 && persist) this.save();
        return removed;
    }

    // Returns 0 and starts the cooldown when allowed, otherwise the milliseconds left.
    static takeCooldown(type, key, cooldownMs) {
        const id = `${type}:${key}`;
        const now = Date.now();
        const until = this.cooldowns.get(id) || 0;

        if (until > now) return until - now;

        this.cooldowns.set(id, now + cooldownMs);
        return 0;
    }
}

module.exports = OneTimeTokenService;
