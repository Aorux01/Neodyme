const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const LoggerService = require('../../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');

router.use(MCPMiddleware.validateProfileId);

router.post('/fortnite/api/game/v2/profile/:accountId/client/DeleteCosmeticLoadout',
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { index, fallbackLoadoutIndex, leaveNullSlot } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            let changed = false;

            if (leaveNullSlot !== false) {
                const loadoutKey = `Fortnite${index}-loadout`;

                if (fallbackLoadoutIndex === -1) {
                    delete profile.items[loadoutKey];
                    if (profile.stats.attributes.loadouts) {
                        delete profile.stats.attributes.loadouts[index];
                    }
                } else {
                    const fallbackKey = profile.stats.attributes.loadouts?.[fallbackLoadoutIndex];
                    if (fallbackKey) {
                        profile.stats.attributes['last_applied_loadout'] = fallbackKey;
                        profile.stats.attributes['active_loadout_index'] = fallbackLoadoutIndex;
                        const fallbackItem = profile.items[fallbackKey];
                        if (fallbackItem) {
                            profile.items['sandbox_loadout'].attributes['locker_slots_data'] =
                                fallbackItem.attributes['locker_slots_data'];
                        }
                    }
                    delete profile.items[loadoutKey];
                    if (profile.stats.attributes.loadouts) {
                        delete profile.stats.attributes.loadouts[index];
                    }
                }

                changed = true;
            }

            if (changed) {
                profile.rvn += 1;
                profile.commandRevision += 1;
                profile.updated = new Date().toISOString();
                await DatabaseManager.saveProfile(accountId, profileId, profile);
            }

            MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
        } catch (error) {
            LoggerService.log('error', `DeleteCosmeticLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

module.exports = router;
