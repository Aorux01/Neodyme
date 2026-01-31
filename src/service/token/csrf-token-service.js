const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const ConfigManager = require('../../manager/config-manager');
const LoggerService = require('../logger/logger-service');

class CsrfTokenService {
    static tokens = new Map();
    static tokensFile = path.join(__dirname, 'csrf-tokens.json');
    static cleanupInterval = null;
    static redisClient = null;
    static useRedis = false;
    static initialized = false;

    static async initialize() {
        if (this.initialized) return;

        this.useRedis = ConfigManager.get('redisEnabled', false);

        if (this.useRedis) {
            await this.initializeRedis();
        } else {
            await this.loadTokensFromFile();
        }

        const cleanupIntervalMs = ConfigManager.get('csrfCleanupIntervalMinutes', 60) * 60 * 1000;
        this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);

        this.initialized = true;
        LoggerService.log('info', `CSRF Token service initialized (storage: ${this.useRedis ? 'Redis' : 'JSON'})`);
    }

    static async initializeRedis() {
        try {
            const Redis = require('ioredis');
            const redisHost = ConfigManager.get('redisHost', '127.0.0.1');
            const redisPort = ConfigManager.get('redisPort', 6379);
            const redisPassword = ConfigManager.get('redisPassword', '');

            this.redisClient = new Redis({
                host: redisHost,
                port: redisPort,
                password: redisPassword || undefined,
                retryStrategy: (times) => Math.min(times * 50, 2000)
            });

            this.redisClient.on('error', (err) => {
                LoggerService.log('error', `Redis error (CSRF): ${err.message}`);
            });

            await this.redisClient.ping();
            this.useRedis = true;
            LoggerService.log('success', 'CSRF Token service connected to Redis');
        } catch (error) {
            LoggerService.log('warning', `Redis unavailable for CSRF tokens, falling back to JSON: ${error.message}`);
            this.useRedis = false;
            await this.loadTokensFromFile();
        }
    }

    static async shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        if (!this.useRedis) {
            await this.saveTokensToFile();
        }

        if (this.redisClient) {
            await this.redisClient.quit();
        }

        LoggerService.log('info', 'CSRF Token service stopped');
    }

    static getTokenExpiry() {
        return ConfigManager.get('csrfTokenExpiryMinutes', 60) * 60 * 1000;
    }

    static getTokenExpirySeconds() {
        return ConfigManager.get('csrfTokenExpiryMinutes', 60) * 60;
    }

    static async loadTokensFromFile() {
        try {
            if (fs.existsSync(this.tokensFile)) {
                const data = await fsPromises.readFile(this.tokensFile, 'utf8');
                const parsed = JSON.parse(data);

                if (parsed.tokens && Array.isArray(parsed.tokens)) {
                    const now = Date.now();
                    let loaded = 0;

                    for (const tokenData of parsed.tokens) {
                        if (tokenData.createdAt + this.getTokenExpiry() > now) {
                            this.tokens.set(tokenData.token, {
                                sessionId: tokenData.sessionId,
                                createdAt: tokenData.createdAt
                            });
                            loaded++;
                        }
                    }

                    LoggerService.log('info', `Loaded ${loaded} valid CSRF tokens from file`);
                }
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load CSRF tokens: ${error.message}`);
            this.tokens = new Map();
        }
    }

    static async saveTokensToFile() {
        if (this.useRedis) return;

        try {
            const tokensArray = [];
            for (const [token, data] of this.tokens) {
                tokensArray.push({
                    token,
                    sessionId: data.sessionId,
                    createdAt: data.createdAt
                });
            }

            const fileData = {
                tokens: tokensArray,
                lastUpdated: new Date().toISOString()
            };

            const tempFile = this.tokensFile + '.tmp';
            await fsPromises.writeFile(tempFile, JSON.stringify(fileData, null, 2), 'utf8');
            await fsPromises.rename(tempFile, this.tokensFile);
        } catch (error) {
            LoggerService.log('error', `Failed to save CSRF tokens: ${error.message}`);
        }
    }

    static async generateToken(sessionId) {
        const token = crypto.randomBytes(32).toString('hex');
        const createdAt = Date.now();

        if (this.useRedis) {
            await this.redisClient.setex(
                `csrf:${token}`,
                this.getTokenExpirySeconds(),
                JSON.stringify({ sessionId, createdAt })
            );
        } else {
            this.tokens.set(token, { sessionId, createdAt });
            this.saveTokensToFile();
        }

        return token;
    }

    static async validateToken(token, sessionId) {
        if (this.useRedis) {
            const data = await this.redisClient.get(`csrf:${token}`);
            if (!data) return false;

            const parsed = JSON.parse(data);

            if (Date.now() - parsed.createdAt > this.getTokenExpiry()) {
                await this.redisClient.del(`csrf:${token}`);
                return false;
            }

            if (parsed.sessionId !== sessionId) return false;

            await this.redisClient.del(`csrf:${token}`);
            return true;
        } else {
            const data = this.tokens.get(token);
            if (!data) return false;

            if (Date.now() - data.createdAt > this.getTokenExpiry()) {
                this.tokens.delete(token);
                this.saveTokensToFile();
                return false;
            }

            if (data.sessionId !== sessionId) return false;

            this.tokens.delete(token);
            this.saveTokensToFile();
            return true;
        }
    }

    static async cleanup() {
        if (this.useRedis) return; // Redis handles expiration automatically

        const now = Date.now();
        const expiry = this.getTokenExpiry();
        let removed = 0;

        for (const [token, data] of this.tokens) {
            if (now - data.createdAt > expiry) {
                this.tokens.delete(token);
                removed++;
            }
        }

        if (removed > 0) {
            await this.saveTokensToFile();
            LoggerService.log('info', `Cleaned up ${removed} expired CSRF tokens`);
        }
    }

    static getCookieOptions() {
        return {
            httpOnly: true,
            secure: ConfigManager.get('secureCookies', false),
            sameSite: 'strict',
            maxAge: ConfigManager.get('csrfSessionExpiryHours', 24) * 60 * 60 * 1000
        };
    }

    static getStats() {
        return {
            tokens: this.useRedis ? 'N/A (Redis)' : this.tokens.size,
            storage: this.useRedis ? 'redis' : 'json'
        };
    }
}

async function csrfProtection(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const sessionId = req.cookies?.neodyme_session || req.headers['x-session-id'];
    const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;

    if (!sessionId || !csrfToken) {
        return res.status(403).json({
            success: false,
            error: 'CSRF validation failed',
            message: 'Missing security token'
        });
    }

    const isValid = await CsrfTokenService.validateToken(csrfToken, sessionId);
    if (!isValid) {
        return res.status(403).json({
            success: false,
            error: 'CSRF validation failed',
            message: 'Invalid or expired security token'
        });
    }

    next();
}

async function generateCsrfToken(req, res) {
    let sessionId = req.cookies?.neodyme_session;

    if (!sessionId) {
        sessionId = crypto.randomBytes(16).toString('hex');
        res.cookie('neodyme_session', sessionId, CsrfTokenService.getCookieOptions());
    }

    const csrfToken = await CsrfTokenService.generateToken(sessionId);

    res.json({
        success: true,
        csrfToken: csrfToken
    });
}

module.exports = {
    csrfProtection,
    generateCsrfToken,
    CsrfTokenService
};
