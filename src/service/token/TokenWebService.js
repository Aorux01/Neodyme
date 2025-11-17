const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ConfigManager = require('../../manager/ConfigManager');
const LoggerService = require('../../service/logger/LoggerService')

class TokenService {
    static exchangeCodes = new Map();
    static tokensFile = path.join(__dirname, 'WebTokens.json');
    static cleanupInterval = null;

    static initialize() {
        this.loadTokens();
        this.cleanupExpiredTokens();

        LoggerService.log('info', 'Token service initialized successfully')
        
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTokens();
        }, 3600000);
    }

    static shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        LoggerService.log('info', 'Stopping Token service successfully')
    }

    static loadTokens() {
        try {
            if (fs.existsSync(this.tokensFile)) {
                const data = fs.readFileSync(this.tokensFile, 'utf8');
                const tokens = JSON.parse(data);
                return tokens;
            }
        } catch (error) {
            console.error('Failed to load tokens:', error);
        }
        return { refreshTokens: {}, deviceIds: {}, sessionIds: {} };
    }

    static saveTokens(tokens) {
        try {
            fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2), 'utf8');
        } catch (error) {
            console.error('Failed to save tokens:', error);
        }
    }

    static cleanupExpiredTokens() {
        const tokens = this.loadTokens();
        let modified = false;

        if (tokens.refreshTokens) {
            for (const [token, data] of Object.entries(tokens.refreshTokens)) {
                if (new Date(data.expiresAt) < new Date()) {
                    delete tokens.refreshTokens[token];
                    modified = true;
                }
            }
        }

        if (tokens.deviceIds) {
            for (const [deviceId, data] of Object.entries(tokens.deviceIds)) {
                if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
                    delete tokens.deviceIds[deviceId];
                    modified = true;
                }
            }
        }

        if (tokens.sessionIds) {
            for (const [sessionId, data] of Object.entries(tokens.sessionIds)) {
                if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
                    delete tokens.sessionIds[sessionId];
                    modified = true;
                }
            }
        }

        if (modified) {
            this.saveTokens(tokens);
        }
    }

    static getJwtSecret() {
        return ConfigManager.get('jwtSecret');
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

    static generateExchangeCode(accountId) {
        const code = crypto.randomBytes(32).toString('hex');
        const expiryMinutes = ConfigManager.get('exchangeTokenExpiryMinutes');
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

        this.exchangeCodes.set(code, {
            accountId: accountId,
            expiresAt: expiresAt,
            used: false
        });

        setTimeout(() => {
            this.exchangeCodes.delete(code);
        }, 5 * 60 * 1000);

        return code;
    }

    static consumeExchangeCode(code) {
        const exchangeData = this.exchangeCodes.get(code);

        if (!exchangeData) {
            return null;
        }

        if (exchangeData.used) {
            return null;
        }

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

    static generateAccessToken(accountId, clientId, displayName) {
        const expiresIn = (ConfigManager.get('accessTokenExpiryHours')) * 3600;
        
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

    static generateRefreshToken(accountId, clientId) {
        const expiresIn = (ConfigManager.get('refreshTokenExpiryDays')) * 86400;
        
        const payload = {
            accountId: accountId,
            clientId: clientId,
            type: 'refresh_token'
        };

        const refreshToken = jwt.sign(payload, this.getJwtSecret(), {
            expiresIn: expiresIn
        });

        const tokens = this.loadTokens();
        if (!tokens.refreshTokens) {
            tokens.refreshTokens = {};
        }

        tokens.refreshTokens[refreshToken] = {
            accountId: accountId,
            clientId: clientId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
        };

        this.saveTokens(tokens);

        return {
            token: refreshToken,
            expiresIn: expiresIn,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
        };
    }

    static generateTokenPair(accountId, clientId, displayName) {
        const access = this.generateAccessToken(accountId, clientId, displayName);
        const refresh = this.generateRefreshToken(accountId, clientId);

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

    static verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.getJwtSecret());

            if (decoded.type === 'refresh_token') {
                const tokens = this.loadTokens();
                const refreshData = tokens.refreshTokens?.[token];

                if (!refreshData) {
                    return {
                        valid: false,
                        error: 'Refresh token not found or revoked'
                    };
                }

                if (new Date(refreshData.expiresAt) < new Date()) {
                    delete tokens.refreshTokens[token];
                    this.saveTokens(tokens);
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
        if (!authHeader) {
            return null;
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
            return null;
        }

        return parts[1];
    }

    static refreshAccessToken(refreshToken, displayName) {
        const verification = this.verifyToken(refreshToken);

        if (!verification.valid) {
            return null;
        }

        if (verification.payload.type !== 'refresh_token') {
            return null;
        }

        return this.generateAccessToken(
            verification.payload.accountId,
            verification.payload.clientId,
            displayName
        );
    }

    static revokeRefreshToken(refreshToken) {
        const tokens = this.loadTokens();
        
        if (tokens.refreshTokens && tokens.refreshTokens[refreshToken]) {
            delete tokens.refreshTokens[refreshToken];
            this.saveTokens(tokens);
            return true;
        }

        return false;
    }

    static revokeAllRefreshTokens(accountId) {
        const tokens = this.loadTokens();
        let modified = false;

        if (tokens.refreshTokens) {
            for (const [token, data] of Object.entries(tokens.refreshTokens)) {
                if (data.accountId === accountId) {
                    delete tokens.refreshTokens[token];
                    modified = true;
                }
            }
        }

        if (modified) {
            this.saveTokens(tokens);
        }

        return modified;
    }

    static generateSessionId(accountId) {
        const sessionId = crypto.randomBytes(16).toString('hex');
        const tokens = this.loadTokens();
        
        if (!tokens.sessionIds) {
            tokens.sessionIds = {};
        }

        tokens.sessionIds[sessionId] = {
            accountId: accountId,
            createdAt: new Date().toISOString()
        };

        this.saveTokens(tokens);
        return sessionId;
    }

    static generateDeviceId(accountId) {
        const deviceId = crypto.randomBytes(16).toString('hex');
        const tokens = this.loadTokens();
        
        if (!tokens.deviceIds) {
            tokens.deviceIds = {};
        }

        tokens.deviceIds[deviceId] = {
            accountId: accountId,
            createdAt: new Date().toISOString()
        };

        this.saveTokens(tokens);
        return deviceId;
    }

    static generateRandomToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    static getRefreshTokenInfo(refreshToken) {
        const tokens = this.loadTokens();
        return tokens.refreshTokens?.[refreshToken] || null;
    }

    static getAllRefreshTokensForAccount(accountId) {
        const tokens = this.loadTokens();
        const accountTokens = [];

        if (tokens.refreshTokens) {
            for (const [token, data] of Object.entries(tokens.refreshTokens)) {
                if (data.accountId === accountId) {
                    accountTokens.push({
                        token: token,
                        ...data
                    });
                }
            }
        }

        return accountTokens;
    }
}

module.exports = TokenService;