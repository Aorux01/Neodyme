const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ConfigManager = require('../../manager/ConfigManager');
const LoggerService = require('../logger/LoggerService');

class TokenService {
    static tokensFile = path.join(__dirname, 'Tokens.json');
    static accessTokens = [];
    static refreshTokens = [];
    static clientTokens = [];
    static JWT_SECRET = null;
    static fileLock = false;
    static pendingWrites = [];

    static initialize() {
        this.JWT_SECRET = ConfigManager.key('jwtSecret');
        if (!this.JWT_SECRET) {
            LoggerService.log('error', 'JWT secret not configured! Please set jwtSecret in .env');
        }

        this.loadTokensFromFile();
        LoggerService.log('info', 'TokenService initialized with persistent storage');

        setInterval(() => {
            this.cleanupExpiredTokens();
        }, 3600000); // Every hour
    }

    static getJwtSecret() {
        if (!this.JWT_SECRET) {
            this.JWT_SECRET = ConfigManager.key('jwtSecret');
        }
        return this.JWT_SECRET;
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

    static loadTokensFromFile() {
        try {
            if (fs.existsSync(this.tokensFile)) {
                const data = fs.readFileSync(this.tokensFile, 'utf8');
                const tokens = JSON.parse(data);
                this.accessTokens = tokens.accessTokens || [];
                this.refreshTokens = tokens.refreshTokens || [];
                this.clientTokens = tokens.clientTokens || [];
                LoggerService.log('info', `Loaded ${this.accessTokens.length} access tokens, ${this.refreshTokens.length} refresh tokens, ${this.clientTokens.length} client tokens from file`);
            } else {
                this.saveTokensToFile();
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load tokens from file: ${error.message}`);
            this.accessTokens = [];
            this.refreshTokens = [];
            this.clientTokens = [];
        }
    }

    static async saveTokensToFile() {
        await this.acquireLock();
        try {
            const tokens = {
                accessTokens: this.accessTokens,
                refreshTokens: this.refreshTokens,
                clientTokens: this.clientTokens,
                lastUpdated: new Date().toISOString()
            };

            // Write to temp file first, then rename (atomic operation)
            const tempFile = this.tokensFile + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(tokens, null, 2), 'utf8');
            fs.renameSync(tempFile, this.tokensFile);
        } catch (error) {
            LoggerService.log('error', `Failed to save tokens to file: ${error.message}`);
        } finally {
            this.releaseLock();
        }
    }

    static generateId() {
        return crypto.randomUUID();
    }

    static createClientToken(clientId, grantType, ip, expiresIn = 4) {
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

        this.clientTokens.push({ ip, token: fullToken, createdAt: Date.now() });
        this.saveTokensToFile();

        return fullToken;
    }

    static createAccessToken(accountId, username, clientId, grantType, deviceId, expiresIn = 8) {
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

        this.accessTokens.push({ accountId, token: fullToken, createdAt: Date.now() });
        this.saveTokensToFile();

        return fullToken;
    }

    static createRefreshToken(accountId, clientId, grantType, deviceId, expiresIn = 24) {
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

        this.refreshTokens.push({ accountId, token: fullToken, createdAt: Date.now() });
        this.saveTokensToFile();

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

    static isValidAccessToken(token) {
        return this.accessTokens.some(t => t.token === token);
    }

    static isValidClientToken(token) {
        return this.clientTokens.some(t => t.token === token);
    }

    static isValidRefreshToken(token) {
        return this.refreshTokens.some(t => t.token === token);
    }

    static removeToken(token) {
        let removed = false;

        const accessIndex = this.accessTokens.findIndex(t => t.token === token);
        if (accessIndex !== -1) {
            this.accessTokens.splice(accessIndex, 1);
            removed = true;
        }

        const refreshIndex = this.refreshTokens.findIndex(t => t.token === token);
        if (refreshIndex !== -1) {
            this.refreshTokens.splice(refreshIndex, 1);
            removed = true;
        }

        const clientIndex = this.clientTokens.findIndex(t => t.token === token);
        if (clientIndex !== -1) {
            this.clientTokens.splice(clientIndex, 1);
            removed = true;
        }

        if (removed) {
            this.saveTokensToFile();
        }

        return removed;
    }

    static removeAllTokensForAccount(accountId) {
        const beforeAccess = this.accessTokens.length;
        const beforeRefresh = this.refreshTokens.length;

        this.accessTokens = this.accessTokens.filter(t => t.accountId !== accountId);
        this.refreshTokens = this.refreshTokens.filter(t => t.accountId !== accountId);

        if (beforeAccess !== this.accessTokens.length || beforeRefresh !== this.refreshTokens.length) {
            this.saveTokensToFile();
        }
    }

    static removeOtherTokensForAccount(accountId, currentToken) {
        const beforeAccess = this.accessTokens.length;
        const beforeRefresh = this.refreshTokens.length;

        this.accessTokens = this.accessTokens.filter(t =>
            t.accountId !== accountId || t.token === currentToken
        );
        this.refreshTokens = this.refreshTokens.filter(t =>
            t.accountId !== accountId || t.token === currentToken
        );

        if (beforeAccess !== this.accessTokens.length || beforeRefresh !== this.refreshTokens.length) {
            this.saveTokensToFile();
        }
    }

    static cleanupExpiredTokens() {
        const now = Date.now();
        const beforeAccess = this.accessTokens.length;
        const beforeRefresh = this.refreshTokens.length;
        const beforeClient = this.clientTokens.length;

        this.accessTokens = this.accessTokens.filter(t => {
            try {
                const decoded = jwt.decode(t.token.replace('eg1~', ''));
                return decoded && new Date(decoded.creation_date).getTime() + (decoded.hours_expire * 3600000) > now;
            } catch {
                return false;
            }
        });

        this.refreshTokens = this.refreshTokens.filter(t => {
            try {
                const decoded = jwt.decode(t.token.replace('eg1~', ''));
                return decoded && new Date(decoded.creation_date).getTime() + (decoded.hours_expire * 3600000) > now;
            } catch {
                return false;
            }
        });

        this.clientTokens = this.clientTokens.filter(t => {
            try {
                const decoded = jwt.decode(t.token.replace('eg1~', ''));
                return decoded && new Date(decoded.creation_date).getTime() + (decoded.hours_expire * 3600000) > now;
            } catch {
                return false;
            }
        });

        const removed = (beforeAccess - this.accessTokens.length) +
                       (beforeRefresh - this.refreshTokens.length) +
                       (beforeClient - this.clientTokens.length);

        if (removed > 0) {
            this.saveTokensToFile();
            LoggerService.log('info', `Cleaned up ${removed} expired tokens`);
        }
    }

    static getTokenStats() {
        return {
            accessTokens: this.accessTokens.length,
            refreshTokens: this.refreshTokens.length,
            clientTokens: this.clientTokens.length,
            total: this.accessTokens.length + this.refreshTokens.length + this.clientTokens.length
        };
    }

    static getTokensForAccount(accountId) {
        return {
            accessTokens: this.accessTokens.filter(t => t.accountId === accountId),
            refreshTokens: this.refreshTokens.filter(t => t.accountId === accountId)
        };
    }

    static revokeAllTokens() {
        const total = this.accessTokens.length + this.refreshTokens.length + this.clientTokens.length;
        this.accessTokens = [];
        this.refreshTokens = [];
        this.clientTokens = [];
        this.saveTokensToFile();
        return total;
    }
}

// Initialize on module load
TokenService.initialize();

module.exports = TokenService;
