const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const LoggerService = require('../../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');

router.use(MCPMiddleware.validateProfileId);

router.post('/fortnite/api/game/v2/profile/:accountId/client/RequestRestedStateIncrease',
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const gained = req.body.restedXpGenAccumulated || 0;
            const currentXp = profile.stats.attributes['book_xp'] || 0;
            const newXp = currentXp + gained;

            if (newXp !== currentXp) {
                profile.stats.attributes['book_xp'] = newXp;
                profile.stats.attributes['xp'] = newXp;
                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.book_xp': newXp,
                    'attributes.xp': newXp
                });
                await DatabaseManager.saveProfile(accountId, profileId, profile);

                changes.push(MCPResponseBuilder.createStatChange('book_xp', newXp));
                changes.push(MCPResponseBuilder.createStatChange('xp', newXp));
            }

            if (queryRevision != profile.rvn - changes.length && changes.length === 0) {
                return MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            }

            MCPResponseBuilder.sendResponse(res, profile, changes);
        } catch (error) {
            LoggerService.log('error', `RequestRestedStateIncrease error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

module.exports = router;
