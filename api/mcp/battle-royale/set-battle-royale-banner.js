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

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetBattleRoyaleBanner",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const queryRevision = req.query.rvn || -1;
            const { homebaseBannerIconId, homebaseBannerColorId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (homebaseBannerIconId && homebaseBannerColorId) {
                profile.stats.attributes.banner_icon = homebaseBannerIconId;
                profile.stats.attributes.banner_color = homebaseBannerColorId;

                await DatabaseManager.updateProfileStats(accountId, 'athena', {
                    'attributes.banner_icon': homebaseBannerIconId,
                    'attributes.banner_color': homebaseBannerColorId
                });

                changes.push(MCPResponseBuilder.createStatChange('banner_icon', profile.stats.attributes.banner_icon));
                changes.push(MCPResponseBuilder.createStatChange('banner_color', profile.stats.attributes.banner_color));

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `SetBattleRoyaleBanner error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;