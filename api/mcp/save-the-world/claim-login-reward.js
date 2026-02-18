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

router.post("/fortnite/api/game/v2/profile/:accountId/client/ClaimLoginReward",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const dailyRewardsPath = path.join(__dirname, '../../../content/campaign/daily-rewards.json');
            
            let dailyRewards;
            try {
                const data = await fs.readFile(dailyRewardsPath, 'utf-8');
                dailyRewards = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load DailyRewards');
                return sendError(res, Errors.Internal.serverError());;
            }

            const versionInfo = VersionService.getVersionInfo(req);
            const changes = [];
            const notifications = [];
            const dateFormat = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";

            if (profile.stats.attributes.daily_rewards.lastClaimDate !== dateFormat) {
                profile.stats.attributes.daily_rewards.nextDefaultReward += 1;
                profile.stats.attributes.daily_rewards.totalDaysLoggedIn += 1;
                profile.stats.attributes.daily_rewards.lastClaimDate = dateFormat;
                profile.stats.attributes.daily_rewards.additionalSchedules.founderspackdailyrewardtoken.rewardsClaimed += 1;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.daily_rewards': profile.stats.attributes.daily_rewards
                });

                changes.push(MCPResponseBuilder.createStatChange('daily_rewards', profile.stats.attributes.daily_rewards));

                if (versionInfo.season < 7) {
                    const day = profile.stats.attributes.daily_rewards.totalDaysLoggedIn % 336;
                    notifications.push({
                        type: "daily_rewards",
                        primary: true,
                        daysLoggedIn: profile.stats.attributes.daily_rewards.totalDaysLoggedIn,
                        items: [dailyRewards[day]]
                    });
                }

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                res.json({
                    profileRevision: profile.rvn,
                    profileId: profileId,
                    profileChangesBaseRevision: profile.rvn - 1,
                    profileChanges: changes,
                    notifications: notifications,
                    profileCommandRevision: profile.commandRevision,
                    serverTime: new Date().toISOString(),
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `ClaimLoginReward error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;