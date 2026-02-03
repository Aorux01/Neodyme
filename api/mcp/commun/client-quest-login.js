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

router.post("/fortnite/api/game/v2/profile/:accountId/client/ClientQuestLogin",
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

            
            
            const athenaQuestsPath = path.join(__dirname, '../../../content/athena/Quests.json');
            const campaignQuestsPath = path.join(__dirname, '../../../content/campaign/Quests.json');
            
            let athenaQuests, campaignQuests;
            try {
                const athenaData = await fs.readFile(athenaQuestsPath, 'utf-8');
                athenaQuests = JSON.parse(athenaData);
                const campaignData = await fs.readFile(campaignQuestsPath, 'utf-8');
                campaignQuests = JSON.parse(campaignData);
            } catch (error) {
                LoggerService.log('error', 'Failed to load Quests data');
                return sendError(res, Errors.Internal.serverError());;
            }

            const versionInfo = VersionService.getVersionInfo(req);
            const changes = [];

            let questCount = 0;
            let shouldGiveQuest = true;
            const dateFormat = new Date().toISOString().split("T")[0];
            let dailyQuestIDS;
            let seasonQuestIDS;

            const seasonPrefix = versionInfo.season < 10 ? `0${versionInfo.season}` : versionInfo.season;

            try {
                if (profileId === 'profile0' || profileId === 'campaign') {
                    dailyQuestIDS = campaignQuests.Daily;

                    if (campaignQuests[`Season${seasonPrefix}`]) {
                        seasonQuestIDS = campaignQuests[`Season${seasonPrefix}`];
                    }

                    for (const key in profile.items) {
                        if (profile.items[key].templateId.toLowerCase().startsWith("quest:daily")) {
                            questCount += 1;
                        }
                    }

                    if (ConfigManager.get("bGrantFoundersPacks") === true) {
                        const questsToGrant = [
                            "Quest:foundersquest_getrewards_0_1",
                            "Quest:foundersquest_getrewards_1_2",
                            "Quest:foundersquest_getrewards_2_3",
                            "Quest:foundersquest_getrewards_3_4",
                            "Quest:foundersquest_chooseherobundle",
                            "Quest:foundersquest_getrewards_4_5",
                            "Quest:foundersquest_herobundle_nochoice"
                        ];

                        for (const questTemplate of questsToGrant) {
                            let skipThisQuest = false;
                            for (const key in profile.items) {
                                if (profile.items[key].templateId.toLowerCase() === questTemplate.toLowerCase()) {
                                    skipThisQuest = true;
                                    break;
                                }
                            }

                            if (skipThisQuest) continue;

                            const itemId = DatabaseManager.generateItemId();
                            const item = {
                                templateId: questTemplate,
                                attributes: {
                                    creation_time: "min",
                                    quest_state: "Completed",
                                    last_state_change_time: new Date().toISOString(),
                                    level: -1,
                                    sent_new_notification: true,
                                    xp_reward_scalar: 1
                                },
                                quantity: 1
                            };

                            profile.items[itemId] = item;

                            await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                            changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                        }
                    }
                }

                if (profileId === 'athena') {
                    dailyQuestIDS = athenaQuests.Daily;

                    if (athenaQuests[`Season${seasonPrefix}`]) {
                        seasonQuestIDS = athenaQuests[`Season${seasonPrefix}`];
                    }

                    for (const key in profile.items) {
                        if (profile.items[key].templateId.toLowerCase().startsWith("quest:athenadaily")) {
                            questCount += 1;
                        }
                    }
                }

                if (profile.stats.attributes.quest_manager) {
                    if (profile.stats.attributes.quest_manager.dailyLoginInterval) {
                        if (profile.stats.attributes.quest_manager.dailyLoginInterval.includes("T")) {
                            const dailyLoginDate = profile.stats.attributes.quest_manager.dailyLoginInterval.split("T")[0];

                            if (dailyLoginDate === dateFormat) {
                                shouldGiveQuest = false;
                            } else {
                                shouldGiveQuest = true;
                                if (profile.stats.attributes.quest_manager.dailyQuestRerolls <= 0) {
                                    profile.stats.attributes.quest_manager.dailyQuestRerolls += 1;
                                }
                            }
                        }
                    }
                }

                if (questCount < 3 && shouldGiveQuest === true) {
                    const newQuestId = DatabaseManager.generateItemId();
                    let randomNumber = Math.floor(Math.random() * dailyQuestIDS.length);

                    for (const key in profile.items) {
                        while (dailyQuestIDS[randomNumber].templateId.toLowerCase() === profile.items[key].templateId.toLowerCase()) {
                            randomNumber = Math.floor(Math.random() * dailyQuestIDS.length);
                        }
                    }

                    const newQuest = {
                        templateId: dailyQuestIDS[randomNumber].templateId,
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

                    for (const objective of dailyQuestIDS[randomNumber].objectives) {
                        newQuest.attributes[`completion_${objective.toLowerCase()}`] = 0;
                    }

                    profile.items[newQuestId] = newQuest;

                    await DatabaseManager.addItemToProfile(accountId, profileId, newQuestId, newQuest);

                    profile.stats.attributes.quest_manager.dailyLoginInterval = new Date().toISOString();

                    await DatabaseManager.updateProfileStats(accountId, profileId, {
                        'attributes.quest_manager': profile.stats.attributes.quest_manager
                    });

                    changes.push(MCPResponseBuilder.createItemAdded(newQuestId, newQuest));
                    changes.push(MCPResponseBuilder.createStatChange('quest_manager', profile.stats.attributes.quest_manager));
                }
            } catch (err) {
                LoggerService.log('warn', `Error in daily quest logic: ${err.message}`);
            }

            for (const key in profile.items) {
                if (key.startsWith("QS") && !isNaN(key[2]) && !isNaN(key[3]) && key[4] === "-") {
                    if (!key.startsWith(`QS${seasonPrefix}-`)) {
                        delete profile.items[key];

                        await DatabaseManager.removeItemFromProfile(accountId, profileId, key);

                        changes.push(MCPResponseBuilder.createItemRemoved(key));
                    }
                }
            }

            if (seasonQuestIDS) {
                let questsToAdd = [];

                if (profileId === 'athena') {
                    for (const challengeBundleScheduleId in seasonQuestIDS.ChallengeBundleSchedules) {
                        if (profile.items[challengeBundleScheduleId]) {
                            changes.push(MCPResponseBuilder.createItemRemoved(challengeBundleScheduleId));
                        }

                        const challengeBundleSchedule = seasonQuestIDS.ChallengeBundleSchedules[challengeBundleScheduleId];

                        const scheduleItem = {
                            templateId: challengeBundleSchedule.templateId,
                            attributes: {
                                unlock_epoch: new Date().toISOString(),
                                max_level_bonus: 0,
                                level: 1,
                                item_seen: true,
                                xp: 0,
                                favorite: false,
                                granted_bundles: challengeBundleSchedule.granted_bundles
                            },
                            quantity: 1
                        };

                        profile.items[challengeBundleScheduleId] = scheduleItem;

                        await DatabaseManager.addItemToProfile(accountId, profileId, challengeBundleScheduleId, scheduleItem);

                        changes.push(MCPResponseBuilder.createItemAdded(challengeBundleScheduleId, scheduleItem));
                    }

                    for (const challengeBundleId in seasonQuestIDS.ChallengeBundles) {
                        if (profile.items[challengeBundleId]) {
                            changes.push(MCPResponseBuilder.createItemRemoved(challengeBundleId));
                        }

                        const challengeBundle = seasonQuestIDS.ChallengeBundles[challengeBundleId];

                        if (ConfigManager.get("bCompletedSeasonalQuests") === true && challengeBundle.questStages) {
                            challengeBundle.grantedquestinstanceids = challengeBundle.grantedquestinstanceids.concat(challengeBundle.questStages);
                        }

                        const bundleItem = {
                            templateId: challengeBundle.templateId,
                            attributes: {
                                has_unlock_by_completion: false,
                                num_quests_completed: 0,
                                level: 0,
                                grantedquestinstanceids: challengeBundle.grantedquestinstanceids,
                                item_seen: true,
                                max_allowed_bundle_level: 0,
                                num_granted_bundle_quests: 0,
                                max_level_bonus: 0,
                                challenge_bundle_schedule_id: challengeBundle.challenge_bundle_schedule_id,
                                num_progress_quests_completed: 0,
                                xp: 0,
                                favorite: false
                            },
                            quantity: 1
                        };

                        questsToAdd = questsToAdd.concat(challengeBundle.grantedquestinstanceids);
                        bundleItem.attributes.num_granted_bundle_quests = challengeBundle.grantedquestinstanceids.length;

                        if (ConfigManager.get("bCompletedSeasonalQuests") === true) {
                            bundleItem.attributes.num_quests_completed = challengeBundle.grantedquestinstanceids.length;
                            bundleItem.attributes.num_progress_quests_completed = challengeBundle.grantedquestinstanceids.length;

                            if ((versionInfo.season === 10 || versionInfo.season === 11) && 
                                (challengeBundle.templateId.toLowerCase().includes("missionbundle_s10_0") || 
                                 challengeBundle.templateId.toLowerCase() === "challengebundle:missionbundle_s11_stretchgoals2")) {
                                bundleItem.attributes.level += 1;
                            }
                        }

                        profile.items[challengeBundleId] = bundleItem;

                        await DatabaseManager.addItemToProfile(accountId, profileId, challengeBundleId, bundleItem);

                        changes.push(MCPResponseBuilder.createItemAdded(challengeBundleId, bundleItem));
                    }
                } else {
                    for (const key in seasonQuestIDS.Quests) {
                        questsToAdd.push(key);
                    }
                }

                const parseQuest = async (questId) => {
                    const quest = seasonQuestIDS.Quests[questId];

                    if (profile.items[questId]) {
                        changes.push(MCPResponseBuilder.createItemRemoved(questId));
                    }

                    const questItem = {
                        templateId: quest.templateId,
                        attributes: {
                            creation_time: new Date().toISOString(),
                            level: -1,
                            item_seen: true,
                            sent_new_notification: true,
                            challenge_bundle_id: quest.challenge_bundle_id || "",
                            xp_reward_scalar: 1,
                            quest_state: "Active",
                            last_state_change_time: new Date().toISOString(),
                            max_level_bonus: 0,
                            xp: 0,
                            favorite: false
                        },
                        quantity: 1
                    };

                    if (ConfigManager.get("bCompletedSeasonalQuests") === true) {
                        questItem.attributes.quest_state = "Claimed";

                        if (quest.rewards) {
                            for (const reward of quest.rewards) {
                                if (reward.templateId.startsWith("Quest:")) {
                                    for (const Q in seasonQuestIDS.Quests) {
                                        if (seasonQuestIDS.Quests[Q].templateId === reward.templateId) {
                                            seasonQuestIDS.ChallengeBundles[seasonQuestIDS.Quests[Q].challenge_bundle_id].grantedquestinstanceids.push(Q);
                                            await parseQuest(Q);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    for (const objective in quest.objectives) {
                        if (ConfigManager.get("bCompletedSeasonalQuests") === true) {
                            questItem.attributes[`completion_${objective}`] = quest.objectives[objective];
                        } else {
                            questItem.attributes[`completion_${objective}`] = 0;
                        }
                    }

                    profile.items[questId] = questItem;

                    await DatabaseManager.addItemToProfile(accountId, profileId, questId, questItem);

                    changes.push(MCPResponseBuilder.createItemAdded(questId, questItem));
                };

                for (const questId of questsToAdd) {
                    await parseQuest(questId);
                }
            }

            if (changes.length > 0) {
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
            LoggerService.log('error', `ClientQuestLogin error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;