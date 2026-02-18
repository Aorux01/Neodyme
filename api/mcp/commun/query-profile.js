const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const VersionService = require('../../../src/service/api/version-service');
const LoggerService = require('../../../src/service/logger/logger-service');
const FunctionsService = require('../../../src/service/api/functions-service');
const ConfigManager = require('../../../src/manager/config-manager');
const ShopService = require("../../../src/service/api/shop-service");
const EXPService = require('../../../src/service/api/experience-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');
const fs = require('fs').promises;
const path = require('path');

router.use(MCPMiddleware.validateProfileId);

router.post("/fortnite/api/game/v2/profile/:accountId/client/QueryProfile",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;

            const profile = await DatabaseManager.getProfile(accountId, profileId);

            // Synchronize seasonData to athena profile stats for current season
            if (profileId === 'athena') {
                const versionInfo = VersionService.getVersionInfo(req);
                const seasonName = `Season${versionInfo.season}`;
                const seasonData = await DatabaseManager.getAthenaProfile(accountId, 'SeasonData');

                if (seasonData && seasonData[seasonName]) {
                    if (!profile.stats) profile.stats = {};
                    if (!profile.stats.attributes) profile.stats.attributes = {};

                    profile.stats.attributes.book_purchased = seasonData[seasonName].battlePassPurchased || false;
                    profile.stats.attributes.book_level = seasonData[seasonName].battlePassTier || 1;
                    profile.stats.attributes.season_match_boost = seasonData[seasonName].battlePassXPBoost || 0;
                    profile.stats.attributes.season_friend_match_boost = seasonData[seasonName].battlePassXPFriendBoost || 0;
                }
            }

            MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
        } catch (error) {
            LoggerService.log('error', `QueryProfile error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);


module.exports = router;