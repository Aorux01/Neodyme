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

router.post("/fortnite/api/game/v2/profile/:accountId/client/ModifyQuickbar",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'theater0';
            const queryRevision = req.query.rvn || -1;
            const { primaryQuickbarChoices, secondaryQuickbarChoice } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (primaryQuickbarChoices) {
                for (const i in primaryQuickbarChoices) {
                    const slotIndex = Number(i) + 1;
                    let value = [primaryQuickbarChoices[i].replace(/-/ig, "").toUpperCase()];
                    if (primaryQuickbarChoices[i] === "") {
                        value = [];
                    }

                    profile.stats.attributes.player_loadout.primaryQuickBarRecord.slots[slotIndex].items = value;
                }

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.player_loadout': profile.stats.attributes.player_loadout
                });

                changes.push(MCPResponseBuilder.createStatChange('player_loadout', profile.stats.attributes.player_loadout));

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);
            }

            if (typeof secondaryQuickbarChoice === "string") {
                let value = [secondaryQuickbarChoice.replace(/-/ig, "").toUpperCase()];
                if (secondaryQuickbarChoice === "") {
                    value = [];
                }

                profile.stats.attributes.player_loadout.secondaryQuickBarRecord.slots[5].items = value;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.player_loadout': profile.stats.attributes.player_loadout
                });

                changes.push(MCPResponseBuilder.createStatChange('player_loadout', profile.stats.attributes.player_loadout));

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
            LoggerService.log('error', `ModifyQuickbar error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;