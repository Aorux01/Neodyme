const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const LoggerService = require('../../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');

router.use(MCPMiddleware.validateProfileId);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetHardcoreModifier",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { hardcoreModifier } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);

            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            // Set hardcore modifier (used for game mode selection)
            if (hardcoreModifier !== undefined) {
                if (!profile.stats.attributes) {
                    profile.stats.attributes = {};
                }

                profile.stats.attributes.client_settings = profile.stats.attributes.client_settings || {};
                profile.stats.attributes.client_settings.hardcoreModifier = hardcoreModifier;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.client_settings': profile.stats.attributes.client_settings
                });

                changes.push(MCPResponseBuilder.createStatChange(
                    'client_settings',
                    profile.stats.attributes.client_settings
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
            LoggerService.log('error', `SetHardcoreModifier error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

module.exports = router;
