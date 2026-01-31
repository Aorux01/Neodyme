const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const ConfigManager = require('../../manager/config-manager');
const LoggerService = require('../logger/logger-service');

class TokenService {
    static tokensFile = path.join(__dirname, 'tokens.json');
    static accessTokens = new Map();
    static refreshTokens = new Map();
    static clientTokens = new Map();
    static JWT_SECRET = null;
    static JWT_SECRET_CREATED = null;
    static fileLock = false;
    static redisClient = null;
    static useRedis = false;
    static initialized = false;

    static async initialize() {
        if (this.initialized) return;

        await this.loadJwtSecret();

        this.useRedis = ConfigManager.get('redisEnabled', false);

        if (this.useRedis) {
            await this.initializeRedis();
        } else {
            await this.loadTokensFromFile();
        }

        this.initialized = true;
        LoggerService.log('info', `TokenService initialized (storage: ${this.useRedis ? 'Redis' : 'JSON'})`);

        setInterval(() => this.cleanupExpiredTokens(), 3600000);
        setInterval(() => this.checkJwtSecretRotation(), 86400000);
    }

    static async loadJwtSecret() {
        this.JWT_SECRET = ConfigManager.key('jwtSecret');
        this.JWT_SECRET_CREATED = ConfigManager.key('jwtSecretCreated');

        if (!this.JWT_SECRET || this.JWT_SECRET.length < 64) {
            await this.rotateJwtSecret();
        } else if (this.shouldRotateSecret()) {
            LoggerService.log('info', 'JWT secret rotation required (monthly)');
            await this.rotateJwtSecret();
        }
    }

    static shouldRotateSecret() {
        if (!this.JWT_SECRET_CREATED) return true;

        const created = new Date(this.JWT_SECRET_CREATED);
        const now = new Date();
        const daysDiff = (now - created) / (1000 * 60 * 60 * 24);

        return daysDiff >= 30;
    }

    static async rotateJwtSecret() {
        const newSecret = crypto.randomBytes(32).toString('hex');
        const envPath = path.join(__dirname, '..', '..', '..', '.env');

        try {
            let envContent = '';
            if (fs.existsSync(envPath)) {
                envContent = await fsPromises.readFile(envPath, 'utf-8');
            }

            const lines = envContent.split('\n').filter(line =>
                !line.startsWith('jwtSecret=') && !line.startsWith('jwtSecretCreated=')
            );

            lines.push(`jwtSecret=${newSecret}`);
            lines.push(`jwtSecretCreated=${new Date().toISOString()}`);

            await fsPromises.writeFile(envPath, lines.join('\n'), 'utf-8');

            this.JWT_SECRET = newSecret;
            this.JWT_SECRET_CREATED = new Date().toISOString();

            if (this.accessTokens.size > 0 || this.refreshTokens.size > 0) {
                LoggerService.log('warning', 'JWT secret rotated - existing tokens invalidated');
                await this.revokeAllTokens();
            } else {
                LoggerService.log('success', 'JWT secret generated (256 bits)');
            }
        } catch (error) {
            LoggerService.log('error', `Failed to rotate JWT secret: ${error.message}`);
        }
    }

    static async checkJwtSecretRotation() {
        if (this.shouldRotateSecret()) {
            await this.rotateJwtSecret();
        }
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
                LoggerService.log('error', `Redis error: ${err.message}`);
            });

            this.redisClient.on('connect', () => {
                LoggerService.log('success', 'Connected to Redis for token storage');
            });

            await this.redisClient.ping();
            this.useRedis = true;
        } catch (error) {
            LoggerService.log('warning', `Redis unavailable, falling back to JSON: ${error.message}`);
            this.useRedis = false;
            await this.loadTokensFromFile();
        }
    }

    static hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    static getJwtSecret() {
        return this.JWT_SECRET;
    }

    static encryptData(data) {
        if (!ConfigManager.get('tokenEncryptionEnabled', false)) {
            return data;
        }

        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync(this.JWT_SECRET, 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return {
            encrypted: true,
            data: encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    static decryptData(encryptedData) {
        if (!encryptedData.encrypted) {
            return encryptedData;
        }

        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync(this.JWT_SECRET, 'salt', 32);
        const decipher = crypto.createDecipheriv(
            algorithm,
            key,
            Buffer.from(encryptedData.iv, 'hex')
        );

        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

        let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    }

    static getIpSubnet(ip) {
        if (!ip) return 'unknown';
        if (ip.includes(':')) {
            const parts = ip.split(':');
            return parts.slice(0, 4).join(':');
        }
        const parts = ip.split('.');
        return parts.slice(0, 3).join('.');
    }

    static generateDeviceFingerprint(deviceId, userAgent) {
        const data = `${deviceId || 'unknown'}:${userAgent || 'unknown'}`;
        return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
    }

    static async acquireLock() {
        while (this.fileLock) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.fileLock = true;
    }

    static releaseLock() {
        this.fileLock = false;
    }

    static async loadTokensFromFile() {
        try {
            if (fs.existsSync(this.tokensFile)) {
                const data = await fsPromises.readFile(this.tokensFile, 'utf8');
                const tokens = JSON.parse(data);

                const decryptIfNeeded = (token) => {
                    try {
                        return token.encrypted ? this.decryptData(token) : token;
                    } catch (error) {
                        LoggerService.log('warning', `Failed to decrypt token: ${error.message}`);
                        return null;
                    }
                };

                this.accessTokens = new Map((tokens.accessTokens || [])
                    .map(t => decryptIfNeeded(t))
                    .filter(t => t !== null)
                    .map(t => [t.hash, t]));

                this.refreshTokens = new Map((tokens.refreshTokens || [])
                    .map(t => decryptIfNeeded(t))
                    .filter(t => t !== null)
                    .map(t => [t.hash, t]));

                this.clientTokens = new Map((tokens.clientTokens || [])
                    .map(t => decryptIfNeeded(t))
                    .filter(t => t !== null)
                    .map(t => [t.hash, t]));

                LoggerService.log('info', `Loaded ${this.accessTokens.size} access, ${this.refreshTokens.size} refresh, ${this.clientTokens.size} client tokens`);
            } else {
                await this.saveTokensToFile();
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load tokens: ${error.message}`);
            this.accessTokens = new Map();
            this.refreshTokens = new Map();
            this.clientTokens = new Map();
        }
    }

    static async saveTokensToFile() {
        if (this.useRedis) return;

        await this.acquireLock();
        try {
            const encryptIfNeeded = (tokenArray) => {
                return tokenArray.map(token => this.encryptData(token));
            };

            const tokens = {
                accessTokens: encryptIfNeeded(Array.from(this.accessTokens.values())),
                refreshTokens: encryptIfNeeded(Array.from(this.refreshTokens.values())),
                clientTokens: encryptIfNeeded(Array.from(this.clientTokens.values())),
                lastUpdated: new Date().toISOString(),
                encrypted: ConfigManager.get('tokenEncryptionEnabled', false)
            };

            const tempFile = this.tokensFile + '.tmp';
            await fsPromises.writeFile(tempFile, JSON.stringify(tokens, null, 2), 'utf8');
            await fsPromises.rename(tempFile, this.tokensFile);
        } catch (error) {
            LoggerService.log('error', `Failed to save tokens: ${error.message}`);
        } finally {
            this.releaseLock();
        }
    }

    static generateId() {
        return crypto.randomUUID();
    }

    static generateRandomToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    static async storeToken(type, hash, data, expiresInSeconds) {
        if (this.useRedis) {
            const key = `token:${type}:${hash}`;
            await this.redisClient.setex(key, expiresInSeconds, JSON.stringify(data));
        } else {
            const map = type === 'access' ? this.accessTokens :
                        type === 'refresh' ? this.refreshTokens : this.clientTokens;
            map.set(hash, data);
            await this.saveTokensToFile();
        }
    }

    static async getToken(type, hash) {
        if (this.useRedis) {
            const key = `token:${type}:${hash}`;
            const data = await this.redisClient.get(key);
            return data ? JSON.parse(data) : null;
        } else {
            const map = type === 'access' ? this.accessTokens :
                        type === 'refresh' ? this.refreshTokens : this.clientTokens;
            return map.get(hash) || null;
        }
    }

    static async deleteToken(type, hash) {
        if (this.useRedis) {
            const key = `token:${type}:${hash}`;
            await this.redisClient.del(key);
        } else {
            const map = type === 'access' ? this.accessTokens :
                        type === 'refresh' ? this.refreshTokens : this.clientTokens;
            map.delete(hash);
            await this.saveTokensToFile();
        }
    }

    static async createClientToken(clientId, grantType, ip, expiresIn = 4) {
        const payload = {
            p: Buffer.from(this.generateId()).toString('base64'),
            clsvc: 'fortnite',
            t: 's',
            mver: false,
            clid: clientId,
            ic: true,
            am: grantType,
            jti: this.generateId().replace(/-/g, ''),
            creation_date: new Date().toISOString(),
            hours_expire: expiresIn
        };

        const token = jwt.sign(payload, this.getJwtSecret(), { algorithm: 'HS256', expiresIn: `${expiresIn}h` });
        const fullToken = `eg1~${token}`;
        const hash = this.hashToken(fullToken);

        await this.storeToken('client', hash, {
            hash,
            ip,
            createdAt: Date.now(),
            expiresAt: Date.now() + (expiresIn * 3600000)
        }, expiresIn * 3600);

        return fullToken;
    }

    static async createAccessToken(accountId, username, clientId, grantType, deviceId, expiresIn = 8, ip = null) {
        const payload = {
            app: 'fortnite',
            sub: accountId,
            dvid: deviceId,
            mver: false,
            clid: clientId,
            dn: username,
            am: grantType,
            p: Buffer.from(this.generateId()).toString('base64'),
            iai: accountId,
            sec: 1,
            clsvc: 'fortnite',
            t: 's',
            ic: true,
            jti: this.generateId().replace(/-/g, ''),
            creation_date: new Date().toISOString(),
            hours_expire: expiresIn
        };

        const token = jwt.sign(payload, this.getJwtSecret(), { algorithm: 'HS256', expiresIn: `${expiresIn}h` });
        const fullToken = `eg1~${token}`;
        const hash = this.hashToken(fullToken);

        await this.storeToken('access', hash, {
            hash,
            accountId,
            sessionId: payload.jti,
            deviceId,
            ip,
            ipSubnet: this.getIpSubnet(ip),
            createdAt: Date.now(),
            expiresAt: Date.now() + (expiresIn * 3600000),
            lastActivity: Date.now()
        }, expiresIn * 3600);

        return fullToken;
    }

    static async createRefreshToken(accountId, clientId, grantType, deviceId, expiresIn = 24, ip = null) {
        const payload = {
            sub: accountId,
            dvid: deviceId,
            t: 'r',
            clid: clientId,
            am: grantType,
            jti: this.generateId().replace(/-/g, ''),
            creation_date: new Date().toISOString(),
            hours_expire: expiresIn
        };

        const token = jwt.sign(payload, this.getJwtSecret(), { algorithm: 'HS256', expiresIn: `${expiresIn}h` });
        const fullToken = `eg1~${token}`;
        const hash = this.hashToken(fullToken);

        await this.storeToken('refresh', hash, {
            hash,
            accountId,
            sessionId: payload.jti,
            deviceId,
            ip,
            ipSubnet: this.getIpSubnet(ip),
            createdAt: Date.now(),
            expiresAt: Date.now() + (expiresIn * 3600000),
            tokenFamily: payload.jti
        }, expiresIn * 3600);

        return fullToken;
    }

    static verifyToken(token) {
        try {
            if (!token.startsWith('eg1~')) return null;

            const rawToken = token.replace('eg1~', '');
            const decoded = jwt.verify(rawToken, this.getJwtSecret(), { algorithms: ['HS256'] });

            const isExpired = new Date(decoded.creation_date).getTime() + (decoded.hours_expire * 3600000) <= Date.now();
            if (isExpired) {
                this.removeToken(token);
                return null;
            }

            return decoded;
        } catch (error) {
            this.removeToken(token);
            return null;
        }
    }

    static async isValidAccessToken(token) {
        const hash = this.hashToken(token);
        const data = await this.getToken('access', hash);
        return data !== null;
    }

    static async isValidClientToken(token) {
        const hash = this.hashToken(token);
        const data = await this.getToken('client', hash);
        return data !== null;
    }

    static async isValidRefreshToken(token) {
        const hash = this.hashToken(token);
        const data = await this.getToken('refresh', hash);
        return data !== null;
    }

    static async removeToken(token) {
        const hash = this.hashToken(token);
        let removed = false;

        if (await this.getToken('access', hash)) {
            await this.deleteToken('access', hash);
            removed = true;
        }
        if (await this.getToken('refresh', hash)) {
            await this.deleteToken('refresh', hash);
            removed = true;
        }
        if (await this.getToken('client', hash)) {
            await this.deleteToken('client', hash);
            removed = true;
        }

        return removed;
    }

    static async removeAllTokensForAccount(accountId) {
        if (this.useRedis) {
            const accessKeys = await this.redisClient.keys('token:access:*');
            const refreshKeys = await this.redisClient.keys('token:refresh:*');

            for (const key of [...accessKeys, ...refreshKeys]) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId) {
                        await this.redisClient.del(key);
                    }
                }
            }
        } else {
            for (const [hash, data] of this.accessTokens) {
                if (data.accountId === accountId) this.accessTokens.delete(hash);
            }
            for (const [hash, data] of this.refreshTokens) {
                if (data.accountId === accountId) this.refreshTokens.delete(hash);
            }
            await this.saveTokensToFile();
        }
    }

    static async removeOtherTokensForAccount(accountId, currentToken) {
        const currentHash = this.hashToken(currentToken);

        if (this.useRedis) {
            const accessKeys = await this.redisClient.keys('token:access:*');
            const refreshKeys = await this.redisClient.keys('token:refresh:*');

            for (const key of [...accessKeys, ...refreshKeys]) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId && parsed.hash !== currentHash) {
                        await this.redisClient.del(key);
                    }
                }
            }
        } else {
            for (const [hash, data] of this.accessTokens) {
                if (data.accountId === accountId && hash !== currentHash) {
                    this.accessTokens.delete(hash);
                }
            }
            for (const [hash, data] of this.refreshTokens) {
                if (data.accountId === accountId && hash !== currentHash) {
                    this.refreshTokens.delete(hash);
                }
            }
            await this.saveTokensToFile();
        }
    }

    static async cleanupExpiredTokens() {
        if (this.useRedis) return;

        const now = Date.now();
        let removed = 0;

        for (const [hash, data] of this.accessTokens) {
            if (data.expiresAt && data.expiresAt <= now) {
                this.accessTokens.delete(hash);
                removed++;
            }
        }

        for (const [hash, data] of this.refreshTokens) {
            if (data.expiresAt && data.expiresAt <= now) {
                this.refreshTokens.delete(hash);
                removed++;
            }
        }

        for (const [hash, data] of this.clientTokens) {
            if (data.expiresAt && data.expiresAt <= now) {
                this.clientTokens.delete(hash);
                removed++;
            }
        }

        if (removed > 0) {
            await this.saveTokensToFile();
            LoggerService.log('info', `Cleaned up ${removed} expired tokens`);
        }
    }

    static getTokenStats() {
        return {
            accessTokens: this.accessTokens.size,
            refreshTokens: this.refreshTokens.size,
            clientTokens: this.clientTokens.size,
            total: this.accessTokens.size + this.refreshTokens.size + this.clientTokens.size,
            storage: this.useRedis ? 'redis' : 'json'
        };
    }

    static async getTokensForAccount(accountId) {
        const access = [];
        const refresh = [];

        if (this.useRedis) {
            const accessKeys = await this.redisClient.keys('token:access:*');
            const refreshKeys = await this.redisClient.keys('token:refresh:*');

            for (const key of accessKeys) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId) access.push(parsed);
                }
            }
            for (const key of refreshKeys) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId) refresh.push(parsed);
                }
            }
        } else {
            for (const data of this.accessTokens.values()) {
                if (data.accountId === accountId) access.push(data);
            }
            for (const data of this.refreshTokens.values()) {
                if (data.accountId === accountId) refresh.push(data);
            }
        }

        return { accessTokens: access, refreshTokens: refresh };
    }

    static async revokeAllTokens() {
        if (this.useRedis) {
            const keys = await this.redisClient.keys('token:*');
            if (keys.length > 0) {
                await this.redisClient.del(...keys);
            }
            return keys.length;
        } else {
            const total = this.accessTokens.size + this.refreshTokens.size + this.clientTokens.size;
            this.accessTokens.clear();
            this.refreshTokens.clear();
            this.clientTokens.clear();
            await this.saveTokensToFile();
            return total;
        }
    }

    static async getActiveSessionsForAccount(accountId) {
        const sessions = new Map();

        if (this.useRedis) {
            const accessKeys = await this.redisClient.keys('token:access:*');
            const refreshKeys = await this.redisClient.keys('token:refresh:*');

            for (const key of accessKeys) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId && parsed.sessionId) {
                        if (!sessions.has(parsed.sessionId)) {
                            sessions.set(parsed.sessionId, {
                                sessionId: parsed.sessionId,
                                deviceId: parsed.deviceId,
                                ip: parsed.ip,
                                ipSubnet: parsed.ipSubnet,
                                createdAt: parsed.createdAt,
                                lastActivity: parsed.lastActivity,
                                expiresAt: parsed.expiresAt,
                                type: 'access'
                            });
                        }
                    }
                }
            }

            for (const key of refreshKeys) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId && parsed.sessionId) {
                        const existing = sessions.get(parsed.sessionId);
                        if (existing) {
                            existing.hasRefreshToken = true;
                        } else {
                            sessions.set(parsed.sessionId, {
                                sessionId: parsed.sessionId,
                                deviceId: parsed.deviceId,
                                ip: parsed.ip,
                                ipSubnet: parsed.ipSubnet,
                                createdAt: parsed.createdAt,
                                expiresAt: parsed.expiresAt,
                                type: 'refresh',
                                hasRefreshToken: true
                            });
                        }
                    }
                }
            }
        } else {
            for (const data of this.accessTokens.values()) {
                if (data.accountId === accountId && data.sessionId) {
                    if (!sessions.has(data.sessionId)) {
                        sessions.set(data.sessionId, {
                            sessionId: data.sessionId,
                            deviceId: data.deviceId,
                            ip: data.ip,
                            ipSubnet: data.ipSubnet,
                            createdAt: data.createdAt,
                            lastActivity: data.lastActivity,
                            expiresAt: data.expiresAt,
                            type: 'access'
                        });
                    }
                }
            }

            for (const data of this.refreshTokens.values()) {
                if (data.accountId === accountId && data.sessionId) {
                    const existing = sessions.get(data.sessionId);
                    if (existing) {
                        existing.hasRefreshToken = true;
                    } else {
                        sessions.set(data.sessionId, {
                            sessionId: data.sessionId,
                            deviceId: data.deviceId,
                            ip: data.ip,
                            ipSubnet: data.ipSubnet,
                            createdAt: data.createdAt,
                            expiresAt: data.expiresAt,
                            type: 'refresh',
                            hasRefreshToken: true
                        });
                    }
                }
            }
        }

        return Array.from(sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    static async removeTokenBySessionId(accountId, sessionId) {
        let removed = false;

        if (this.useRedis) {
            const accessKeys = await this.redisClient.keys('token:access:*');
            const refreshKeys = await this.redisClient.keys('token:refresh:*');

            for (const key of [...accessKeys, ...refreshKeys]) {
                const data = await this.redisClient.get(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.accountId === accountId && parsed.sessionId === sessionId) {
                        await this.redisClient.del(key);
                        removed = true;
                    }
                }
            }
        } else {
            for (const [hash, data] of this.accessTokens) {
                if (data.accountId === accountId && data.sessionId === sessionId) {
                    this.accessTokens.delete(hash);
                    removed = true;
                }
            }
            for (const [hash, data] of this.refreshTokens) {
                if (data.accountId === accountId && data.sessionId === sessionId) {
                    this.refreshTokens.delete(hash);
                    removed = true;
                }
            }
            if (removed) {
                await this.saveTokensToFile();
            }
        }

        return removed;
    }

    static async validateTokenBinding(token, requestIp) {
        const hash = this.hashToken(token);
        const tokenData = await this.getToken('access', hash) || await this.getToken('refresh', hash);

        if (!tokenData) return false;

        if (tokenData.ipSubnet && requestIp) {
            const requestSubnet = this.getIpSubnet(requestIp);
            if (tokenData.ipSubnet !== requestSubnet) {
                LoggerService.log('warning', `IP subnet mismatch for token: ${tokenData.ipSubnet} vs ${requestSubnet}`);
                return false;
            }
        }

        return true;
    }

    static async updateTokenActivity(token) {
        const hash = this.hashToken(token);
        const tokenData = await this.getToken('access', hash);

        if (tokenData) {
            tokenData.lastActivity = Date.now();

            if (this.useRedis) {
                const key = `token:access:${hash}`;
                const ttl = await this.redisClient.ttl(key);
                if (ttl > 0) {
                    await this.redisClient.setex(key, ttl, JSON.stringify(tokenData));
                }
            } else {
                this.accessTokens.set(hash, tokenData);
            }
        }
    }
}

module.exports = TokenService;
