const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/DatabaseManager');
const TokenService = require('../../src/service/token/TokenService');
const LoggerService = require('../../src/service/logger/LoggerService');
const { Errors, sendError } = require('../../src/service/error/Errors');
const FunctionsService = require('../../src/service/api/FunctionsService');

router.get('/sdk/v1/*', async (req, res) => {
    const sdk = require("../../content/sdkv1.json");
    res.json(sdk)
});

router.get('/epic/id/v2/sdk/accounts', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('bearer ')) {
            return res.json([{
                accountId: "neodyme",
                displayName: "Neodyme",
                preferredLanguage: "en",
                cabinedMode: false,
                empty: false
            }]);
        }

        const token = authHeader.substring(7);
        const tokenData = TokenService.verifyAccessToken(token);

        if (!tokenData) {
            return res.json([]);
        }

        const account = DatabaseManager.getAccount(tokenData.accountId);
        
        if (!account) {
            return res.json([]);
        }

        res.json([{
            accountId: account.accountId,
            displayName: FunctionsService.getDisplayNameWithRole(account),
            preferredLanguage: account.preferredLanguage || "en",
            cabinedMode: account.cabinedMode || false,
            empty: false
        }]);
    } catch (error) {
        LoggerService.log('error', `SDK accounts error: ${error.message}`);
        res.json([]);
    }
});

router.post('/epic/oauth/v2/token', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('bearer ')) {
            return sendError(res, Errors.Authentication.invalidAccessToken());
        }

        const token = authHeader.substring(7);
        const tokenData = TokenService.verifyAccessToken(token);

        if (!tokenData) {
            return sendError(res, Errors.Authentication.invalidAccessToken());
        }

        const account = DatabaseManager.getAccount(tokenData.accountId);
        
        if (!account) {
            return sendError(res, Errors.Account.accountNotFound(tokenData.accountId));
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 28800 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
        const refreshExpiresAt = new Date(now.getTime() + 86400 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

        res.json({
            scope: "basic_profile friends_list openid presence",
            token_type: "bearer",
            access_token: token,
            expires_in: 28800,
            expires_at: expiresAt,
            refresh_token: TokenService.generateRefreshToken(tokenData.accountId, tokenData.clientId),
            refresh_expires_in: 86400,
            refresh_expires_at: refreshExpiresAt,
            account_id: account.accountId,
            client_id: tokenData.clientId,
            application_id: "neodyme-app",
            selected_account_id: account.accountId,
            id_token: token
        });
    } catch (error) {
        LoggerService.log('error', `Epic OAuth v2 error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

router.post('/auth/v1/oauth/token', async (req, res) => {
    try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 28800 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

        res.json({
            access_token: TokenService.generateRandomToken(),
            token_type: "bearer",
            expires_in: 28800,
            expires_at: expiresAt,
            nonce: "neodyme",
            features: ["AntiCheat", "Connect", "Ecom", "Inventories", "LockerService"],
            deployment_id: "neodyme-deployment",
            organization_id: "neodyme-org",
            organization_user_id: "neodyme-org-user",
            product_id: "prod-fn",
            product_user_id: "neodyme-product-user",
            product_user_id_created: false,
            id_token: TokenService.generateRandomToken(),
            sandbox_id: "fn"
        });
    } catch (error) {
        LoggerService.log('error', `Auth v1 OAuth error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;