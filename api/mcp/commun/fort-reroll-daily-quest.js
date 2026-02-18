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

router.post("/fortnite/api/game/v2/profile/:accountId/client/FortRerollDailyQuest",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { questId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const questsPath = profileId === 'profile0' || profileId === 'campaign' 
                ? path.join(__dirname, '../../../content/campaign/quests.json')
                : path.join(__dirname, '../../../content/athena/quests.json');
            
            let questsData;
            try {
                const data = await fs.readFile(questsPath, 'utf-8');
                questsData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load Quests data');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const notifications = [];
            const dailyQuests = questsData.Daily;

            if (questId && profile.stats.attributes.quest_manager.dailyQuestRerolls >= 1) {
                let randomNumber = Math.floor(Math.random() * dailyQuests.length);

                for (const key in profile.items) {
                    while (dailyQuests[randomNumber].templateId.toLowerCase() === profile.items[key].templateId.toLowerCase()) {
                        randomNumber = Math.floor(Math.random() * dailyQuests.length);
                    }
                }

                profile.stats.attributes.quest_manager.dailyQuestRerolls -= 1;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.quest_manager': profile.stats.attributes.quest_manager
                });

                changes.push(MCPResponseBuilder.createStatChange('quest_manager', profile.stats.attributes.quest_manager));

                delete profile.items[questId];

                await DatabaseManager.removeItemFromProfile(accountId, profileId, questId);

                changes.push(MCPResponseBuilder.createItemRemoved(questId));

                const newQuestId = DatabaseManager.generateItemId();
                const newQuest = {
                    templateId: dailyQuests[randomNumber].templateId,
                    attributes: {
                        creation_time: new Date().toISOString(),
                        level: -1,
                        item_seen: false,
                        sent_new_notification: false,
                        xp_reward_scalar: 1,
                        quest_state: "Active",
                        last_state_change_time: new Date().toISOString(),
                        max_level_bonus: 0,
                        xp: 0,
                        favorite: false
                    },
                    quantity: 1
                };

                for (const objective of dailyQuests[randomNumber].objectives) {
                    newQuest.attributes[`completion_${objective.toLowerCase()}`] = 0;
                }

                profile.items[newQuestId] = newQuest;

                await DatabaseManager.addItemToProfile(accountId, profileId, newQuestId, newQuest);

                changes.push(MCPResponseBuilder.createItemAdded(newQuestId, newQuest));

                notifications.push({
                    type: "dailyQuestReroll",
                    primary: true,
                    newQuestId: dailyQuests[randomNumber].templateId
                });

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
            LoggerService.log('error', `FortRerollDailyQuest error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;