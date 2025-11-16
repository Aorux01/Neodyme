const bcrypt = require('bcrypt');
const TokenService = require('../token/TokenService');
const DatabaseManager = require('../../manager/DatabaseManager');
const { Errors } = require('../error/Errors');
const LoggerService = require('../logger/LoggerService');

class AuthService {
    static async authenticateWithPassword(username, password, clientId, deviceId, ip) {
        if (!username || !password) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        const account = await DatabaseManager.getAccountByEmail(username) || 
                        await DatabaseManager.getAccountByDisplayName(username);
        
        if (!account) {
            const email = username
            const displayName = username.split('@')[0];
            await DatabaseManager.createAccount(email, password, displayName)
            const account = await DatabaseManager.getAccountByEmail(username) || 
                        await DatabaseManager.getAccountByDisplayName(username);
        }

        const passwordMatch = await bcrypt.compare(password, account.password);
        if (!passwordMatch) {
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }

        await this.checkBanStatus(account.accountId);
        await DatabaseManager.updateLastLogin(account.accountId);

        const tokens = this.generateTokens(account, clientId, deviceId, 'password');

        LoggerService.log('success', `User authenticated: ${account.displayName} (${account.accountId})`);

        return this.buildTokenResponse(tokens, account, clientId, deviceId);
    }

    static async refreshAccessToken(refreshToken, clientId, deviceId, ip) {
        if (!refreshToken) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        if (!TokenService.isValidRefreshToken(refreshToken)) {
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

        TokenService.removeToken(refreshToken);

        const tokens = this.generateTokens(account, clientId, deviceId, 'refresh_token');

        LoggerService.log('info', `Token refreshed: ${account.displayName} (${account.accountId})`);

        return this.buildTokenResponse(tokens, account, clientId, deviceId);
    }

    static createClientToken(clientId, ip) {
        const clientToken = TokenService.createClientToken(
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

    static generateTokens(account, clientId, deviceId, grantType) {
        const accessToken = TokenService.createAccessToken(
            account.accountId,
            account.displayName,
            clientId,
            grantType,
            deviceId,
            8
        );

        const refreshToken = TokenService.createRefreshToken(
            account.accountId,
            clientId,
            grantType,
            deviceId,
            24
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
            displayName: account.displayName,
            app: 'fortnite',
            in_app_id: account.accountId,
            device_id: deviceId
        };
    }

    static verifyToken(token) {
        const decoded = TokenService.verifyToken(token);

        if (!decoded) {
            throw Errors.Authentication.invalidToken(token);
        }

        const isAccessToken = TokenService.isValidAccessToken(token);
        const isClientToken = TokenService.isValidClientToken(token);

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

    static killToken(token) {
        TokenService.removeToken(token);
        LoggerService.log('info', `Token killed: ${token.substring(0, 20)}...`);
    }

    static async killOtherTokens(currentToken) {
        const decoded = TokenService.verifyToken(currentToken);

        if (!decoded || !decoded.sub) {
            throw Errors.Authentication.invalidToken(currentToken);
        }

        const accountId = decoded.sub;
        TokenService.removeOtherTokensForAccount(accountId, currentToken);
        LoggerService.log('info', `Other tokens killed for account: ${accountId}`);
    }
}

module.exports = AuthService;