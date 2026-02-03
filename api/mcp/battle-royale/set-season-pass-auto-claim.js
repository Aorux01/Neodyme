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

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetSeasonPassAutoClaim",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { seasonIds, bEnabled } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (seasonIds && bEnabled !== undefined) {
                if (!profile.stats.attributes.auto_spend_season_currency_ids) {
                    profile.stats.attributes.auto_spend_season_currency_ids = [];
                }

                for (const seasonId of seasonIds) {
                    if (bEnabled === true) {
                        if (!profile.stats.attributes.auto_spend_season_currency_ids.includes(seasonId)) {
                            profile.stats.attributes.auto_spend_season_currency_ids.push(seasonId);
                        }
                    } else {
                        const index = profile.stats.attributes.auto_spend_season_currency_ids.indexOf(seasonId);
                        if (index !== -1) {
                            profile.stats.attributes.auto_spend_season_currency_ids.splice(index, 1);
                        }
                    }
                }

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.auto_spend_season_currency_ids': profile.stats.attributes.auto_spend_season_currency_ids
                });

                changes.push(MCPResponseBuilder.createStatChange(
                    'auto_spend_season_currency_ids',
                    profile.stats.attributes.auto_spend_season_currency_ids
                ));

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `SetSeasonPassAutoClaim error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;