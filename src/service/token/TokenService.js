const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class TokenService {
    static accessTokens = [];
    static refreshTokens = [];
    static clientTokens = [];
    static JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

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

        const token = jwt.sign(payload, this.JWT_SECRET, { expiresIn: `${expiresIn}h` });
        const fullToken = `eg1~${token}`;

        this.clientTokens.push({ ip, token: fullToken, createdAt: Date.now() });

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

        const token = jwt.sign(payload, this.JWT_SECRET, { expiresIn: `${expiresIn}h` });
        const fullToken = `eg1~${token}`;

        this.accessTokens.push({ accountId, token: fullToken, createdAt: Date.now() });

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

        const token = jwt.sign(payload, this.JWT_SECRET, { expiresIn: `${expiresIn}h` });
        const fullToken = `eg1~${token}`;

        this.refreshTokens.push({ accountId, token: fullToken, createdAt: Date.now() });

        return fullToken;
    }

    static verifyToken(token) {
        try {
            if (!token.startsWith('eg1~')) return null;
            
            const rawToken = token.replace('eg1~', '');
            const decoded = jwt.verify(rawToken, this.JWT_SECRET);

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
        const accessIndex = this.accessTokens.findIndex(t => t.token === token);
        if (accessIndex !== -1) {
            this.accessTokens.splice(accessIndex, 1);
            return true;
        }

        const refreshIndex = this.refreshTokens.findIndex(t => t.token === token);
        if (refreshIndex !== -1) {
            this.refreshTokens.splice(refreshIndex, 1);
            return true;
        }

        const clientIndex = this.clientTokens.findIndex(t => t.token === token);
        if (clientIndex !== -1) {
            this.clientTokens.splice(clientIndex, 1);
            return true;
        }

        return false;
    }

    static removeAllTokensForAccount(accountId) {
        this.accessTokens = this.accessTokens.filter(t => t.accountId !== accountId);
        this.refreshTokens = this.refreshTokens.filter(t => t.accountId !== accountId);
    }

    static removeOtherTokensForAccount(accountId, currentToken) {
        this.accessTokens = this.accessTokens.filter(t =>
            t.accountId !== accountId || t.token === currentToken
        );
        this.refreshTokens = this.refreshTokens.filter(t =>
            t.accountId !== accountId || t.token === currentToken
        );
    }

    static cleanupExpiredTokens() {
        const now = Date.now();

        this.accessTokens = this.accessTokens.filter(t => {
            const decoded = jwt.decode(t.token.replace('eg1~', ''));
            return decoded && new Date(decoded.creation_date).getTime() + (decoded.hours_expire * 3600000) > now;
        });

        this.refreshTokens = this.refreshTokens.filter(t => {
            const decoded = jwt.decode(t.token.replace('eg1~', ''));
            return decoded && new Date(decoded.creation_date).getTime() + (decoded.hours_expire * 3600000) > now;
        });

        this.clientTokens = this.clientTokens.filter(t => {
            const decoded = jwt.decode(t.token.replace('eg1~', ''));
            return decoded && new Date(decoded.creation_date).getTime() + (decoded.hours_expire * 3600000) > now;
        });
    }

    static getTokenStats() {
        return {
            accessTokens: this.accessTokens.length,
            refreshTokens: this.refreshTokens.length,
            clientTokens: this.clientTokens.length
        };
    }
}

setInterval(() => {
    TokenService.cleanupExpiredTokens();
}, 3600000);

module.exports = TokenService;