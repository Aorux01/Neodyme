const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { Errors } = require('../errors/errors');
const AccountService = require('./AccountService');

class AuthService {
    constructor() {
        this.JWT_SECRET = process.env.JWT_SECRET || 'neodyme-secret-key-change-in-production';
        this.tokens = new Map(); // In-memory token storage
        this.exchangeCodes = new Map(); // Exchange codes for OAuth flow
        this.refreshTokens = new Map(); // Refresh tokens
    }

    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async login(email, password, clientId = 'fortnitePCGameClient') {
        try {
            const account = await AccountService.getAccountByEmail(email);
            
            if (account.banned) {
                throw Errors.Account.inactiveAccount();
            }

            const isValidPassword = await AccountService.validatePassword(account.accountId, password);
            
            if (!isValidPassword) {
                await AccountService.incrementFailedLogins(account.accountId);
                throw Errors.Authentication.OAuth.invalidAccountCredentials();
            }

            // Check for 2FA
            if (account.tfaEnabled) {
                // Return a special response indicating 2FA is required
                return {
                    requiresTwoFactor: true,
                    temporaryToken: this.generateToken(),
                    accountId: account.accountId
                };
            }

            return this.createAuthSession(account, clientId);
        } catch (error) {
            if (error.name === 'ApiError') throw error;
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }
    }

    async verify2FA(accountId, code, temporaryToken) {
        const account = await AccountService.getAccount(accountId);
        
        if (!account.tfaEnabled || !account.tfaSecret) {
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }

        const verified = speakeasy.totp.verify({
            secret: account.tfaSecret,
            encoding: 'base32',
            token: code,
            window: 2
        });

        if (!verified) {
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }

        return this.createAuthSession(account, 'fortnitePCGameClient');
    }

    async createAuthSession(account, clientId) {
        await AccountService.updateLastLogin(account.accountId);

        const sessionId = this.generateSessionId();
        const accessToken = this.generateToken();
        const refreshToken = this.generateToken();
        const expiresIn = 28800; // 8 hours
        const refreshExpiresIn = 86400; // 24 hours

        const tokenData = {
            token: accessToken,
            sessionId,
            accountId: account.accountId,
            displayName: account.displayName,
            clientId,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            createdAt: new Date().toISOString()
        };

        const refreshTokenData = {
            token: refreshToken,
            accountId: account.accountId,
            clientId,
            expiresAt: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
            createdAt: new Date().toISOString()
        };

        this.tokens.set(accessToken, tokenData);
        this.refreshTokens.set(refreshToken, refreshTokenData);

        return {
            access_token: accessToken,
            expires_in: expiresIn,
            expires_at: tokenData.expiresAt,
            token_type: "bearer",
            refresh_token: refreshToken,
            refresh_expires: refreshExpiresIn,
            refresh_expires_at: refreshTokenData.expiresAt,
            account_id: account.accountId,
            client_id: clientId,
            internal_client: true,
            client_service: "fortnite",
            displayName: account.displayName,
            app: "fortnite",
            in_app_id: account.accountId,
            device_id: crypto.randomBytes(16).toString('hex')
        };
    }

    async refreshAccessToken(refreshToken) {
        const refreshData = this.refreshTokens.get(refreshToken);
        
        if (!refreshData) {
            throw Errors.Authentication.OAuth.invalidRefresh();
        }

        if (new Date(refreshData.expiresAt) < new Date()) {
            this.refreshTokens.delete(refreshToken);
            throw Errors.Authentication.OAuth.invalidRefresh();
        }

        const account = await AccountService.getAccount(refreshData.accountId);
        
        if (account.banned) {
            throw Errors.Account.inactiveAccount();
        }

        // Create new access token
        const accessToken = this.generateToken();
        const expiresIn = 28800;

        const tokenData = {
            token: accessToken,
            sessionId: this.generateSessionId(),
            accountId: account.accountId,
            displayName: account.displayName,
            clientId: refreshData.clientId,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            createdAt: new Date().toISOString()
        };

        this.tokens.set(accessToken, tokenData);

        return {
            access_token: accessToken,
            expires_in: expiresIn,
            expires_at: tokenData.expiresAt,
            token_type: "bearer",
            account_id: account.accountId,
            client_id: refreshData.clientId,
            internal_client: true,
            client_service: "fortnite",
            displayName: account.displayName,
            app: "fortnite",
            in_app_id: account.accountId
        };
    }

    async verifyToken(token) {
        const tokenData = this.tokens.get(token);
        
        if (!tokenData) {
            throw Errors.Authentication.invalidToken(token);
        }

        if (new Date(tokenData.expiresAt) < new Date()) {
            this.tokens.delete(token);
            throw Errors.Authentication.invalidToken(token);
        }

        const account = await AccountService.getAccount(tokenData.accountId);
        
        if (account.banned) {
            throw Errors.Account.inactiveAccount();
        }

        return {
            token: tokenData.token,
            session_id: tokenData.sessionId,
            token_type: "bearer",
            client_id: tokenData.clientId,
            internal_client: true,
            client_service: "fortnite",
            account_id: tokenData.accountId,
            expires_in: Math.floor((new Date(tokenData.expiresAt) - new Date()) / 1000),
            expires_at: tokenData.expiresAt,
            auth_method: "exchange_code",
            display_name: tokenData.displayName,
            app: "fortnite",
            in_app_id: tokenData.accountId,
            device_id: crypto.randomBytes(16).toString('hex')
        };
    }

    async createExchangeCode(accountId, clientId = 'fortnitePCGameClient') {
        const code = crypto.randomBytes(16).toString('hex');
        const expiresIn = 300; // 5 minutes

        const exchangeData = {
            code,
            accountId,
            clientId,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            createdAt: new Date().toISOString()
        };

        this.exchangeCodes.set(code, exchangeData);

        return {
            code,
            expires_in: expiresIn
        };
    }

    async exchangeCode(code, clientId) {
        const exchangeData = this.exchangeCodes.get(code);
        
        if (!exchangeData) {
            throw Errors.Authentication.OAuth.invalidExchange(code);
        }

        if (new Date(exchangeData.expiresAt) < new Date()) {
            this.exchangeCodes.delete(code);
            throw Errors.Authentication.OAuth.expiredExchangeCodeSession();
        }

        // Delete exchange code after use
        this.exchangeCodes.delete(code);

        const account = await AccountService.getAccount(exchangeData.accountId);
        return this.createAuthSession(account, clientId || exchangeData.clientId);
    }

    async killSession(token) {
        const tokenData = this.tokens.get(token);
        
        if (!tokenData) {
            throw Errors.Authentication.unknownSession(token);
        }

        this.tokens.delete(token);
        
        // Also remove any refresh tokens for this account
        for (const [refreshToken, data] of this.refreshTokens.entries()) {
            if (data.accountId === tokenData.accountId) {
                this.refreshTokens.delete(refreshToken);
            }
        }
    }

    async killAllSessions(accountId) {
        // Remove all access tokens
        for (const [token, data] of this.tokens.entries()) {
            if (data.accountId === accountId) {
                this.tokens.delete(token);
            }
        }

        // Remove all refresh tokens
        for (const [refreshToken, data] of this.refreshTokens.entries()) {
            if (data.accountId === accountId) {
                this.refreshTokens.delete(refreshToken);
            }
        }

        // Remove all exchange codes
        for (const [code, data] of this.exchangeCodes.entries()) {
            if (data.accountId === accountId) {
                this.exchangeCodes.delete(code);
            }
        }
    }

    async generateQRCode(accountId) {
        const account = await AccountService.getAccount(accountId);
        
        const secret = speakeasy.generateSecret({
            name: `Neodyme (${account.displayName})`,
            issuer: 'Neodyme'
        });

        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

        return {
            secret: secret.base32,
            qrCode: qrCodeUrl,
            manualEntryKey: secret.base32
        };
    }

    async enable2FA(accountId, code, secret) {
        const verified = speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token: code,
            window: 2
        });

        if (!verified) {
            throw Errors.Authentication.OAuth.correctiveActionRequired();
        }

        await AccountService.enable2FA(accountId, secret);
        return { success: true };
    }

    async disable2FA(accountId, password) {
        const account = await AccountService.getAccount(accountId);
        const isValidPassword = await AccountService.validatePassword(accountId, password);
        
        if (!isValidPassword) {
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }

        await AccountService.disable2FA(accountId);
        return { success: true };
    }

    getActiveSessionsCount(accountId) {
        let count = 0;
        for (const [, data] of this.tokens.entries()) {
            if (data.accountId === accountId) {
                count++;
            }
        }
        return count;
    }

    async createClientToken(clientId, clientSecret) {
        // Validate client credentials
        const validClients = {
            'fortnitePCGameClient': 'ec684b8c687f479fadea3cb2ad83f5c6',
            'fortniteIOSGameClient': '3446cd72694c4a4485d81b77adbb2141',
            'fortniteAndroidGameClient': '9209d4a5e25a457fb9b07489d313b41a',
            'fortniteSwitchGameClient': '5229dcd3ac3845208b496649092f251b'
        };

        if (!validClients[clientId] || validClients[clientId] !== clientSecret) {
            throw Errors.Authentication.OAuth.invalidClient();
        }

        const token = this.generateToken();
        const expiresIn = 14400; // 4 hours

        const tokenData = {
            token,
            clientId,
            tokenType: 'client',
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            createdAt: new Date().toISOString()
        };

        this.tokens.set(token, tokenData);

        return {
            access_token: token,
            expires_in: expiresIn,
            expires_at: tokenData.expiresAt,
            token_type: "bearer",
            client_id: clientId,
            internal_client: true,
            client_service: "fortnite"
        };
    }

    isClientToken(token) {
        const tokenData = this.tokens.get(token);
        return tokenData && tokenData.tokenType === 'client';
    }

    cleanupExpiredTokens() {
        const now = new Date();

        // Clean access tokens
        for (const [token, data] of this.tokens.entries()) {
            if (new Date(data.expiresAt) < now) {
                this.tokens.delete(token);
            }
        }

        // Clean refresh tokens
        for (const [token, data] of this.refreshTokens.entries()) {
            if (new Date(data.expiresAt) < now) {
                this.refreshTokens.delete(token);
            }
        }

        // Clean exchange codes
        for (const [code, data] of this.exchangeCodes.entries()) {
            if (new Date(data.expiresAt) < now) {
                this.exchangeCodes.delete(code);
            }
        }
    }

    // Run cleanup every 5 minutes
    startCleanupInterval() {
        setInterval(() => {
            this.cleanupExpiredTokens();
        }, 300000);
    }
}

// Export singleton instance
const authService = new AuthService();
authService.startCleanupInterval();

module.exports = authService;