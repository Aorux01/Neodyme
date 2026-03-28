const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../../src/manager/database-manager');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const LoggerService = require('../../../src/service/logger/logger-service');

// Catch-all for any unhandled MCP command (e.g. RedeemRealMoneyPurchases, etc.)
// This must be loaded AFTER all specific MCP handlers (alphabetically last via "zzz-" prefix)
router.post("/fortnite/api/game/v2/profile/:accountId/client/*", async (req, res) => {
    try {
        const accountId = req.params.accountId;
        const profileId = req.query.profileId || 'athena';
        const queryRevision = req.query.rvn || -1;
        const command = req.params[0];

        LoggerService.log('debug', `MCP fallback handler for: ${command} (profile: ${profileId})`);

        const profile = await DatabaseManager.getProfile(accountId, profileId);

        MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
    } catch (error) {
        LoggerService.log('error', `MCP fallback error: ${error.message}`);
        res.json({
            profileRevision: 0,
            profileId: req.query.profileId || 'athena',
            profileChangesBaseRevision: 0,
            profileChanges: [],
            profileCommandRevision: 0,
            serverTime: new Date().toISOString(),
            responseVersion: 1
        });
    }
});

module.exports = router;
