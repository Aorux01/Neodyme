const express = require('express');
const router = express.Router();
const AuthService = require('../src/services/AuthService');
const AccountService = require('../src/services/AccountService');
const TokenService = require('../src/services/TokenService');
const LoggerService = require('../src/utils/logger');
const { Errors, sendError } = require('../src/errors/errors');
const Functions = require('../src/utils/functions');

// Helper to load clients data
function loadClientsData() {
    const clientsPath = path.join(__dirname, '..', 'data', 'clients.json');
    return JSON.parse(fs.readFileSync(clientsPath, 'utf-8'));
}

// OAuth Token endpoint
router.post('/account/api/oauth/token', async (req, res) => {
    try {
        const { grant_type, username, password, refresh_token, exchange_code } = req.body;

        LoggerService.log('info', 'OAuth token request received', { grantType: grant_type, username: username ? username.split('@')[0] : 'unknown' });

        // Client credentials grant
        if (grant_type === 'client_credentials') {
            const clientToken = TokenService.generateClientToken('neodymeclientid');
            
            LoggerService.log('info', 'Client credentials token generated');
            
            return res.json({
                "access_token": clientToken,
                "expires_in": 3600,
                "expires_at": new Date(Date.now() + 3600000).toISOString(),
                "token_type": "bearer",
                "client_id": "ec684b8c687f479fadea3cb2ad83f5c6",
                "internal_client": true,
                "client_service": "fortnite"
            });
        }

        // Password grant
        if (grant_type === 'password') {
            if (!username || !password) {
                throw Errors.Authentication.OAuth.invalidAccountCredentials();
            }

            let account;
            try {
                // Clean the username - remove domain part if present
                let cleanUsername = username;
                if (username.includes("@")) {
                    cleanUsername = username.split("@")[0];
                }

                LoggerService.log('debug', 'Searching for account', { 
                    originalUsername: username,
                    cleanedUsername: cleanUsername,
                    searchMethod: username.includes("@") && Functions.validateEmail(username) ? 'email_then_displayname' : 'displayname_only'
                });

                // Try to find by email first (if original username looks like email)
                if (username.includes("@") && Functions.validateEmail(username)) {
                    try {
                        account = await AccountService.getAccountByEmail(username);
                        LoggerService.log('debug', 'Account found by email', { displayName: account.displayName, accountId: account.accountId });
                    } catch (emailError) {
                        // If not found by email, try by display name with cleaned username
                        account = await AccountService.getAccountByDisplayName(cleanUsername);
                        LoggerService.log('debug', 'Account found by display name', { displayName: account.displayName, accountId: account.accountId });
                    }
                } else {
                    // Try by display name with cleaned username
                    account = await AccountService.getAccountByDisplayName(cleanUsername);
                    LoggerService.log('debug', 'Account found by display name', { displayName: account.displayName, accountId: account.accountId });
                }
            } catch (error) {
                LoggerService.log('warn', 'Authentication failed - Account not found', { 
                    username: username, 
                    cleanedUsername: username.includes("@") ? username.split("@")[0] : username 
                });
                throw Errors.Authentication.OAuth.invalidAccountCredentials();
            }

            // Check if account is banned
            if (account.banned) {
                LoggerService.log('warn', 'Authentication failed - Account is banned', { 
                    accountId: account.accountId,
                    displayName: account.displayName,
                    banReason: account.banReason 
                });
                throw Errors.Account.disabledAccount();
            }

            // Check if account is locked
            if (account.failedLoginAttempts >= 5) {
                LoggerService.log('warn', 'Authentication failed - Account is locked', { 
                    accountId: account.accountId,
                    displayName: account.displayName,
                    failedAttempts: account.failedLoginAttempts 
                });
                throw Errors.Account.inactiveAccount();
            }

            // Verify password using AccountService
            const isValidPassword = await AccountService.validatePasswordLauncher(
                account.accountId,
                password,
                req.headers['user-agent'] || ''
            );

            if (!isValidPassword) {
                await AccountService.incrementFailedLogins(account.accountId);
                LoggerService.log('warn', 'Authentication failed - Invalid password', { 
                    accountId: account.accountId,
                    displayName: account.displayName,
                    failedAttempts: account.failedLoginAttempts + 1
                });
                throw Errors.Authentication.OAuth.invalidAccountCredentials();
            }

            // Update last login on successful authentication
            await AccountService.updateLastLogin(account.accountId);

            // Generate tokens
            const tokens = TokenService.generateTokenPair(account);

            LoggerService.log('success', 'Password grant authentication successful', {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email
            });

            return res.json({
                "access_token": tokens.accessToken,
                "expires_in": tokens.expiresIn,
                "expires_at": new Date(Date.now() + (tokens.expiresIn * 1000)).toISOString(),
                "token_type": "bearer",
                "refresh_token": tokens.refreshToken,
                "refresh_expires": 86400,
                "refresh_expires_at": new Date(Date.now() + 86400000).toISOString(),
                "account_id": account.accountId,
                "client_id": "neodymeclientid",
                "internal_client": true,
                "client_service": "fortnite",
                "displayName": account.displayName,
                "app": "fortnite",
                "in_app_id": account.accountId,
                "device_id": Functions.generateDeviceId()
            });
        }

        // Refresh token grant
        if (grant_type === 'refresh_token') {
            if (!refresh_token) {
                throw Errors.Authentication.OAuth.invalidRefresh();
            }

            try {
                const decoded = TokenService.verifyToken(refresh_token);
                
                if (decoded.type !== 'refresh') {
                    throw Errors.Authentication.OAuth.invalidRefresh();
                }

                // Get fresh account data
                const account = await AccountService.getAccount(decoded.accountId);
                
                if (account.banned) {
                    throw Errors.Account.disabledAccount();
                }

                // Generate new access token
                const newAccessToken = TokenService.generateAccessToken(account);

                LoggerService.log('success', 'Refresh token grant successful', {
                    accountId: account.accountId,
                    displayName: account.displayName
                });

                return res.json({
                    "access_token": newAccessToken,
                    "expires_in": 86400,
                    "expires_at": new Date(Date.now() + 86400000).toISOString(),
                    "token_type": "bearer",
                    "refresh_token": refresh_token, // Keep same refresh token
                    "refresh_expires": 86400,
                    "refresh_expires_at": new Date(Date.now() + 86400000).toISOString(),
                    "account_id": account.accountId,
                    "client_id": "neodymeclientid",
                    "internal_client": true,
                    "client_service": "fortnite",
                    "displayName": account.displayName,
                    "app": "fortnite",
                    "in_app_id": account.accountId,
                    "device_id": Functions.generateDeviceId()
                });

            } catch (error) {
                LoggerService.log('error', 'Invalid refresh token', { token: refresh_token });
                throw Errors.Authentication.OAuth.invalidRefresh();
            }
        }

        // Exchange code grant
        if (grant_type === 'exchange_code') {
            if (!exchange_code) {
                throw Errors.Authentication.OAuth.invalidExchange('missing');
            }

            try {
                const decoded = TokenService.validateExchangeCode(exchange_code);
                const account = await AccountService.getAccount(decoded.accountId);
                
                if (account.banned) {
                    throw Errors.Account.disabledAccount();
                }

                // Generate full token pair
                const tokens = TokenService.generateTokenPair(account);

                LoggerService.log('success', 'Exchange code grant successful', {
                    accountId: account.accountId,
                    displayName: account.displayName
                });

                return res.json({
                    "access_token": tokens.accessToken,
                    "expires_in": tokens.expiresIn,
                    "expires_at": new Date(Date.now() + (tokens.expiresIn * 1000)).toISOString(),
                    "token_type": "bearer",
                    "refresh_token": tokens.refreshToken,
                    "refresh_expires": 86400,
                    "refresh_expires_at": new Date(Date.now() + 86400000).toISOString(),
                    "account_id": account.accountId,
                    "client_id": "neodymeclientid",
                    "internal_client": true,
                    "client_service": "fortnite",
                    "displayName": account.displayName,
                    "app": "fortnite",
                    "in_app_id": account.accountId,
                    "device_id": Functions.generateDeviceId()
                });

            } catch (error) {
                LoggerService.log('error', 'Invalid exchange code', { code: exchange_code });
                if (error.errorCode) {
                    throw error;
                }
                throw Errors.Authentication.OAuth.invalidExchange(exchange_code);
            }
        }

        // Unsupported grant type
        LoggerService.log('warn', 'Unsupported grant type requested', { grantType: grant_type });
        return res.status(400).json({
            error: 'unsupported_grant_type',
            error_description: `Grant type '${grant_type}' is not supported`
        });

    } catch (error) {
        LoggerService.log('error', 'OAuth token endpoint error', {
            error: error.message,
            errorCode: error.errorCode,
            grantType: req.body.grant_type || 'unknown'
        });
        if (error.errorCode) {
            sendError(res, error);
        } else {
            return res.status(500).json({
                error: 'server_error',
                error_description: 'Internal server error'
            });
        }
    }
});

// Verify token endpoint
router.get('/account/api/oauth/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        // Get fresh account data for verification
        const account = await AccountService.getAccount(decoded.accountId);
        
        if (account.banned) {
            throw Errors.Account.disabledAccount();
        }

        LoggerService.log('success', 'Token verification successful', {
            accountId: account.accountId,
            displayName: account.displayName
        });
        
        res.json({
            token: token,
            session_id: `neodyme_sess_${Date.now()}`,
            token_type: "bearer",
            client_id: "neodymeclientid",
            internal_client: true,
            client_service: "fortnite",
            account_id: account.accountId,
            expires_in: 28800,
            expires_at: new Date(Date.now() + 28800000).toISOString(),
            auth_method: "password",
            display_name: account.displayName,
            app: "fortnite",
            in_app_id: account.accountId
        });
    } catch (error) {
        LoggerService.log('error', 'Token verification failed', { error: error.message });
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Authentication.invalidToken(''));
        }
    }
});

// Kill session endpoint
router.delete('/account/api/oauth/sessions/kill', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        LoggerService.log('info', 'Session termination requested', {
            accountId: decoded.accountId,
            killType: req.query.killType || 'default'
        });
        
        res.status(204).end();
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Kill specific session endpoint
router.delete('/account/api/oauth/sessions/kill/:sessionId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        LoggerService.log('success', 'Specific session terminated', { 
            accountId: decoded.accountId,
            sessionId: req.params.sessionId 
        });
        
        res.status(204).end();
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Exchange code endpoint
router.post('/account/api/oauth/exchange', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        const exchangeCode = TokenService.generateExchangeCode(decoded.accountId);
        
        LoggerService.log('info', 'Exchange code generated', { 
            accountId: decoded.accountId,
            expiresIn: 300 
        });
        
        res.json({
            expiresInSeconds: 300, // 5 minutes
            code: exchangeCode,
            creatingClientId: "neodymeclientid"
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Device auth endpoints
router.post('/account/api/public/account/:accountId/deviceAuth', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        if (decoded.accountId !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        // Generate device auth credentials
        const deviceId = Functions.generateDeviceId();
        const secret = Functions.generateAuthToken();

        LoggerService.log('success', 'Device authentication credentials created', { 
            accountId: req.params.accountId,
            deviceId: deviceId 
        });

        res.json({
            deviceId: deviceId,
            accountId: req.params.accountId,
            secret: secret,
            created: {
                location: req.ip,
                ipAddress: req.ip,
                dateTime: new Date().toISOString()
            }
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// 2FA verification endpoint
router.post('/account/api/oauth/twofactor/verify', async (req, res) => {
    try {
        const { code, temporaryToken } = req.body;
        
        if (!code || !temporaryToken) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        // Simplified verification - in production, verify against stored TOTP secret
        if (code !== "123456") {
            throw Errors.Authentication.OAuth.correctiveActionRequired();
        }

        res.json({
            success: true,
            code: code
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Authentication.OAuth.correctiveActionRequired());
        }
    }
});

// 2FA setup endpoints
router.get('/account/api/oauth/twofactor/setup', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        res.json({
            secret: "NEODYME2FASECRET",
            qrCode: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            manualEntryKey: "NEOD-MEME-2FAS-ECRET"
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

router.post('/account/api/oauth/twofactor/enable', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const { code, secret } = req.body;
        
        if (!code || !secret) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        // Enable 2FA using AccountService
        await AccountService.enable2FA(decoded.accountId, secret);
        
        LoggerService.log('success', '2FA enabled for account', { 
            accountId: decoded.accountId 
        });
        
        res.json({
            success: true,
            twoFactorEnabled: true
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

router.post('/account/api/oauth/twofactor/disable', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const { password } = req.body;
        
        if (!password) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        // Verify password using AccountService
        const isValidPassword = await AccountService.validatePasswordLauncher(
            decoded.accountId,
            password,
            req.headers['user-agent'] || ''
        );
        
        if (!isValidPassword) {
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }

        // Disable 2FA using AccountService
        await AccountService.disable2FA(decoded.accountId);
        
        LoggerService.log('success', '2FA disabled for account', { 
            accountId: decoded.accountId 
        });
        
        res.json({
            success: true,
            twoFactorEnabled: false
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Epic domains endpoint
router.get('/account/api/epicdomains/ssodomains', (req, res) => {
    res.json([
        "unrealengine.com",
        "unrealtournament.com",
        "fortnite.com",
        "epicgames.com",
        "neodyme.com"
    ]);
});

// External auth endpoints
router.get('/account/api/public/account/:accountId/externalAuths', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        TokenService.verifyToken(token);
        
        res.json([]);
    } catch (error) {
        res.json([]);
    }
});

// Device auth list endpoint
router.get('/account/api/public/account/:accountId/deviceAuth', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        const decoded = TokenService.verifyToken(token);
        
        if (decoded.accountId !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        res.json([]);
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// SDK endpoints
router.post('/auth/v1/oauth/token', async (req, res) => {
    const token = TokenService.generateClientToken('sdk_client');
    
    res.json({
        access_token: token,
        token_type: "bearer",
        expires_in: 28800,
        expires_at: new Date(Date.now() + 28800000).toISOString(),
        nonce: "neodyme",
        features: ["AntiCheat", "Connect", "Ecom", "Inventories", "LockerService"],
        deployment_id: Functions.generateRandomString(32),
        organization_id: Functions.generateRandomString(32),
        organization_user_id: Functions.generateRandomString(32),
        product_id: "prod-fn",
        product_user_id: Functions.generateRandomString(32),
        product_user_id_created: false,
        id_token: TokenService.generateAuthToken(),
        sandbox_id: "fn"
    });
});

router.post('/epic/oauth/v2/token', async (req, res) => {
    const accountId = req.body.account_id || Functions.generateRandomString(32);
    const token = TokenService.generateClientToken('epic_oauth');
    
    res.json({
        scope: "basic_profile friends_list openid presence",
        token_type: "bearer",
        access_token: token,
        expires_in: 28800,
        expires_at: new Date(Date.now() + 28800000).toISOString(),
        refresh_token: TokenService.generateAuthToken(),
        refresh_expires_in: 86400,
        refresh_expires_at: new Date(Date.now() + 86400000).toISOString(),
        account_id: accountId,
        client_id: "neodyme_client",
        application_id: "neodyme_app",
        selected_account_id: accountId,
        id_token: TokenService.generateAuthToken()
    });
});

module.exports = router;