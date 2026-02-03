const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const ConfigManager = require('../../manager/config-manager');
const LoggerService = require('../logger/logger-service');

class WebTokenService {
    static exchangeCodes = new Map();
    static tokensFile = path.join(__dirname, 'web-tokens.json');
    static cleanupInterval = null;
    static redisClient = null;
    static useRedis = false;
    static initialized = false;

    static refreshTokens = new Map();
    static deviceIds = new Map();
    static sessionIds = new Map();

    static async initialize() {
        if (this.initialized) return;

        this.useRedis = ConfigManager.get('redisEnabled', false);

        if (this.useRedis) {
            await this.initializeRedis();
        } else {
            await this.loadTokensFromFile();
        }

        const cleanupIntervalMs = ConfigManager.get('webTokenCleanupIntervalMinutes', 60) * 60 * 1000;
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTokens();
        }, cleanupIntervalMs);

        this.initialized = true;
        LoggerService.log('info', `Web Token service initialized (storage: ${this.useRedis ? 'Redis' : 'JSON'})`);
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
                LoggerService.log('error', `Redis error (WebToken): ${err.message}`);
            });

            await this.redisClient.ping();
            this.useRedis = true;
            LoggerService.log('success', 'Web Token service connected to Redis');
        } catch (error) {
            LoggerService.log('warning', `Redis unavailable for Web Tokens, falling back to JSON: ${error.message}`);
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

        LoggerService.log('info', 'Web Token service stopped');
    }

    static async loadTokensFromFile() {
        try {
            if (fs.existsSync(this.tokensFile)) {
                const data = await fsPromises.readFile(this.tokensFile, 'utf8');
                const tokens = JSON.parse(data);

                if (tokens.refreshTokens) {
                    this.refreshTokens = new Map(Object.entries(tokens.refreshTokens));
                }
                if (tokens.deviceIds) {
                    this.deviceIds = new Map(Object.entries(tokens.deviceIds));
                }
                if (tokens.sessionIds) {
                    this.sessionIds = new Map(Object.entries(tokens.sessionIds));
                }

                LoggerService.log('info', `Loaded ${this.refreshTokens.size} refresh tokens, ${this.deviceIds.size} device IDs, ${this.sessionIds.size} session IDs`);
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load web tokens: ${error.message}`);
            this.refreshTokens = new Map();
            this.deviceIds = new Map();
            this.sessionIds = new Map();
        }
    }

    static async saveTokensToFile() {
        if (this.useRedis) return;

        try {
            const tokens = {
                refreshTokens: Object.fromEntries(this.refreshTokens),
                deviceIds: Object.fromEntries(this.deviceIds),
                sessionIds: Object.fromEntries(this.sessionIds),
                lastUpdated: new Date().toISOString()
            };

            const tempFile = this.tokensFile + '.tmp';
            await fsPromises.writeFile(tempFile, JSON.stringify(tokens, null, 2), 'utf8');
            await fsPromises.rename(tempFile, this.tokensFile);
        } catch (error) {
            LoggerService.log('error', `Failed to save web tokens: ${error.message}`);
        }
    }

    static async cleanupExpiredTokens() {
        if (this.useRedis) return; // Redis handles expiration automatically

        const now = new Date();
        let removed = 0;

        for (const [token, data] of this.refreshTokens) {
            if (new Date(data.expiresAt) < now) {
                this.refreshTokens.delete(token);
                removed++;
            }
        }

        for (const [deviceId, data] of this.deviceIds) {
            if (data.expiresAt && new Date(data.expiresAt) < now) {
                this.deviceIds.delete(deviceId);
                removed++;
            }
        }

        for (const [sessionId, data] of this.sessionIds) {
            if (data.expiresAt && new Date(data.expiresAt) < now) {
                this.sessionIds.delete(sessionId);
                removed++;
            }
        }

        if (removed > 0) {
            await this.saveTokensToFile();
            LoggerService.log('info', `Cleaned up ${removed} expired web tokens`);
        }
    }

    static getJwtSecret() {
        return ConfigManager.key('jwtSecret');
    }

    static generateClientToken(clientId) {
        const accountId = `anonymous-${crypto.randomUUID()}`;
        const expiresIn = 28800;

        const payload = {
            accountId: accountId,
            clientId: clientId,
            type: 'client_credentials',
            anonymous: true
        };

        const accessToken = jwt.sign(payload, this.getJwtSecret(), {
            expiresIn: expiresIn
        });

        return {
            access_token: accessToken,
            expires_in: expiresIn,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
            token_type: 'bearer',
            account_id: accountId,
            client_id: clientId,
            internal_client: true,
            client_service: 'fortnite'
        };
    }

    static async generateExchangeCode(accountId) {
        const code = crypto.randomBytes(32).toString('hex');
        const expiryMinutes = ConfigManager.get('exchangeTokenExpiryMinutes', 5);
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

        if (this.useRedis) {
            await this.redisClient.setex(
                `web:exchange:${code}`,
                expiryMinutes * 60,
                JSON.stringify({ accountId, expiresAt: expiresAt.toISOString(), used: false })
            );
        } else {
            this.exchangeCodes.set(code, {
                accountId: accountId,
                expiresAt: expiresAt,
                used: false
            });

            setTimeout(() => {
                this.exchangeCodes.delete(code);
            }, expiryMinutes * 60 * 1000);
        }

        return code;
    }

    static async consumeExchangeCode(code) {
        if (this.useRedis) {
            const data = await this.redisClient.get(`web:exchange:${code}`);
            if (!data) return null;

            const exchangeData = JSON.parse(data);
            if (exchangeData.used) return null;
            if (new Date() > new Date(exchangeData.expiresAt)) {
                await this.redisClient.del(`web:exchange:${code}`);
                return null;
            }

            await this.redisClient.del(`web:exchange:${code}`);
            return exchangeData.accountId;
        } else {
            const exchangeData = this.exchangeCodes.get(code);

            if (!exchangeData) return null;
            if (exchangeData.used) return null;
            if (new Date() > exchangeData.expiresAt) {
                this.exchangeCodes.delete(code);
                return null;
            }

            exchangeData.used = true;
            setTimeout(() => {
                this.exchangeCodes.delete(code);
            }, 1000);

            return exchangeData.accountId;
        }
    }

    static generateAccessToken(accountId, clientId, displayName) {
        const expiresIn = ConfigManager.get('webAccessTokenExpiryHours', ConfigManager.get('accessTokenExpiryHours', 8)) * 3600;

        const payload = {
            accountId: accountId,
            clientId: clientId,
            displayName: displayName,
            type: 'access_token',
            anonymous: false
        };

        const accessToken = jwt.sign(payload, this.getJwtSecret(), {
            expiresIn: expiresIn
        });

        return {
            token: accessToken,
            expiresIn: expiresIn,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
        };
    }

    static async generateRefreshToken(accountId, clientId) {
        const expiresIn = ConfigManager.get('webRefreshTokenExpiryDays', ConfigManager.get('refreshTokenExpiryDays', 30)) * 86400;

        const payload = {
            accountId: accountId,
            clientId: clientId,
            type: 'refresh_token'
        };

        const refreshToken = jwt.sign(payload, this.getJwtSecret(), {
            expiresIn: expiresIn
        });

        const tokenData = {
            accountId: accountId,
            clientId: clientId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
        };

        if (this.useRedis) {
            await this.redisClient.setex(
                `web:refresh:${refreshToken}`,
                expiresIn,
                JSON.stringify(tokenData)
            );
        } else {
            this.refreshTokens.set(refreshToken, tokenData);
            await this.saveTokensToFile();
        }

        return {
            token: refreshToken,
            expiresIn: expiresIn,
            expiresAt: tokenData.expiresAt
        };
    }

    static async generateTokenPair(accountId, clientId, displayName) {
        const access = this.generateAccessToken(accountId, clientId, displayName);
        const refresh = await this.generateRefreshToken(accountId, clientId);

        return {
            access_token: access.token,
            expires_in: access.expiresIn,
            expires_at: access.expiresAt,
            token_type: 'bearer',
            refresh_token: refresh.token,
            refresh_expires: refresh.expiresIn,
            refresh_expires_at: refresh.expiresAt,
            account_id: accountId,
            client_id: clientId,
            internal_client: true,
            client_service: 'fortnite',
            displayName: displayName,
            app: 'fortnite',
            in_app_id: accountId
        };
    }

    static async verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.getJwtSecret());

            if (decoded.type === 'refresh_token') {
                let refreshData;

                if (this.useRedis) {
                    const data = await this.redisClient.get(`web:refresh:${token}`);
                    refreshData = data ? JSON.parse(data) : null;
                } else {
                    refreshData = this.refreshTokens.get(token);
                }

                if (!refreshData) {
                    return {
                        valid: false,
                        error: 'Refresh token not found or revoked'
                    };
                }

                if (new Date(refreshData.expiresAt) < new Date()) {
                    await this.revokeRefreshToken(token);
                    return {
                        valid: false,
                        error: 'Refresh token expired'
                    };
                }
            }

            return {
                valid: true,
                payload: decoded
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }

    static extractTokenFromHeader(authHeader) {
        if (!authHeader) return null;

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
            return null;
        }

        return parts[1];
    }

    static async refreshAccessToken(refreshToken, displayName) {
        const verification = await this.verifyToken(refreshToken);

        if (!verification.valid) return null;
        if (verification.payload.type !== 'refresh_token') return null;

        return this.generateAccessToken(
            verification.payload.accountId,
            verification.payload.clientId,
            displayName
        );
    }

    static async revokeRefreshToken(refreshToken) {
        if (this.useRedis) {
            const result = await this.redisClient.del(`web:refresh:${refreshToken}`);
            return result > 0;
        } else {
            if (this.refreshTokens.has(refreshToken)) {
                this.refreshTokens.delete(refreshToken);
                await this.saveTokensToFile();
                return true;
            }
            return false;
        }
    }

    static async revokeAllRefreshTokens(accountId) {
        let modified = false;

        if (this.useRedis) {
            const keys = await this.redisClient.keys('web:refresh:*');
            for (const key of keys) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId) {
                        await this.redisClient.del(key);
                        modified = true;
                    }
                }
            }
        } else {
            for (const [token, data] of this.refreshTokens) {
                if (data.accountId === accountId) {
                    this.refreshTokens.delete(token);
                    modified = true;
                }
            }

            if (modified) {
                await this.saveTokensToFile();
            }
        }

        return modified;
    }

    static async generateSessionId(accountId) {
        const sessionId = crypto.randomBytes(16).toString('hex');
        const expiresIn = ConfigManager.get('csrfSessionExpiryHours', 24) * 3600;

        const sessionData = {
            accountId: accountId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
        };

        if (this.useRedis) {
            await this.redisClient.setex(
                `web:session:${sessionId}`,
                expiresIn,
                JSON.stringify(sessionData)
            );
        } else {
            this.sessionIds.set(sessionId, sessionData);
            await this.saveTokensToFile();
        }

        return sessionId;
    }

    static async generateDeviceId(accountId) {
        const deviceId = crypto.randomBytes(16).toString('hex');
        const expiresIn = ConfigManager.get('webRefreshTokenExpiryDays', 30) * 86400;

        const deviceData = {
            accountId: accountId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
        };

        if (this.useRedis) {
            await this.redisClient.setex(
                `web:device:${deviceId}`,
                expiresIn,
                JSON.stringify(deviceData)
            );
        } else {
            this.deviceIds.set(deviceId, deviceData);
            await this.saveTokensToFile();
        }

        return deviceId;
    }

    static generateRandomToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    static async getRefreshTokenInfo(refreshToken) {
        if (this.useRedis) {
            const data = await this.redisClient.get(`web:refresh:${refreshToken}`);
            return data ? JSON.parse(data) : null;
        } else {
            return this.refreshTokens.get(refreshToken) || null;
        }
    }

    static async getAllRefreshTokensForAccount(accountId) {
        const accountTokens = [];

        if (this.useRedis) {
            const keys = await this.redisClient.keys('web:refresh:*');
            for (const key of keys) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId) {
                        const token = key.replace('web:refresh:', '');
                        accountTokens.push({ token, ...parsed });
                    }
                }
            }
        } else {
            for (const [token, data] of this.refreshTokens) {
                if (data.accountId === accountId) {
                    accountTokens.push({ token, ...data });
                }
            }
        }

        return accountTokens;
    }

    static getStats() {
        return {
            refreshTokens: this.useRedis ? 'N/A (Redis)' : this.refreshTokens.size,
            deviceIds: this.useRedis ? 'N/A (Redis)' : this.deviceIds.size,
            sessionIds: this.useRedis ? 'N/A (Redis)' : this.sessionIds.size,
            exchangeCodes: this.exchangeCodes.size,
            storage: this.useRedis ? 'redis' : 'json'
        };
    }
}

module.exports = WebTokenService;
