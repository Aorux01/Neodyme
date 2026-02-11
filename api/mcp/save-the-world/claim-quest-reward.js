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

router.post("/fortnite/api/game/v2/profile/:accountId/client/ClaimQuestReward",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { questId, selectedRewardIndex } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const rewardsDataPath = path.join(__dirname, '../../../content/campaign/Rewards.json');
            
            let rewardsData;
            try {
                const data = await fs.readFile(rewardsDataPath, 'utf-8');
                rewardsData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load Rewards data');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const multiUpdate = [];
            const notifications = [];
            let theaterModified = false;
            let commonCoreModified = false;

            if (questId) {
                let questTemplateId = null;
                for (const key in profile.items) {
                    if (questId.toLowerCase() === key.toLowerCase()) {
                        questTemplateId = profile.items[key].templateId.toLowerCase();
                        break;
                    }
                }

                if (questTemplateId && rewardsData.quest && rewardsData.quest[questTemplateId]) {
                    let rewards;
                    
                    if (selectedRewardIndex !== -1 && rewardsData.quest[questTemplateId].selectableRewards) {
                        rewards = rewardsData.quest[questTemplateId].selectableRewards[selectedRewardIndex].rewards;
                    } else {
                        rewards = rewardsData.quest[questTemplateId].rewards;
                    }

                    const theater0 = await DatabaseManager.getProfile(accountId, 'theater0');
                    
                    multiUpdate.push({
                        profileRevision: theater0.rvn || 0,
                        profileId: 'theater0',
                        profileChangesBaseRevision: theater0.rvn || 0,
                        profileChanges: [],
                        profileCommandRevision: theater0.commandRevision || 0
                    });

                    let commonCore = null;
                    if (profileId === 'campaign') {
                        commonCore = await DatabaseManager.getProfile(accountId, 'common_core');
                        
                        multiUpdate.push({
                            profileRevision: commonCore.rvn || 0,
                            profileId: 'common_core',
                            profileChangesBaseRevision: commonCore.rvn || 0,
                            profileChanges: [],
                            profileCommandRevision: commonCore.commandRevision || 0
                        });
                    }

                    notifications.push({
                        type: "questClaim",
                        primary: true,
                        questId: questTemplateId,
                        loot: {
                            items: []
                        }
                    });

                    for (const reward of rewards) {
                        const itemId = DatabaseManager.generateItemId();
                        const templateId = reward.templateId.toLowerCase();

                        if (templateId.startsWith("weapon:") || templateId.startsWith("trap:") || templateId.startsWith("ammo:")) {
                            const item = {
                                templateId: reward.templateId,
                                attributes: {
                                    clipSizeScale: 0,
                                    loadedAmmo: 999,
                                    level: 1,
                                    alterationDefinitions: [],
                                    baseClipSize: 999,
                                    durability: 375,
                                    itemSource: "",
                                    item_seen: false
                                },
                                quantity: reward.quantity
                            };

                            theater0.items[itemId] = item;

                            await DatabaseManager.addItemToProfile(accountId, 'theater0', itemId, item);

                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                            notifications[0].loot.items.push({
                                itemType: reward.templateId,
                                itemGuid: itemId,
                                itemProfile: 'theater0',
                                quantity: reward.quantity
                            });

                            theaterModified = true;
                        } else if (profileId === 'campaign' && (templateId.startsWith("homebasebannericon:") || templateId === "token:founderchatunlock")) {
                            const item = {
                                templateId: reward.templateId,
                                attributes: {
                                    max_level_bonus: 0,
                                    level: 1,
                                    item_seen: false,
                                    xp: 0,
                                    favorite: false
                                },
                                quantity: reward.quantity
                            };

                            commonCore.items[itemId] = item;

                            await DatabaseManager.addItemToProfile(accountId, 'common_core', itemId, item);

                            multiUpdate[1].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                            notifications[0].loot.items.push({
                                itemType: reward.templateId,
                                itemGuid: itemId,
                                itemProfile: 'common_core',
                                quantity: reward.quantity
                            });

                            commonCoreModified = true;
                        } else {
                            const item = {
                                templateId: reward.templateId,
                                attributes: {
                                    legacy_alterations: [],
                                    max_level_bonus: 0,
                                    level: 1,
                                    refund_legacy_item: false,
                                    item_seen: false,
                                    alterations: ["", "", "", "", "", ""],
                                    xp: 0,
                                    refundable: false,
                                    alteration_base_rarities: [],
                                    favorite: false
                                },
                                quantity: reward.quantity
                            };

                            if (templateId.startsWith("quest:")) {
                                item.attributes.quest_state = "Active";
                            }

                            profile.items[itemId] = item;

                            await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                            changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

                            notifications[0].loot.items.push({
                                itemType: reward.templateId,
                                itemGuid: itemId,
                                itemProfile: profileId,
                                quantity: reward.quantity
                            });
                        }
                    }

                    if (theaterModified) {
                        theater0.rvn += 1;
                        theater0.commandRevision += 1;
                        multiUpdate[0].profileRevision = theater0.rvn;
                        multiUpdate[0].profileCommandRevision = theater0.commandRevision;
                        await DatabaseManager.saveProfile(accountId, 'theater0', theater0);
                    }

                    if (commonCoreModified && commonCore) {
                        commonCore.rvn += 1;
                        commonCore.commandRevision += 1;
                        multiUpdate[1].profileRevision = commonCore.rvn;
                        multiUpdate[1].profileCommandRevision = commonCore.commandRevision;
                        await DatabaseManager.saveProfile(accountId, 'common_core', commonCore);
                    }
                }

                profile.items[questId].attributes.quest_state = "Claimed";
                profile.items[questId].attributes.last_state_change_time = new Date().toISOString();

                await DatabaseManager.updateItemInProfile(accountId, profileId, questId, {
                    'attributes.quest_state': "Claimed",
                    'attributes.last_state_change_time': profile.items[questId].attributes.last_state_change_time
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: questId,
                    attributeName: "quest_state",
                    attributeValue: "Claimed"
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: questId,
                    attributeName: "last_state_change_time",
                    attributeValue: profile.items[questId].attributes.last_state_change_time
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
                    multiUpdate: multiUpdate,
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `ClaimQuestReward error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;