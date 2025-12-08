const router = require('express').Router();
const DatabaseManager = require('../../src/manager/DatabaseManager');
const { Errors, sendError } = require('../../src/service/error/Errors');
const LoggerService = require('../../src/service/logger/LoggerService');
const { verifyToken, verifyClient } = require('../../src/middleware/authMiddleware');
const FunctionsService = require('../../src/service/api/FunctionsService');

router.get('/account/api/public/account', verifyClient, async (req, res) => {
    try {
        const response = [];

        if (typeof req.query.accountId === 'string') {
            let accountId = req.query.accountId;
            if (accountId.includes('@')) accountId = accountId.split('@')[0];

            const account = await DatabaseManager.getAccount(accountId);
            if (account) {
                response.push({
                    id: account.accountId,
                    displayName: FunctionsService.getDisplayNameWithRole(account),
                    externalAuths: {}
                });
            }
        }

        if (Array.isArray(req.query.accountId)) {
            for (const id of req.query.accountId) {
                let accountId = id;
                if (accountId.includes('@')) accountId = accountId.split('@')[0];

                const account = await DatabaseManager.getAccount(accountId);
                if (account) {
                    response.push({
                        id: account.accountId,
                        displayName: FunctionsService.getDisplayNameWithRole(account),
                        externalAuths: {}
                    });
                }
            }
        }

        res.json(response);
    } catch (error) {
        LoggerService.log('error', `Failed to get public accounts: ${error.message}`);
        res.json([]);
    }
});

router.get('/account/api/public/account/:accountId', verifyClient, async (req, res) => {
    try {
        const accountId = req.params.accountId;
        const account = await DatabaseManager.getAccount(accountId);

        if (!account) {
            throw Errors.Account.accountNotFound(accountId);
        }

        res.json({
            id: account.accountId,
            displayName: FunctionsService.getDisplayNameWithRole(account),
            name: 'Neodyme',
            email: account.email,
            failedLoginAttempts: account.failedLoginAttempts || 0,
            lastLogin: account.lastLogin || new Date().toISOString(),
            numberOfDisplayNameChanges: account.numberOfDisplayNameChanges || 0,
            ageGroup: account.ageGroup || 'ADULT',
            headless: false,
            country: account.country || 'US',
            lastName: 'Server',
            preferredLanguage: account.preferredLanguage || 'en',
            canUpdateDisplayName: account.canUpdateDisplayName !== false,
            tfaEnabled: account.tfaEnabled || false,
            emailVerified: account.emailVerified || true,
            minorVerified: false,
            minorExpected: false,
            minorStatus: account.minorStatus || 'NOT_MINOR',
            cabinedMode: account.cabinedMode || false,
            hasHashedEmail: false
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to get account: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/account/api/public/account/*/externalAuths', verifyClient, async (req, res) => {
    res.json([]);
});

router.get('/account/api/epicdomains/ssodomains', async (req, res) => {
    res.json([
        'unrealengine.com',
        'unrealtournament.com',
        'fortnite.com',
        'epicgames.com'
    ]);
});

router.post('/fortnite/api/game/v2/tryPlayOnPlatform/account/*', verifyToken, async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(true);
});

router.get('/account/api/public/account/displayName/:displayName', verifyClient, async (req, res) => {
    try {
        const displayName = req.params.displayName;

        const response = DatabaseManager.getAccountByExactDisplayName(displayName);

        res.json(response);

    } catch (error) {
        LoggerService.log('error', `Failed to get public accounts by substr: ${error.message}`);
        res.json([]);
    }
});

module.exports = router;
