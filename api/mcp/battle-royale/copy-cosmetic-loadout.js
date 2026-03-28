const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const LoggerService = require('../../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');

router.use(MCPMiddleware.validateProfileId);

router.post('/fortnite/api/game/v2/profile/:accountId/client/CopyCosmeticLoadout',
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { sourceIndex, targetIndex, optNewNameForTarget } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (sourceIndex == 0) {
                // Copy sandbox loadout into a named preset slot
                const targetKey = `Fortnite${targetIndex}-loadout`;
                profile.items[targetKey] = JSON.parse(JSON.stringify(profile.items['sandbox_loadout']));
                profile.items[targetKey].attributes['locker_name'] = optNewNameForTarget || '';
                if (!profile.stats.attributes.loadouts) profile.stats.attributes.loadouts = [];
                profile.stats.attributes.loadouts[targetIndex] = targetKey;
            } else {
                // Apply a named preset slot as the active loadout
                const sourceKey = `Fortnite${sourceIndex}-loadout`;
                const sourceItem = profile.items[sourceKey];
                if (!sourceItem) {
                    return res.status(403).json(Errors.custom(
                        'errors.com.epicgames.modules.profiles.operation_forbidden',
                        `Locker item ${sourceKey} not found`,
                        [profileId], 12813, undefined, 403
                    ).toJSON());
                }
                profile.stats.attributes['active_loadout_index'] = sourceIndex;
                profile.stats.attributes['last_applied_loadout'] = sourceKey;
                profile.items['sandbox_loadout'].attributes['locker_slots_data'] =
                    sourceItem.attributes['locker_slots_data'];
            }

            profile.rvn += 1;
            profile.commandRevision += 1;
            profile.updated = new Date().toISOString();
            await DatabaseManager.saveProfile(accountId, profileId, profile);

            MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
        } catch (error) {
            LoggerService.log('error', `CopyCosmeticLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

module.exports = router;
