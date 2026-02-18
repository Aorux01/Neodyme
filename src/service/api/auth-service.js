const bcrypt = require('bcrypt');
const TokenService = require('../token/token-service');
const DatabaseManager = require('../../manager/database-manager');
const { Errors } = require('../error/errors-system');
const LoggerService = require('../logger/logger-service');
const FunctionsService = require('./functions-service');
const ConfigManager = require('../../manager/config-manager');

class AuthService {
    static DUMMY_HASH = null;

    static getDummyHash() {
        if (!this.DUMMY_HASH) {
            const workFactor = ConfigManager.get('bcryptWorkFactor', 12);
            this.DUMMY_HASH = `$2b$${workFactor}$XQqKvV3qP5h.M3lWJvZqZuN5z3LqK1VZ6Sv8qPHvF7JK8WYL6wVZO`;
        }
        return this.DUMMY_HASH;
    }

    static async addRandomDelay() {
        const min = ConfigManager.get('authTimingDelayMin', 50);
        const max = ConfigManager.get('authTimingDelayMax', 200);
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    static async authenticateWithPassword(username, password, clientId, deviceId, ip) {
        try {
            if (!username || !password) {
                throw Errors.Authentication.OAuth.invalidBody();
            }

            if (typeof username !== 'string' || typeof password !== 'string') {
                throw Errors.Authentication.OAuth.invalidBody();
            }

            if (password.length > 72) {
                throw Errors.Authentication.OAuth.invalidBody();
            }

            if (username.length > 320) {
                throw Errors.Authentication.OAuth.invalidBody();
            }

            const account = await DatabaseManager.getAccountByEmail(username) ||
                            await DatabaseManager.getAccountByDisplayName(username);

            let isValidAuth = false;
            let authError = null;

            if (!account) {
                await bcrypt.compare(password, this.getDummyHash());
                authError = Errors.Authentication.OAuth.invalidAccountCredentials();
            } else if (!account.password) {
                await bcrypt.compare(password, this.getDummyHash());
                authError = Errors.Authentication.OAuth.invalidAccountCredentials();
            } else {
                const passwordMatch = await bcrypt.compare(password, account.password);
                if (!passwordMatch) {
                    await DatabaseManager.recordFailedLoginAttempt(account.accountId);
                    authError = Errors.Authentication.OAuth.invalidAccountCredentials();
                } else {
                    isValidAuth = true;
                }
            }

            await this.addRandomDelay();

            if (!isValidAuth) {
                throw authError;
            }

            await this.checkBanStatus(account.accountId);
            await DatabaseManager.resetFailedAttempts(account.accountId);
            await DatabaseManager.updateLastLogin(account.accountId);

            const tokens = await this.generateTokens(account, clientId, deviceId, 'password', ip);

            LoggerService.log('success', `User authenticated: ${account.displayName} (${account.accountId})`);

            return this.buildTokenResponse(tokens, account, clientId, deviceId);
        } catch (error) {
            if (error.errorCode) {
                throw error;
            }
            LoggerService.log('error', `Authentication error: ${error.message}`);
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }
    }

    static async refreshAccessToken(refreshToken, clientId, deviceId, ip) {
        if (!refreshToken) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        const isValid = await TokenService.isValidRefreshToken(refreshToken);
        if (!isValid) {
            throw Errors.Authentication.OAuth.invalidRefresh();
        }

        const decoded = TokenService.verifyToken(refreshToken);
        if (!decoded) {
            throw Errors.Authentication.OAuth.invalidRefresh();
        }

        const account = await DatabaseManager.getAccount(decoded.sub);
        if (!account) {
            throw Errors.Account.accountNotFound(decoded.sub);
        }

        await this.checkBanStatus(account.accountId);

        await TokenService.removeToken(refreshToken);

        const tokens = await this.generateTokens(account, clientId, deviceId, 'refresh_token', ip);

        LoggerService.log('info', `Token refreshed: ${account.displayName} (${account.accountId})`);

        return this.buildTokenResponse(tokens, account, clientId, deviceId);
    }

    static async authenticateWithExchangeCode(exchangeCode, clientId, deviceId, ip) {
        if (!exchangeCode) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        const TokenWebService = require('../token/web-token-service');
        const accountId = TokenWebService.consumeExchangeCode(exchangeCode);

        if (!accountId) {
            throw Errors.Authentication.OAuth.invalidExchange(exchangeCode);
        }

        const account = await DatabaseManager.getAccount(accountId);
        if (!account) {
            throw Errors.Account.accountNotFound(accountId);
        }

        await this.checkBanStatus(account.accountId);

        const tokens = await this.generateTokens(account, clientId, deviceId, 'exchange_code', ip);

        LoggerService.log('success', `User authenticated via exchange code: ${account.displayName} (${account.accountId})`);

        return this.buildTokenResponse(tokens, account, clientId, deviceId);
    }

    static async createClientToken(clientId, ip) {
        const clientToken = await TokenService.createClientToken(
            clientId,
            'client_credentials',
            ip,
            4
        );

        const expiresAt = new Date(Date.now() + 4 * 3600000).toISOString();

        LoggerService.log('info', `Client token created for IP: ${ip}`);

        return {
            access_token: clientToken,
            expires_in: 14400,
            expires_at: expiresAt,
            token_type: 'bearer',
            client_id: clientId,
            internal_client: true,
            client_service: 'fortnite'
        };
    }

    static async checkBanStatus(accountId) {
        const banInfo = await DatabaseManager.getBanInfo(accountId);
        
        if (!banInfo.banned) {
            return;
        }

        const now = new Date();
        
        if (banInfo.banExpires && new Date(banInfo.banExpires) <= now) {
            await DatabaseManager.unbanAccount(accountId);
            return;
        }

        throw Errors.Account.disabledAccount();
    }

    static async generateTokens(account, clientId, deviceId, grantType, ip) {
        const accessToken = await TokenService.createAccessToken(
            account.accountId,
            account.displayName,
            clientId,
            grantType,
            deviceId,
            8,
            ip
        );

        const refreshToken = await TokenService.createRefreshToken(
            account.accountId,
            clientId,
            grantType,
            deviceId,
            24,
            ip
        );

        return { accessToken, refreshToken };
    }

    static buildTokenResponse(tokens, account, clientId, deviceId) {
        const expiresAt = new Date(Date.now() + 8 * 3600000).toISOString();
        const refreshExpiresAt = new Date(Date.now() + 24 * 3600000).toISOString();

        return {
            access_token: tokens.accessToken,
            expires_in: 28800,
            expires_at: expiresAt,
            token_type: 'bearer',
            refresh_token: tokens.refreshToken,
            refresh_expires: 86400,
            refresh_expires_at: refreshExpiresAt,
            account_id: account.accountId,
            client_id: clientId,
            internal_client: true,
            client_service: 'fortnite',
            displayName: FunctionsService.getDisplayNameWithRole(account),
            app: 'fortnite',
            in_app_id: account.accountId,
            device_id: deviceId
        };
    }

    static async verifyToken(token) {
        const decoded = TokenService.verifyToken(token);

        if (!decoded) {
            throw Errors.Authentication.invalidToken(token);
        }

        const isAccessToken = await TokenService.isValidAccessToken(token);
        const isClientToken = await TokenService.isValidClientToken(token);

        if (!isAccessToken && !isClientToken) {
            throw Errors.Authentication.invalidToken(token);
        }

        const response = {
            token,
            session_id: decoded.jti,
            token_type: 'bearer',
            client_id: decoded.clid,
            internal_client: true,
            client_service: 'fortnite',
            expires_at: new Date(new Date(decoded.creation_date).getTime() + decoded.hours_expire * 3600000).toISOString(),
            expires_in: Math.floor((new Date(decoded.creation_date).getTime() + decoded.hours_expire * 3600000 - Date.now()) / 1000),
            auth_method: decoded.am
        };

        if (isAccessToken) {
            response.account_id = decoded.sub;
            response.displayName = decoded.dn;
            response.app = 'fortnite';
            response.in_app_id = decoded.iai;
        }

        return response;
    }

    static async killToken(token) {
        await TokenService.removeToken(token);
        LoggerService.log('info', `Token killed: ${token.substring(0, 20)}...`);
    }

    static async killOtherTokens(currentToken) {
        const decoded = TokenService.verifyToken(currentToken);

        if (!decoded || !decoded.sub) {
            throw Errors.Authentication.invalidToken(currentToken);
        }

        const accountId = decoded.sub;
        await TokenService.removeOtherTokensForAccount(accountId, currentToken);
        LoggerService.log('info', `Other tokens killed for account: ${accountId}`);
    }

    static async killAllTokensForAccount(accountId) {
        await TokenService.removeAllTokensForAccount(accountId);
        LoggerService.log('warning', `All tokens killed for account: ${accountId}`);
    }

    static async getActiveSessions(accountId) {
        return await TokenService.getActiveSessionsForAccount(accountId);
    }

    static async killSpecificSession(accountId, sessionId) {
        const result = await TokenService.removeTokenBySessionId(accountId, sessionId);
        if (result) {
            LoggerService.log('info', `Session killed: ${sessionId} for account: ${accountId}`);
        }
        return result;
    }
}

module.exports = AuthService;
