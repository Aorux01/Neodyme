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

router.post("/fortnite/api/game/v2/profile/:accountId/client/UnlockRewardNode",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { nodeId, rewardGraphId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            const commonCore = await DatabaseManager.getProfile(accountId, 'common_core');
            
            if (!profile || !commonCore) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const winterfestPath = path.join(__dirname, '../../../content/athena/winterfest-rewards.json');
            
            let winterfestRewards;
            try {
                const data = await fs.readFile(winterfestPath, 'utf-8');
                winterfestRewards = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load Winterfest rewards');
                return sendError(res, Errors.Internal.serverError());;
            }

            const versionInfo = VersionService.getVersionInfo(req);
            const changes = [];
            const multiUpdate = [];
            let commonCoreModified = false;
            const season = `Season${versionInfo.season}`;

            const giftBoxId = DatabaseManager.generateItemId();
            const giftBox = {
                templateId: "GiftBox:gb_winterfestreward",
                attributes: {
                    max_level_bonus: 0,
                    fromAccountId: "",
                    lootList: [],
                    level: 1,
                    item_seen: false,
                    xp: 0,
                    giftedOn: new Date().toISOString(),
                    params: {
                        SubGame: "Athena",
                        winterfestGift: "true"
                    },
                    favorite: false
                },
                quantity: 1
            };

            if (nodeId && rewardGraphId && winterfestRewards[season] && winterfestRewards[season][nodeId]) {
                for (const reward of winterfestRewards[season][nodeId]) {
                    const rewardId = DatabaseManager.generateItemId();
                    let itemExists = false;

                    if (reward.toLowerCase().startsWith("homebasebannericon:")) {
                        if (!commonCoreModified) {
                            multiUpdate.push({
                                profileRevision: commonCore.rvn || 0,
                                profileId: 'common_core',
                                profileChangesBaseRevision: commonCore.rvn || 0,
                                profileChanges: [],
                                profileCommandRevision: commonCore.commandRevision || 0
                            });
                            commonCoreModified = true;
                        }

                        for (const key in commonCore.items) {
                            if (commonCore.items[key].templateId.toLowerCase() === reward.toLowerCase()) {
                                commonCore.items[key].attributes.item_seen = false;
                                itemExists = true;

                                await DatabaseManager.updateItemInProfile(accountId, 'common_core', key, {
                                    'attributes.item_seen': false
                                });

                                multiUpdate[0].profileChanges.push({
                                    changeType: "itemAttrChanged",
                                    itemId: key,
                                    attributeName: "item_seen",
                                    attributeValue: false
                                });

                                giftBox.attributes.lootList.push({
                                    itemType: reward,
                                    itemGuid: key,
                                    itemProfile: 'common_core',
                                    attributes: { creation_time: new Date().toISOString() },
                                    quantity: 1
                                });
                                break;
                            }
                        }

                        if (!itemExists) {
                            const item = {
                                templateId: reward,
                                attributes: {
                                    max_level_bonus: 0,
                                    level: 1,
                                    item_seen: false,
                                    xp: 0,
                                    variants: [],
                                    favorite: false
                                },
                                quantity: 1
                            };

                            commonCore.items[rewardId] = item;

                            await DatabaseManager.addItemToProfile(accountId, 'common_core', rewardId, item);

                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(rewardId, item));

                            giftBox.attributes.lootList.push({
                                itemType: reward,
                                itemGuid: rewardId,
                                itemProfile: 'common_core',
                                attributes: { creation_time: new Date().toISOString() },
                                quantity: 1
                            });
                        }
                    } else {
                        for (const key in profile.items) {
                            if (profile.items[key].templateId.toLowerCase() === reward.toLowerCase()) {
                                profile.items[key].attributes.item_seen = false;
                                itemExists = true;

                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                    'attributes.item_seen': false
                                });

                                changes.push({
                                    changeType: "itemAttrChanged",
                                    itemId: key,
                                    attributeName: "item_seen",
                                    attributeValue: false
                                });

                                giftBox.attributes.lootList.push({
                                    itemType: reward,
                                    itemGuid: key,
                                    itemProfile: profileId,
                                    attributes: { creation_time: new Date().toISOString() },
                                    quantity: 1
                                });
                                break;
                            }
                        }

                        if (!itemExists) {
                            const item = {
                                templateId: reward,
                                attributes: {
                                    max_level_bonus: 0,
                                    level: 1,
                                    item_seen: false,
                                    xp: 0,
                                    variants: [],
                                    favorite: false
                                },
                                quantity: 1
                            };

                            profile.items[rewardId] = item;

                            await DatabaseManager.addItemToProfile(accountId, profileId, rewardId, item);

                            changes.push(MCPResponseBuilder.createItemAdded(rewardId, item));

                            giftBox.attributes.lootList.push({
                                itemType: reward,
                                itemGuid: rewardId,
                                itemProfile: profileId,
                                attributes: { creation_time: new Date().toISOString() },
                                quantity: 1
                            });
                        }
                    }
                }

                profile.items[rewardGraphId].attributes.reward_keys[0].unlock_keys_used += 1;
                profile.items[rewardGraphId].attributes.reward_nodes_claimed.push(nodeId);

                await DatabaseManager.updateItemInProfile(accountId, profileId, rewardGraphId, {
                    'attributes.reward_keys': profile.items[rewardGraphId].attributes.reward_keys,
                    'attributes.reward_nodes_claimed': profile.items[rewardGraphId].attributes.reward_nodes_claimed
                });

                profile.items[giftBoxId] = giftBox;

                await DatabaseManager.addItemToProfile(accountId, profileId, giftBoxId, giftBox);

                changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: rewardGraphId,
                    attributeName: "reward_keys",
                    attributeValue: profile.items[rewardGraphId].attributes.reward_keys
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: rewardGraphId,
                    attributeName: "reward_nodes_claimed",
                    attributeValue: profile.items[rewardGraphId].attributes.reward_nodes_claimed
                });

                if (versionInfo.season === 11 && profile.items.S11_GIFT_KEY) {
                    profile.items.S11_GIFT_KEY.quantity -= 1;

                    await DatabaseManager.updateItemInProfile(accountId, profileId, 'S11_GIFT_KEY', {
                        quantity: profile.items.S11_GIFT_KEY.quantity
                    });

                    changes.push(MCPResponseBuilder.createItemQuantityChanged('S11_GIFT_KEY', profile.items.S11_GIFT_KEY.quantity));
                }

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);

                if (commonCoreModified) {
                    commonCore.rvn += 1;
                    commonCore.commandRevision += 1;

                    multiUpdate[0].profileRevision = commonCore.rvn;
                    multiUpdate[0].profileCommandRevision = commonCore.commandRevision;

                    await DatabaseManager.saveProfile(accountId, 'common_core', commonCore);
                }
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                res.json({
                    profileRevision: profile.rvn,
                    profileId: profileId,
                    profileChangesBaseRevision: profile.rvn - 1,
                    profileChanges: changes,
                    profileCommandRevision: profile.commandRevision,
                    serverTime: new Date().toISOString(),
                    multiUpdate: multiUpdate,
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `UnlockRewardNode error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;