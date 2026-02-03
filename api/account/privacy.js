const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require("../../src/service/logger/logger-service");
const { verifyToken, verifyClient } = require('../../src/middleware/auth-middleware');
const DatabaseManager = require('../../src/manager/database-manager')

router.get('/fortnite/api/game/v2/privacy/account/:accountId', verifyToken, async (req, res) => {
    try {
        let privacy = await DatabaseManager.getPrivacy(req.params.accountId);

        if (!privacy) {
            sendError(res, Errors.Account.privacyNotFound(req.params.accountId));
            return;
        }

        res.json(privacy);
    } catch (error) {
        LoggerService.log('error', `Error getting privacy settings: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/fortnite/api/game/v2/privacy/account/:accountId', verifyToken, async (req, res) => {
    try {
        if (req.user.accountId !== req.params.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        const privacy = {
            accountId: req.params.accountId,
            optOutOfPublicLeaderboards: req.body.optOutOfPublicLeaderboards || false,
            acceptInvites: req.body.acceptInvites || "public",
            showInActiveGamesLists: req.body.showInActiveGamesLists || "public"
        };

        await DatabaseManager.setPrivacy(req.params.accountId, privacy);

        res.json(privacy);
    } catch (error) {
        LoggerService.log('error', `Privacy update error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;