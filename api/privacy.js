const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const AuthService = require('../src/services/AuthService');
const { Errors, sendError } = require('../src/errors/errors');
const LoggerService = require("../src/utils/logger");
const TokenService = require('../src/services/TokenService');

const requireAuth = TokenService.createVerificationMiddleware();

// Default privacy settings
const defaultPrivacy = {
    accountId: "",
    optOutOfPublicLeaderboards: false,
    acceptInvites: "public",
    showInActiveGamesLists: "public"
};

// Get privacy settings
router.get('/fortnite/api/game/v2/privacy/account/:accountId', requireAuth, async (req, res) => {
    try {
        const privacy = {
            ...defaultPrivacy,
            accountId: req.params.accountId
        };

        // Try to load saved privacy settings
        const privacyPath = path.join(process.cwd(), 'data', 'players', req.params.accountId, 'privacy.json');
        
        try {
            const data = await fs.readFile(privacyPath, 'utf8');
            const savedPrivacy = JSON.parse(data);
            Object.assign(privacy, savedPrivacy);
        } catch (error) {
            // File doesn't exist, use defaults
        }

        res.json(privacy);
    } catch (error) {
        LoggerService.log('error', `Error getting privacy settings: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Update privacy settings
router.post('/fortnite/api/game/v2/privacy/account/:accountId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const privacy = {
            accountId: req.params.accountId,
            optOutOfPublicLeaderboards: req.body.optOutOfPublicLeaderboards || false,
            acceptInvites: req.body.acceptInvites || "public",
            showInActiveGamesLists: req.body.showInActiveGamesLists || "public"
        };

        // Save privacy settings
        const playerDir = path.join(process.cwd(), 'data', 'players', req.params.accountId);
        await fs.mkdir(playerDir, { recursive: true });
        
        const privacyPath = path.join(playerDir, 'privacy.json');
        await fs.writeFile(privacyPath, JSON.stringify(privacy, null, 2));

        res.json(privacy);
    } catch (error) {
        LoggerService.log('error', `Privacy update error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;