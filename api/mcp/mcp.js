const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../src/middleware/authMiddleware');
const MCPMiddleware = require('../../src/middleware/mcpMiddleware');
const MCPResponseBuilder = require('../../src/utils/MCPResponseBuilder');
const DatabaseManager = require('../../src/manager/DatabaseManager');
const VersionService = require('../../src/service/api/VersionService');
const LoggerService = require('../../src/service/logger/LoggerService');
const ShopManager = require("../../src/manager/ShopManager");
const FunctionsService = require('../../src/service/api/FunctionsService');
const ConfigManager = require('../../src/manager/ConfigManager');
const ShopService = require("../../src/service/api/ShopService");
const EXPService = require('../../src/service/api/EXPService');
const { Errors, sendError } = require('../../src/service/error/Errors');
const catalog = ShopService.getItemShop();
const fs = require('fs').promises;
const path = require('path');

router.use(MCPMiddleware.validateProfileId);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetAffiliateName",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = 'common_core';
            const queryRevision = req.query.rvn || -1;
            const { affiliateName } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }
            const sacPath = path.join(__dirname, '../../content/affiliate/SupportedAffiliateCodes.json');
            
            let supportedCodes;
            try {
                const data = await fs.readFile(sacPath, 'utf-8');
                supportedCodes = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load SAC codes');
                supportedCodes = [];
            }

            const changes = [];
            let isValidCode = false;

            for (const code of supportedCodes) {
                if (affiliateName.toLowerCase() === code.toLowerCase() || affiliateName === "") {
                    isValidCode = true;
                    break;
                }
            }

            if (isValidCode) {
                profile.stats.attributes.mtx_affiliate_set_time = new Date().toISOString();
                profile.stats.attributes.mtx_affiliate = affiliateName;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.mtx_affiliate_set_time': profile.stats.attributes.mtx_affiliate_set_time,
                    'attributes.mtx_affiliate': affiliateName
                });

                changes.push(MCPResponseBuilder.createStatChange('mtx_affiliate_set_time', profile.stats.attributes.mtx_affiliate_set_time));
                changes.push(MCPResponseBuilder.createStatChange('mtx_affiliate', profile.stats.attributes.mtx_affiliate));

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
            LoggerService.log('error', `SetAffiliateName error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetHomebaseBanner",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { homebaseBannerIconId, homebaseBannerColorId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (homebaseBannerIconId && homebaseBannerColorId) {
                switch (profileId) {
                    case "profile0":
                        profile.stats.attributes.homebase.bannerIconId = homebaseBannerIconId;
                        profile.stats.attributes.homebase.bannerColorId = homebaseBannerColorId;

                        await DatabaseManager.updateProfileStats(accountId, profileId, {
                            'attributes.homebase': profile.stats.attributes.homebase
                        });

                        changes.push(MCPResponseBuilder.createStatChange('homebase', profile.stats.attributes.homebase));
                        break;

                    case "common_public":
                        profile.stats.attributes.banner_icon = homebaseBannerIconId;
                        profile.stats.attributes.banner_color = homebaseBannerColorId;

                        await DatabaseManager.updateProfileStats(accountId, profileId, {
                            'attributes.banner_icon': homebaseBannerIconId,
                            'attributes.banner_color': homebaseBannerColorId
                        });

                        changes.push(MCPResponseBuilder.createStatChange('banner_icon', profile.stats.attributes.banner_icon));
                        changes.push(MCPResponseBuilder.createStatChange('banner_color', profile.stats.attributes.banner_color));
                        break;
                }

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
            LoggerService.log('error', `SetHomebaseBanner error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetHomebaseName",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { homebaseName } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (homebaseName) {
                switch (profileId) {
                    case "profile0":
                        profile.stats.attributes.homebase.townName = homebaseName;

                        await DatabaseManager.updateProfileStats(accountId, profileId, {
                            'attributes.homebase': profile.stats.attributes.homebase
                        });

                        changes.push(MCPResponseBuilder.createStatChange('homebase', profile.stats.attributes.homebase));
                        break;

                    case "common_public":
                        profile.stats.attributes.homebase_name = homebaseName;

                        await DatabaseManager.updateProfileStats(accountId, profileId, {
                            'attributes.homebase_name': homebaseName
                        });

                        changes.push(MCPResponseBuilder.createStatChange('homebase_name', profile.stats.attributes.homebase_name));
                        break;
                }

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
            LoggerService.log('error', `SetHomebaseName error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/PurchaseHomebaseNode",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { nodeId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (nodeId) {
                const itemId = DatabaseManager.generateItemId();
                const item = {
                    templateId: `HomebaseNode:${nodeId}`,
                    attributes: {
                        item_seen: true
                    },
                    quantity: 1
                };

                profile.items[itemId] = item;

                await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

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
            LoggerService.log('error', `PurchaseHomebaseNode error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

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

            
            
            const winterfestPath = path.join(__dirname, '../../content/athena/WinterfestRewards.json');
            
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

router.post("/fortnite/api/game/v2/profile/:accountId/client/RemoveGiftBox",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { giftBoxItemId, giftBoxItemIds } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (giftBoxItemId) {
                if (profile.items[giftBoxItemId]) {
                    delete profile.items[giftBoxItemId];

                    await DatabaseManager.removeItemFromProfile(accountId, profileId, giftBoxItemId);

                    changes.push(MCPResponseBuilder.createItemRemoved(giftBoxItemId));
                }
            }

            if (giftBoxItemIds) {
                for (const itemId of giftBoxItemIds) {
                    if (profile.items[itemId]) {
                        delete profile.items[itemId];

                        await DatabaseManager.removeItemFromProfile(accountId, profileId, itemId);

                        changes.push(MCPResponseBuilder.createItemRemoved(itemId));
                    }
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
            LoggerService.log('error', `RemoveGiftBox error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetPartyAssistQuest",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { questToPinAsPartyAssist } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (profile.stats.attributes.party_assist_quest !== undefined) {
                profile.stats.attributes.party_assist_quest = questToPinAsPartyAssist || "";

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.party_assist_quest': profile.stats.attributes.party_assist_quest
                });

                changes.push(MCPResponseBuilder.createStatChange('party_assist_quest', profile.stats.attributes.party_assist_quest));

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
            LoggerService.log('error', `SetPartyAssistQuest error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/AthenaPinQuest",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { pinnedQuest } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (profile.stats.attributes.pinned_quest !== undefined) {
                profile.stats.attributes.pinned_quest = pinnedQuest || "";

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.pinned_quest': profile.stats.attributes.pinned_quest
                });

                changes.push(MCPResponseBuilder.createStatChange('pinned_quest', profile.stats.attributes.pinned_quest));

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
            LoggerService.log('error', `AthenaPinQuest error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetPinnedQuests",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { pinnedQuestIds } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (pinnedQuestIds) {
                profile.stats.attributes.client_settings.pinnedQuestInstances = pinnedQuestIds;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.client_settings': profile.stats.attributes.client_settings
                });

                changes.push(MCPResponseBuilder.createStatChange('client_settings', profile.stats.attributes.client_settings));

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
            LoggerService.log('error', `SetPinnedQuests error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

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
                ? path.join(__dirname, '../../content/campaign/Quests.json')
                : path.join(__dirname, '../../content/athena/Quests.json');
            
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

router.post("/fortnite/api/game/v2/profile/:accountId/client/MarkNewQuestNotificationSent",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { itemIds } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (itemIds) {
                for (const itemId of itemIds) {
                    if (profile.items[itemId]) {
                        profile.items[itemId].attributes.sent_new_notification = true;

                        await DatabaseManager.updateItemInProfile(accountId, profileId, itemId, {
                            'attributes.sent_new_notification': true
                        });

                        changes.push({
                            changeType: "itemAttrChanged",
                            itemId: itemId,
                            attributeName: "sent_new_notification",
                            attributeValue: true
                        });
                    }
                }

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
            LoggerService.log('error', `MarkNewQuestNotificationSent error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

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

            
            
            const athenaQuestsPath = path.join(__dirname, '../../content/athena/Quests.json');
            const campaignQuestsPath = path.join(__dirname, '../../content/campaign/Quests.json');
            
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

router.post("/fortnite/api/game/v2/profile/:accountId/client/RefundItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                profile.items[targetItemId].templateId = `${profile.items[targetItemId].templateId.replace(/\d$/, '')}1`;
                profile.items[targetItemId].attributes.level = 1;
                profile.items[targetItemId].attributes.refundable = false;

                const newItemId = DatabaseManager.generateItemId();
                profile.items[newItemId] = profile.items[targetItemId];

                await DatabaseManager.addItemToProfile(accountId, profileId, newItemId, profile.items[newItemId]);

                changes.push(MCPResponseBuilder.createItemAdded(newItemId, profile.items[newItemId]));

                delete profile.items[targetItemId];

                await DatabaseManager.removeItemFromProfile(accountId, profileId, targetItemId);

                changes.push(MCPResponseBuilder.createItemRemoved(targetItemId));

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
            LoggerService.log('error', `RefundItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/RefundMtxPurchase",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'common_core';
            const queryRevision = req.query.rvn || -1;
            const { purchaseId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            const athenaProfile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile || !athenaProfile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const multiUpdate = [];
            const itemGuids = [];

            if (purchaseId) {
                multiUpdate.push({
                    profileRevision: athenaProfile.rvn || 0,
                    profileId: 'athena',
                    profileChangesBaseRevision: athenaProfile.rvn || 0,
                    profileChanges: [],
                    profileCommandRevision: athenaProfile.commandRevision || 0
                });

                profile.stats.attributes.mtx_purchase_history.refundsUsed += 1;
                profile.stats.attributes.mtx_purchase_history.refundCredits -= 1;

                for (const purchase of profile.stats.attributes.mtx_purchase_history.purchases) {
                    if (purchase.purchaseId === purchaseId) {
                        for (const lootItem of purchase.lootResult) {
                            itemGuids.push(lootItem.itemGuid);
                        }

                        purchase.refundDate = new Date().toISOString();

                        for (const key in profile.items) {
                            if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                    profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                    
                                    profile.items[key].quantity += purchase.totalMtxPaid;

                                    await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                        quantity: profile.items[key].quantity
                                    });

                                    changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                    break;
                                }
                            }
                        }
                    }
                }

                for (const itemGuid of itemGuids) {
                    try {
                        if (athenaProfile.items[itemGuid]) {
                            delete athenaProfile.items[itemGuid];

                            await DatabaseManager.removeItemFromProfile(accountId, 'athena', itemGuid);

                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(itemGuid));
                        }
                    } catch (err) {
                        LoggerService.log('warn', `Failed to remove item ${itemGuid}: ${err.message}`);
                    }
                }

                athenaProfile.rvn += 1;
                athenaProfile.commandRevision += 1;
                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.mtx_purchase_history': profile.stats.attributes.mtx_purchase_history
                });

                changes.push(MCPResponseBuilder.createStatChange('mtx_purchase_history', profile.stats.attributes.mtx_purchase_history));

                multiUpdate[0].profileRevision = athenaProfile.rvn;
                multiUpdate[0].profileCommandRevision = athenaProfile.commandRevision;

                await DatabaseManager.saveProfile(accountId, profileId, profile);
                await DatabaseManager.saveProfile(accountId, 'athena', athenaProfile);
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
            LoggerService.log('error', `RefundMtxPurchase error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/IncrementNamedCounterStat",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { counterName } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (counterName && profile.stats.attributes.named_counters) {
                if (profile.stats.attributes.named_counters[counterName]) {
                    profile.stats.attributes.named_counters[counterName].current_count += 1;
                    profile.stats.attributes.named_counters[counterName].last_incremented_time = new Date().toISOString();

                    await DatabaseManager.updateProfileStats(accountId, profileId, {
                        'attributes.named_counters': profile.stats.attributes.named_counters
                    });

                    changes.push(MCPResponseBuilder.createStatChange('named_counters', profile.stats.attributes.named_counters));

                    profile.rvn += 1;
                    profile.commandRevision += 1;

                    await DatabaseManager.saveProfile(accountId, profileId, profile);
                }
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `IncrementNamedCounterStat error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

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

            
            
            const dailyRewardsPath = path.join(__dirname, '../../content/campaign/DailyRewards.json');
            
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

router.post("/fortnite/api/game/v2/profile/:accountId/client/UpdateQuestClientObjectives",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { advance } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (advance) {
                for (const advanceItem of advance) {
                    const questsToUpdate = [];

                    for (const key in profile.items) {
                        if (profile.items[key].templateId.toLowerCase().startsWith("quest:")) {
                            for (const attr in profile.items[key].attributes) {
                                if (attr.toLowerCase() === `completion_${advanceItem.statName}`) {
                                    questsToUpdate.push(key);
                                }
                            }
                        }
                    }

                    for (const questId of questsToUpdate) {
                        let isIncomplete = false;

                        profile.items[questId].attributes[`completion_${advanceItem.statName}`] = advanceItem.count;

                        await DatabaseManager.updateItemInProfile(accountId, profileId, questId, {
                            [`attributes.completion_${advanceItem.statName}`]: advanceItem.count
                        });

                        changes.push({
                            changeType: "itemAttrChanged",
                            itemId: questId,
                            attributeName: `completion_${advanceItem.statName}`,
                            attributeValue: advanceItem.count
                        });

                        if (profile.items[questId].attributes.quest_state.toLowerCase() !== "claimed") {
                            for (const attr in profile.items[questId].attributes) {
                                if (attr.toLowerCase().startsWith("completion_")) {
                                    if (profile.items[questId].attributes[attr] === 0) {
                                        isIncomplete = true;
                                    }
                                }
                            }

                            if (!isIncomplete) {
                                profile.items[questId].attributes.quest_state = "Claimed";

                                await DatabaseManager.updateItemInProfile(accountId, profileId, questId, {
                                    'attributes.quest_state': "Claimed"
                                });

                                changes.push({
                                    changeType: "itemAttrChanged",
                                    itemId: questId,
                                    attributeName: "quest_state",
                                    attributeValue: "Claimed"
                                });
                            }
                        }
                    }
                }

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
            LoggerService.log('error', `UpdateQuestClientObjectives error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/AssignTeamPerkToLoadout",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { loadoutId, teamPerkId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (loadoutId) {
                if (!profile.items[loadoutId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                profile.items[loadoutId].attributes.team_perk = teamPerkId || "";

                await DatabaseManager.updateItemInProfile(accountId, profileId, loadoutId, {
                    'attributes.team_perk': teamPerkId || ""
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: loadoutId,
                    attributeName: "team_perk",
                    attributeValue: profile.items[loadoutId].attributes.team_perk
                });

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
            LoggerService.log('error', `AssignTeamPerkToLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/AssignGadgetToLoadout",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { loadoutId, slotIndex, gadgetId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (loadoutId) {
                if (!profile.items[loadoutId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                switch (slotIndex) {
                    case 0:
                        if ((gadgetId || "").toLowerCase() === profile.items[loadoutId].attributes.gadgets[1].gadget.toLowerCase()) {
                            profile.items[loadoutId].attributes.gadgets[1].gadget = "";
                        }
                        profile.items[loadoutId].attributes.gadgets[slotIndex].gadget = gadgetId || "";
                        break;

                    case 1:
                        if ((gadgetId || "").toLowerCase() === profile.items[loadoutId].attributes.gadgets[0].gadget.toLowerCase()) {
                            profile.items[loadoutId].attributes.gadgets[0].gadget = "";
                        }
                        profile.items[loadoutId].attributes.gadgets[slotIndex].gadget = gadgetId || "";
                        break;
                }

                await DatabaseManager.updateItemInProfile(accountId, profileId, loadoutId, {
                    'attributes.gadgets': profile.items[loadoutId].attributes.gadgets
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: loadoutId,
                    attributeName: "gadgets",
                    attributeValue: profile.items[loadoutId].attributes.gadgets
                });

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
            LoggerService.log('error', `AssignGadgetToLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/AssignWorkerToSquad",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { characterId, squadId, slotIndex } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (characterId) {
                for (const key in profile.items) {
                    if (profile.items[key].attributes && 
                        profile.items[key].attributes.squad_id && 
                        profile.items[key].attributes.squad_slot_idx !== undefined) {
                        
                        if (profile.items[key].attributes.squad_id !== "" && 
                            profile.items[key].attributes.squad_slot_idx !== -1) {
                            
                            if (profile.items[key].attributes.squad_id.toLowerCase() === squadId.toLowerCase() && 
                                profile.items[key].attributes.squad_slot_idx === slotIndex) {
                                
                                profile.items[key].attributes.squad_id = "";
                                profile.items[key].attributes.squad_slot_idx = 0;

                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                    'attributes.squad_id': "",
                                    'attributes.squad_slot_idx': 0
                                });

                                changes.push({
                                    changeType: "itemAttrChanged",
                                    itemId: key,
                                    attributeName: "squad_id",
                                    attributeValue: ""
                                });

                                changes.push({
                                    changeType: "itemAttrChanged",
                                    itemId: key,
                                    attributeName: "squad_slot_idx",
                                    attributeValue: 0
                                });
                            }
                        }
                    }
                }

                profile.items[characterId].attributes.squad_id = squadId || "";
                profile.items[characterId].attributes.squad_slot_idx = slotIndex || 0;

                await DatabaseManager.updateItemInProfile(accountId, profileId, characterId, {
                    'attributes.squad_id': squadId || "",
                    'attributes.squad_slot_idx': slotIndex || 0
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: characterId,
                    attributeName: "squad_id",
                    attributeValue: profile.items[characterId].attributes.squad_id
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: characterId,
                    attributeName: "squad_slot_idx",
                    attributeValue: profile.items[characterId].attributes.squad_slot_idx
                });

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
            LoggerService.log('error', `AssignWorkerToSquad error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/AssignWorkerToSquadBatch",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { characterIds, squadIds, slotIndices } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (characterIds && squadIds && slotIndices) {
                for (let i = 0; i < characterIds.length; i++) {
                    for (const key in profile.items) {
                        if (profile.items[key].attributes && 
                            profile.items[key].attributes.squad_id && 
                            profile.items[key].attributes.squad_slot_idx !== undefined) {
                            
                            if (profile.items[key].attributes.squad_id !== "" && 
                                profile.items[key].attributes.squad_slot_idx !== -1) {
                                
                                if (profile.items[key].attributes.squad_id.toLowerCase() === squadIds[i].toLowerCase() && 
                                    profile.items[key].attributes.squad_slot_idx === slotIndices[i]) {
                                    
                                    profile.items[key].attributes.squad_id = "";
                                    profile.items[key].attributes.squad_slot_idx = 0;

                                    await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                        'attributes.squad_id': "",
                                        'attributes.squad_slot_idx': 0
                                    });

                                    changes.push({
                                        changeType: "itemAttrChanged",
                                        itemId: key,
                                        attributeName: "squad_id",
                                        attributeValue: ""
                                    });

                                    changes.push({
                                        changeType: "itemAttrChanged",
                                        itemId: key,
                                        attributeName: "squad_slot_idx",
                                        attributeValue: 0
                                    });
                                }
                            }
                        }
                    }

                    profile.items[characterIds[i]].attributes.squad_id = squadIds[i] || "";
                    profile.items[characterIds[i]].attributes.squad_slot_idx = slotIndices[i] || 0;

                    await DatabaseManager.updateItemInProfile(accountId, profileId, characterIds[i], {
                        'attributes.squad_id': squadIds[i] || "",
                        'attributes.squad_slot_idx': slotIndices[i] || 0
                    });

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: characterIds[i],
                        attributeName: "squad_id",
                        attributeValue: profile.items[characterIds[i]].attributes.squad_id
                    });

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: characterIds[i],
                        attributeName: "squad_slot_idx",
                        attributeValue: profile.items[characterIds[i]].attributes.squad_slot_idx
                    });
                }

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
            LoggerService.log('error', `AssignWorkerToSquadBatch error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

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

            
            
            const rewardsDataPath = path.join(__dirname, '../../content/campaign/Rewards.json');
            
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

router.post("/fortnite/api/game/v2/profile/:accountId/client/UpgradeItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                profile.items[targetItemId].attributes.level += 1;

                await DatabaseManager.updateItemInProfile(accountId, profileId, targetItemId, {
                    'attributes.level': profile.items[targetItemId].attributes.level
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: targetItemId,
                    attributeName: "level",
                    attributeValue: profile.items[targetItemId].attributes.level
                });

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
            LoggerService.log('error', `UpgradeItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/UpgradeSlottedItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'collection_book_people0';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId, desiredLevel } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (desiredLevel) {
                    profile.items[targetItemId].attributes.level = Number(desiredLevel);
                } else {
                    profile.items[targetItemId].attributes.level += 1;
                }

                await DatabaseManager.updateItemInProfile(accountId, profileId, targetItemId, {
                    'attributes.level': profile.items[targetItemId].attributes.level
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: targetItemId,
                    attributeName: "level",
                    attributeValue: profile.items[targetItemId].attributes.level
                });

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
            LoggerService.log('error', `UpgradeSlottedItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/UpgradeItemBulk",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId, desiredLevel } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                profile.items[targetItemId].attributes.level = Number(desiredLevel);

                await DatabaseManager.updateItemInProfile(accountId, profileId, targetItemId, {
                    'attributes.level': profile.items[targetItemId].attributes.level
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: targetItemId,
                    attributeName: "level",
                    attributeValue: profile.items[targetItemId].attributes.level
                });

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
            LoggerService.log('error', `UpgradeItemBulk error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/ConvertItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId, conversionIndex } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const notifications = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("t04")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/t04/ig, "T05");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("t03")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/t03/ig, "T04");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("t02")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/t02/ig, "T03");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("t01")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/t01/ig, "T02");
                }

                if (conversionIndex === 1) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/ore/ig, "Crystal");
                }

                const newItemId = DatabaseManager.generateItemId();
                profile.items[newItemId] = profile.items[targetItemId];

                await DatabaseManager.addItemToProfile(accountId, profileId, newItemId, profile.items[newItemId]);

                changes.push(MCPResponseBuilder.createItemAdded(newItemId, profile.items[newItemId]));

                delete profile.items[targetItemId];

                await DatabaseManager.removeItemFromProfile(accountId, profileId, targetItemId);

                changes.push(MCPResponseBuilder.createItemRemoved(targetItemId));

                notifications.push({
                    type: "conversionResult",
                    primary: true,
                    itemsGranted: [
                        {
                            itemType: profile.items[newItemId].templateId,
                            itemGuid: newItemId,
                            itemProfile: profileId,
                            attributes: {
                                level: profile.items[newItemId].attributes.level,
                                alterations: profile.items[newItemId].attributes.alterations || []
                            },
                            quantity: 1
                        }
                    ]
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
            LoggerService.log('error', `ConvertItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/ConvertSlottedItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'collection_book_people0';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId, conversionIndex } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const notifications = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("t04")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/t04/ig, "T05");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("t03")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/t03/ig, "T04");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("t02")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/t02/ig, "T03");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("t01")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/t01/ig, "T02");
                }

                if (conversionIndex === 1) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/ore/ig, "Crystal");
                }

                const newItemId = DatabaseManager.generateItemId();
                profile.items[newItemId] = profile.items[targetItemId];

                await DatabaseManager.addItemToProfile(accountId, profileId, newItemId, profile.items[newItemId]);

                changes.push(MCPResponseBuilder.createItemAdded(newItemId, profile.items[newItemId]));

                delete profile.items[targetItemId];

                await DatabaseManager.removeItemFromProfile(accountId, profileId, targetItemId);

                changes.push(MCPResponseBuilder.createItemRemoved(targetItemId));

                notifications.push({
                    type: "conversionResult",
                    primary: true,
                    itemsGranted: [
                        {
                            itemType: profile.items[newItemId].templateId,
                            itemGuid: newItemId,
                            itemProfile: profileId,
                            attributes: {
                                level: profile.items[newItemId].attributes.level,
                                alterations: profile.items[newItemId].attributes.alterations || []
                            },
                            quantity: 1
                        }
                    ]
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
            LoggerService.log('error', `ConvertSlottedItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/UpgradeItemRarity",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const notifications = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("_vr_")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/_vr_/ig, "_SR_");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("_r_")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/_r_/ig, "_VR_");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("_uc_")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/_uc_/ig, "_R_");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("_c_")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/_c_/ig, "_UC_");
                }

                const newItemId = DatabaseManager.generateItemId();
                profile.items[newItemId] = profile.items[targetItemId];

                await DatabaseManager.addItemToProfile(accountId, profileId, newItemId, profile.items[newItemId]);

                changes.push(MCPResponseBuilder.createItemAdded(newItemId, profile.items[newItemId]));

                delete profile.items[targetItemId];

                await DatabaseManager.removeItemFromProfile(accountId, profileId, targetItemId);

                changes.push(MCPResponseBuilder.createItemRemoved(targetItemId));

                notifications.push([{
                    type: "upgradeItemRarityNotification",
                    primary: true,
                    itemsGranted: [
                        {
                            itemType: profile.items[newItemId].templateId,
                            itemGuid: newItemId,
                            itemProfile: profileId,
                            attributes: {
                                level: profile.items[newItemId].attributes.level,
                                alterations: profile.items[newItemId].attributes.alterations || []
                            },
                            quantity: 1
                        }
                    ]
                }]);

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
            LoggerService.log('error', `UpgradeItemRarity error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/PromoteItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                profile.items[targetItemId].attributes.level += 2;

                await DatabaseManager.updateItemInProfile(accountId, profileId, targetItemId, {
                    'attributes.level': profile.items[targetItemId].attributes.level
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: targetItemId,
                    attributeName: "level",
                    attributeValue: profile.items[targetItemId].attributes.level
                });

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
            LoggerService.log('error', `PromoteItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/TransmogItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { sacrificeItemIds, transmogKeyTemplateId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const transformItemDataPath = path.join(__dirname, '../../content/campaign/TransformItemIDS.json');
            const cardPackDataPath = path.join(__dirname, '../../content/campaign/CardPackData.json');
            
            let transformItemData;
            let cardPackData;
            try {
                const data1 = await fs.readFile(transformItemDataPath, 'utf-8');
                transformItemData = JSON.parse(data1);
                const data2 = await fs.readFile(cardPackDataPath, 'utf-8');
                cardPackData = JSON.parse(data2);
            } catch (error) {
                LoggerService.log('error', 'Failed to load Transform data');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const notifications = [];

            if (sacrificeItemIds && transmogKeyTemplateId) {
                for (const itemId of sacrificeItemIds) {
                    if (!profile.items[itemId]) continue;

                    delete profile.items[itemId];

                    await DatabaseManager.removeItemFromProfile(accountId, profileId, itemId);

                    changes.push(MCPResponseBuilder.createItemRemoved(itemId));
                }

                let itemIds;
                if (transformItemData[transmogKeyTemplateId]) {
                    itemIds = transformItemData[transmogKeyTemplateId];
                } else {
                    itemIds = cardPackData.default;
                }

                const randomNumber = Math.floor(Math.random() * itemIds.length);
                const newItemId = DatabaseManager.generateItemId();
                let item = {
                    templateId: itemIds[randomNumber],
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
                    quantity: 1
                };

                if (itemIds[randomNumber].toLowerCase().startsWith("worker:")) {
                    item.attributes = FunctionsService.makeSurvivorAttributes(itemIds[randomNumber]);
                }

                profile.items[newItemId] = item;

                await DatabaseManager.addItemToProfile(accountId, profileId, newItemId, item);

                notifications.push({
                    type: "transmogResult",
                    primary: true,
                    transmoggedItems: [
                        {
                            itemType: item.templateId,
                            itemGuid: newItemId,
                            itemProfile: profileId,
                            attributes: item.attributes,
                            quantity: 1
                        }
                    ]
                });

                changes.push(MCPResponseBuilder.createItemAdded(newItemId, item));

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
            LoggerService.log('error', `TransmogItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);


router.post("/fortnite/api/game/v2/profile/:accountId/client/CraftWorldItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'theater0';
            const queryRevision = req.query.rvn || -1;
            const { targetSchematicItemId, numTimesToCraft, targetSchematicTier } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const versionInfo = VersionService.getVersionInfo(req);
            let schematicProfileId = 'campaign';
            
            if (versionInfo.season >= 4 || versionInfo.build === 3.5 || versionInfo.build === 3.6) {
                schematicProfileId = 'campaign';
            } else if (versionInfo.season <= 3) {
                schematicProfileId = 'profile0';
            }

            const schematicProfile = await DatabaseManager.getProfile(accountId, schematicProfileId);

            const changes = [];
            const notifications = [];

            if (targetSchematicItemId) {
                if (!schematicProfile.items[targetSchematicItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                let item = JSON.parse(JSON.stringify(schematicProfile.items[targetSchematicItemId]));

                let itemType = 'Weapon:';
                let itemIdType = 'WID_';
                
                const itemCategory = item.templateId.split("_")[1].split("_")[0].toLowerCase();
                if (itemCategory === "wall" || itemCategory === "floor" || itemCategory === "ceiling") {
                    itemType = "Trap:";
                    itemIdType = "TID_";
                }

                if (item.templateId.toLowerCase().startsWith("schematic:sid_pistol_vacuumtube_auto_")) {
                    item.templateId = `Schematic:SID_Pistol_Auto_VacuumTube_${item.templateId.substring(37)}`;
                }

                if (item.templateId.toLowerCase().startsWith("schematic:sid_launcher_grenade_winter_")) {
                    item.templateId = `Schematic:SID_Launcher_WinterGrenade_${item.templateId.substring(38)}`;
                }

                item.templateId = item.templateId.replace(/schematic:/ig, itemType);
                item.templateId = item.templateId.replace(/sid_/ig, itemIdType);
                item.quantity = numTimesToCraft || 1;

                if (targetSchematicTier) {
                    switch (targetSchematicTier.toLowerCase()) {
                        case "i":
                            if (!item.templateId.toLowerCase().includes("t01")) {
                                item.attributes.level = 10;
                            }
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T01";
                            item.templateId = item.templateId.replace(/_crystal_/ig, "_Ore_");
                            break;

                        case "ii":
                            if (!item.templateId.toLowerCase().includes("t02")) {
                                item.attributes.level = 20;
                            }
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T02";
                            item.templateId = item.templateId.replace(/_crystal_/ig, "_Ore_");
                            break;

                        case "iii":
                            if (!item.templateId.toLowerCase().includes("t03")) {
                                item.attributes.level = 30;
                            }
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T03";
                            item.templateId = item.templateId.replace(/_crystal_/ig, "_Ore_");
                            break;

                        case "iv":
                            if (!item.templateId.toLowerCase().includes("t04")) {
                                item.attributes.level = 40;
                            }
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T04";
                            break;

                        case "v":
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T05";
                            break;
                    }
                }

                item.attributes = {
                    clipSizeScale: 0,
                    loadedAmmo: 999,
                    level: item.attributes.level || 1,
                    alterationDefinitions: item.attributes.alterations || [],
                    baseClipSize: 999,
                    durability: 375,
                    itemSource: ""
                };

                const itemId = DatabaseManager.generateItemId();
                profile.items[itemId] = item;

                await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

                notifications.push({
                    type: "craftingResult",
                    primary: true,
                    itemsCrafted: [
                        {
                            itemType: item.templateId,
                            itemGuid: itemId,
                            itemProfile: profileId,
                            attributes: {
                                loadedAmmo: item.attributes.loadedAmmo,
                                level: item.attributes.level,
                                alterationDefinitions: item.attributes.alterationDefinitions,
                                durability: item.attributes.durability
                            },
                            quantity: item.quantity
                        }
                    ]
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
            LoggerService.log('error', `CraftWorldItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/DestroyWorldItems",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'theater0';
            const queryRevision = req.query.rvn || -1;
            const { itemIds } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (itemIds) {
                for (const itemId of itemIds) {
                    if (!profile.items[itemId]) continue;

                    delete profile.items[itemId];

                    await DatabaseManager.removeItemFromProfile(accountId, profileId, itemId);

                    changes.push(MCPResponseBuilder.createItemRemoved(itemId));
                }

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
            LoggerService.log('error', `DestroyWorldItems error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/DisassembleWorldItems",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'theater0';
            const queryRevision = req.query.rvn || -1;
            const { targetItemIdAndQuantityPairs } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemIdAndQuantityPairs) {
                for (const pair of targetItemIdAndQuantityPairs) {
                    const itemId = pair.itemId;
                    const quantity = Number(pair.quantity);

                    if (!profile.items[itemId]) continue;

                    const originalQuantity = Number(profile.items[itemId].quantity);

                    if (quantity >= originalQuantity) {
                        delete profile.items[itemId];

                        await DatabaseManager.removeItemFromProfile(accountId, profileId, itemId);

                        changes.push(MCPResponseBuilder.createItemRemoved(itemId));
                    } else {
                        profile.items[itemId].quantity -= quantity;

                        await DatabaseManager.updateItemInProfile(accountId, profileId, itemId, {
                            quantity: profile.items[itemId].quantity
                        });

                        changes.push(MCPResponseBuilder.createItemQuantityChanged(itemId, profile.items[itemId].quantity));
                    }
                }

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
            LoggerService.log('error', `DisassembleWorldItems error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/StorageTransfer",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const queryRevision = req.query.rvn || -1;
            const { transferOperations, theaterToOutpostItems, outpostToTheaterItems } = req.body;

            const theater0 = await DatabaseManager.getProfile(accountId, 'theater0');
            const outpost0 = await DatabaseManager.getProfile(accountId, 'outpost0');
            
            if (!theater0 || !outpost0) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const multiUpdate = [];

            const handleTransfer = async (itemId, quantity, toStorage) => {
                const sourceProfile = toStorage ? theater0 : outpost0;
                const targetProfile = toStorage ? outpost0 : theater0;
                const sourceProfileId = toStorage ? 'theater0' : 'outpost0';
                const targetProfileId = toStorage ? 'outpost0' : 'theater0';

                const sourceQuantity = sourceProfile.items[itemId] ? Number(sourceProfile.items[itemId].quantity) : 0;
                const targetQuantity = targetProfile.items[itemId] ? Number(targetProfile.items[itemId].quantity) : 0;

                if (sourceProfile.items[itemId] && targetProfile.items[itemId]) {
                    if (sourceQuantity > quantity) {
                        targetProfile.items[itemId].quantity += quantity;
                        sourceProfile.items[itemId].quantity -= quantity;

                        await DatabaseManager.updateItemInProfile(accountId, sourceProfileId, itemId, {
                            quantity: sourceProfile.items[itemId].quantity
                        });
                        await DatabaseManager.updateItemInProfile(accountId, targetProfileId, itemId, {
                            quantity: targetProfile.items[itemId].quantity
                        });

                        if (toStorage) {
                            changes.push(MCPResponseBuilder.createItemQuantityChanged(itemId, sourceProfile.items[itemId].quantity));
                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemQuantityChanged(itemId, targetProfile.items[itemId].quantity));
                        } else {
                            changes.push(MCPResponseBuilder.createItemQuantityChanged(itemId, targetProfile.items[itemId].quantity));
                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemQuantityChanged(itemId, sourceProfile.items[itemId].quantity));
                        }
                    } else {
                        targetProfile.items[itemId].quantity += quantity;
                        delete sourceProfile.items[itemId];

                        await DatabaseManager.removeItemFromProfile(accountId, sourceProfileId, itemId);
                        await DatabaseManager.updateItemInProfile(accountId, targetProfileId, itemId, {
                            quantity: targetProfile.items[itemId].quantity
                        });

                        if (toStorage) {
                            changes.push(MCPResponseBuilder.createItemRemoved(itemId));
                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemQuantityChanged(itemId, targetProfile.items[itemId].quantity));
                        } else {
                            changes.push(MCPResponseBuilder.createItemQuantityChanged(itemId, targetProfile.items[itemId].quantity));
                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(itemId));
                        }
                    }
                } else if (!targetProfile.items[itemId] && sourceProfile.items[itemId]) {
                    const item = JSON.parse(JSON.stringify(sourceProfile.items[itemId]));

                    if (sourceQuantity > quantity) {
                        sourceProfile.items[itemId].quantity -= quantity;
                        item.quantity = quantity;
                        targetProfile.items[itemId] = item;

                        await DatabaseManager.updateItemInProfile(accountId, sourceProfileId, itemId, {
                            quantity: sourceProfile.items[itemId].quantity
                        });
                        await DatabaseManager.addItemToProfile(accountId, targetProfileId, itemId, item);

                        if (toStorage) {
                            changes.push(MCPResponseBuilder.createItemQuantityChanged(itemId, sourceProfile.items[itemId].quantity));
                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));
                        } else {
                            changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemQuantityChanged(itemId, sourceProfile.items[itemId].quantity));
                        }
                    } else {
                        targetProfile.items[itemId] = item;
                        delete sourceProfile.items[itemId];

                        await DatabaseManager.removeItemFromProfile(accountId, sourceProfileId, itemId);
                        await DatabaseManager.addItemToProfile(accountId, targetProfileId, itemId, item);

                        if (toStorage) {
                            changes.push(MCPResponseBuilder.createItemRemoved(itemId));
                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));
                        } else {
                            changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(itemId));
                        }
                    }
                }
            };

            multiUpdate.push({
                profileRevision: outpost0.rvn || 0,
                profileId: 'outpost0',
                profileChangesBaseRevision: outpost0.rvn || 0,
                profileChanges: [],
                profileCommandRevision: outpost0.commandRevision || 0
            });

            if (transferOperations) {
                for (const operation of transferOperations) {
                    await handleTransfer(operation.itemId, Number(operation.quantity), operation.toStorage);
                }
            }

            if (theaterToOutpostItems && outpostToTheaterItems) {
                for (const item of theaterToOutpostItems) {
                    await handleTransfer(item.itemId, Number(item.quantity), true);
                }

                for (const item of outpostToTheaterItems) {
                    await handleTransfer(item.itemId, Number(item.quantity), false);
                }
            }

            theater0.rvn += 1;
            theater0.commandRevision += 1;
            outpost0.rvn += 1;
            outpost0.commandRevision += 1;

            multiUpdate[0].profileRevision = outpost0.rvn;
            multiUpdate[0].profileCommandRevision = outpost0.commandRevision;

            await DatabaseManager.saveProfile(accountId, 'theater0', theater0);
            await DatabaseManager.saveProfile(accountId, 'outpost0', outpost0);

            if (queryRevision != theater0.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, theater0, queryRevision);
            } else {
                res.json({
                    profileRevision: theater0.rvn,
                    profileId: 'theater0',
                    profileChangesBaseRevision: theater0.rvn - 1,
                    profileChanges: changes,
                    profileCommandRevision: theater0.commandRevision,
                    serverTime: new Date().toISOString(),
                    multiUpdate: multiUpdate,
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `StorageTransfer error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

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

router.post("/fortnite/api/game/v2/profile/:accountId/client/AssignHeroToLoadout",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { loadoutId, slotName, heroId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (loadoutId && slotName) {
                if (!profile.items[loadoutId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                const crewMembers = profile.items[loadoutId].attributes.crew_members;
                const heroIdLower = (heroId || "").toLowerCase();

                const clearHeroFromOtherSlots = (targetSlot) => {
                    const slots = ['commanderslot', 'followerslot1', 'followerslot2', 'followerslot3', 'followerslot4', 'followerslot5'];
                    for (const slot of slots) {
                        if (slot !== targetSlot && crewMembers[slot].toLowerCase() === heroIdLower) {
                            crewMembers[slot] = "";
                        }
                    }
                };

                switch (slotName) {
                    case "CommanderSlot":
                        clearHeroFromOtherSlots('commanderslot');
                        crewMembers.commanderslot = heroId || "";
                        break;
                    case "FollowerSlot1":
                        clearHeroFromOtherSlots('followerslot1');
                        crewMembers.followerslot1 = heroId || "";
                        break;
                    case "FollowerSlot2":
                        clearHeroFromOtherSlots('followerslot2');
                        crewMembers.followerslot2 = heroId || "";
                        break;
                    case "FollowerSlot3":
                        clearHeroFromOtherSlots('followerslot3');
                        crewMembers.followerslot3 = heroId || "";
                        break;
                    case "FollowerSlot4":
                        clearHeroFromOtherSlots('followerslot4');
                        crewMembers.followerslot4 = heroId || "";
                        break;
                    case "FollowerSlot5":
                        clearHeroFromOtherSlots('followerslot5');
                        crewMembers.followerslot5 = heroId || "";
                        break;
                }

                await DatabaseManager.updateItemInProfile(accountId, profileId, loadoutId, {
                    'attributes.crew_members': crewMembers
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: loadoutId,
                    attributeName: "crew_members",
                    attributeValue: crewMembers
                });

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
            LoggerService.log('error', `AssignHeroToLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/ClearHeroLoadout",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { loadoutId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (loadoutId) {
                if (!profile.items[loadoutId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                const commanderSlot = profile.items[loadoutId].attributes.crew_members.commanderslot;
                const loadoutName = profile.items[loadoutId].attributes.loadout_name;
                const loadoutIndex = profile.items[loadoutId].attributes.loadout_index;

                profile.items[loadoutId].attributes = {
                    team_perk: "",
                    loadout_name: loadoutName,
                    crew_members: {
                        followerslot5: "",
                        followerslot4: "",
                        followerslot3: "",
                        followerslot2: "",
                        followerslot1: "",
                        commanderslot: commanderSlot
                    },
                    loadout_index: loadoutIndex,
                    gadgets: [
                        {
                            gadget: "",
                            slot_index: 0
                        },
                        {
                            gadget: "",
                            slot_index: 1
                        }
                    ]
                };

                await DatabaseManager.updateItemInProfile(accountId, profileId, loadoutId, {
                    attributes: profile.items[loadoutId].attributes
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: loadoutId,
                    attributeName: "team_perk",
                    attributeValue: ""
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: loadoutId,
                    attributeName: "crew_members",
                    attributeValue: profile.items[loadoutId].attributes.crew_members
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: loadoutId,
                    attributeName: "gadgets",
                    attributeValue: profile.items[loadoutId].attributes.gadgets
                });

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
            LoggerService.log('error', `ClearHeroLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/RecycleItemBatch",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemIds } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const versionInfo = VersionService.getVersionInfo(req);
            const changes = [];
            const multiUpdate = [];
            const notifications = [];

            if (targetItemIds) {
                for (const itemId of targetItemIds) {
                    if (!profile.items[itemId]) continue;

                    if (versionInfo.season > 11 || versionInfo.build === 11.30 || versionInfo.build === 11.31 || 
                        versionInfo.build === 11.40 || versionInfo.build === 11.50) {
                        
                        let collectionBookProfileId = 'collection_book_people0';
                        if (profile.items[itemId].templateId.toLowerCase().startsWith("schematic:")) {
                            collectionBookProfileId = 'collection_book_schematics0';
                        }

                        const collectionBookProfile = await DatabaseManager.getProfile(accountId, collectionBookProfileId);

                        if (multiUpdate.length === 0) {
                            multiUpdate.push({
                                profileRevision: collectionBookProfile.rvn || 0,
                                profileId: collectionBookProfileId,
                                profileChangesBaseRevision: collectionBookProfile.rvn || 0,
                                profileChanges: [],
                                profileCommandRevision: collectionBookProfile.commandRevision || 0
                            });
                        }

                        let itemExists = false;

                        for (const key in collectionBookProfile.items) {
                            const template1 = profile.items[itemId].templateId;
                            const template2 = collectionBookProfile.items[key].templateId;
                            
                            if (template1.substring(0, template1.length - 4).toLowerCase() === 
                                template2.substring(0, template2.length - 4).toLowerCase()) {
                                
                                if (template1.toLowerCase().startsWith("worker:") && template2.toLowerCase().startsWith("worker:")) {
                                    if (profile.items[itemId].attributes.personality && 
                                        collectionBookProfile.items[key].attributes.personality) {
                                        
                                        const personality1 = profile.items[itemId].attributes.personality;
                                        const personality2 = collectionBookProfile.items[key].attributes.personality;

                                        if (personality1.toLowerCase() === personality2.toLowerCase()) {
                                            if (profile.items[itemId].attributes.level > collectionBookProfile.items[key].attributes.level) {
                                                delete collectionBookProfile.items[key];

                                                await DatabaseManager.removeItemFromProfile(accountId, collectionBookProfileId, key);

                                                multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(key));
                                                itemExists = false;
                                            } else {
                                                itemExists = true;
                                            }
                                        }
                                    }
                                } else {
                                    if (profile.items[itemId].attributes.level > collectionBookProfile.items[key].attributes.level) {
                                        delete collectionBookProfile.items[key];

                                        await DatabaseManager.removeItemFromProfile(accountId, collectionBookProfileId, key);

                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(key));
                                        itemExists = false;
                                    } else {
                                        itemExists = true;
                                    }
                                }
                            }
                        }

                        if (!itemExists) {
                            collectionBookProfile.items[itemId] = profile.items[itemId];

                            await DatabaseManager.addItemToProfile(accountId, collectionBookProfileId, itemId, profile.items[itemId]);

                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, collectionBookProfile.items[itemId]));

                            notifications.push({
                                type: "slotItemResult",
                                primary: true,
                                slottedItemId: itemId
                            });
                        }

                        delete profile.items[itemId];

                        await DatabaseManager.removeItemFromProfile(accountId, profileId, itemId);

                        changes.push(MCPResponseBuilder.createItemRemoved(itemId));

                        collectionBookProfile.rvn += 1;
                        collectionBookProfile.commandRevision += 1;

                        multiUpdate[0].profileRevision = collectionBookProfile.rvn;
                        multiUpdate[0].profileCommandRevision = collectionBookProfile.commandRevision;

                        await DatabaseManager.saveProfile(accountId, collectionBookProfileId, collectionBookProfile);
                    } else {
                        delete profile.items[itemId];

                        await DatabaseManager.removeItemFromProfile(accountId, profileId, itemId);

                        changes.push(MCPResponseBuilder.createItemRemoved(itemId));
                    }
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
                    multiUpdate: multiUpdate,
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `RecycleItemBatch error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/ResearchItemFromCollectionBook",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { templateId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (templateId) {
                const itemId = DatabaseManager.generateItemId();
                const item = {
                    templateId: templateId,
                    attributes: {
                        last_state_change_time: new Date().toISOString(),
                        max_level_bonus: 0,
                        level: 1,
                        item_seen: false,
                        xp: 0,
                        sent_new_notification: true,
                        favorite: false
                    },
                    quantity: 1
                };

                profile.items[itemId] = item;

                await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

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
            LoggerService.log('error', `ResearchItemFromCollectionBook error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SlotItemInCollectionBook",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { itemId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.items[itemId]) {
                const err = Errors.MCP.itemNotFound();
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const multiUpdate = [];
            const notifications = [];

            let collectionBookProfileId = 'collection_book_people0';
            if (profile.items[itemId].templateId.toLowerCase().startsWith("schematic:")) {
                collectionBookProfileId = 'collection_book_schematics0';
            }

            const collectionBookProfile = await DatabaseManager.getProfile(accountId, collectionBookProfileId);

            multiUpdate.push({
                profileRevision: collectionBookProfile.rvn || 0,
                profileId: collectionBookProfileId,
                profileChangesBaseRevision: collectionBookProfile.rvn || 0,
                profileChanges: [],
                profileCommandRevision: collectionBookProfile.commandRevision || 0
            });

            for (const key in collectionBookProfile.items) {
                const template1 = profile.items[itemId].templateId;
                const template2 = collectionBookProfile.items[key].templateId;
                
                if (template1.substring(0, template1.length - 4).toLowerCase() === 
                    template2.substring(0, template2.length - 4).toLowerCase()) {
                    
                    if (template1.toLowerCase().startsWith("worker:") && template2.toLowerCase().startsWith("worker:")) {
                        if (profile.items[itemId].attributes.personality && 
                            collectionBookProfile.items[key].attributes.personality) {
                            
                            const personality1 = profile.items[itemId].attributes.personality;
                            const personality2 = collectionBookProfile.items[key].attributes.personality;

                            if (personality1.toLowerCase() === personality2.toLowerCase()) {
                                delete collectionBookProfile.items[key];

                                await DatabaseManager.removeItemFromProfile(accountId, collectionBookProfileId, key);

                                multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(key));
                            }
                        }
                    } else {
                        delete collectionBookProfile.items[key];

                        await DatabaseManager.removeItemFromProfile(accountId, collectionBookProfileId, key);

                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(key));
                    }
                }
            }

            collectionBookProfile.items[itemId] = profile.items[itemId];

            await DatabaseManager.addItemToProfile(accountId, collectionBookProfileId, itemId, profile.items[itemId]);

            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, collectionBookProfile.items[itemId]));

            delete profile.items[itemId];

            await DatabaseManager.removeItemFromProfile(accountId, profileId, itemId);

            changes.push(MCPResponseBuilder.createItemRemoved(itemId));

            notifications.push({
                type: "slotItemResult",
                primary: true,
                slottedItemId: itemId
            });

            profile.rvn += 1;
            profile.commandRevision += 1;
            collectionBookProfile.rvn += 1;
            collectionBookProfile.commandRevision += 1;

            multiUpdate[0].profileRevision = collectionBookProfile.rvn;
            multiUpdate[0].profileCommandRevision = collectionBookProfile.commandRevision;

            await DatabaseManager.saveProfile(accountId, profileId, profile);
            await DatabaseManager.saveProfile(accountId, collectionBookProfileId, collectionBookProfile);

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
            LoggerService.log('error', `SlotItemInCollectionBook error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/UnslotItemFromCollectionBook",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { itemId, templateId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const multiUpdate = [];
            const notifications = [];

            let collectionBookProfileId = 'collection_book_people0';
            if (templateId.toLowerCase().startsWith("schematic:")) {
                collectionBookProfileId = 'collection_book_schematics0';
            }

            const collectionBookProfile = await DatabaseManager.getProfile(accountId, collectionBookProfileId);

            multiUpdate.push({
                profileRevision: collectionBookProfile.rvn || 0,
                profileId: collectionBookProfileId,
                profileChangesBaseRevision: collectionBookProfile.rvn || 0,
                profileChanges: [],
                profileCommandRevision: collectionBookProfile.commandRevision || 0
            });

            if (profile.items[itemId]) {
                const newItemId = DatabaseManager.generateItemId();
                profile.items[newItemId] = collectionBookProfile.items[itemId];

                await DatabaseManager.addItemToProfile(accountId, profileId, newItemId, collectionBookProfile.items[itemId]);

                changes.push(MCPResponseBuilder.createItemAdded(newItemId, profile.items[newItemId]));

                delete collectionBookProfile.items[itemId];

                await DatabaseManager.removeItemFromProfile(accountId, collectionBookProfileId, itemId);

                multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(itemId));
            } else {
                profile.items[itemId] = collectionBookProfile.items[itemId];

                await DatabaseManager.addItemToProfile(accountId, profileId, itemId, collectionBookProfile.items[itemId]);

                changes.push(MCPResponseBuilder.createItemAdded(itemId, profile.items[itemId]));

                delete collectionBookProfile.items[itemId];

                await DatabaseManager.removeItemFromProfile(accountId, collectionBookProfileId, itemId);

                multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(itemId));
            }

            profile.rvn += 1;
            profile.commandRevision += 1;
            collectionBookProfile.rvn += 1;
            collectionBookProfile.commandRevision += 1;

            multiUpdate[0].profileRevision = collectionBookProfile.rvn;
            multiUpdate[0].profileCommandRevision = collectionBookProfile.commandRevision;

            await DatabaseManager.saveProfile(accountId, profileId, profile);
            await DatabaseManager.saveProfile(accountId, collectionBookProfileId, collectionBookProfile);

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
            LoggerService.log('error', `UnslotItemFromCollectionBook error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/ClaimCollectionBookRewards",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { requiredXp } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (requiredXp) {
                profile.stats.attributes.collection_book.maxBookXpLevelAchieved += 1;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.collection_book': profile.stats.attributes.collection_book
                });

                changes.push(MCPResponseBuilder.createStatChange('collection_book', profile.stats.attributes.collection_book));

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
            LoggerService.log('error', `ClaimCollectionBookRewards error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/RespecAlteration",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId, alterationId, alterationSlot } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemId && alterationId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (!profile.items[targetItemId].attributes.alterations) {
                    profile.items[targetItemId].attributes.alterations = ["", "", "", "", "", ""];
                }

                profile.items[targetItemId].attributes.alterations[alterationSlot] = alterationId;

                await DatabaseManager.updateItemInProfile(accountId, profileId, targetItemId, {
                    'attributes.alterations': profile.items[targetItemId].attributes.alterations
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: targetItemId,
                    attributeName: "alterations",
                    attributeValue: profile.items[targetItemId].attributes.alterations
                });

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
            LoggerService.log('error', `RespecAlteration error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/UpgradeAlteration",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId, alterationSlot } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (profile.items[targetItemId].attributes.alterations[alterationSlot].toLowerCase().includes("t04")) {
                    profile.items[targetItemId].attributes.alterations[alterationSlot] = 
                        profile.items[targetItemId].attributes.alterations[alterationSlot].replace(/t04/ig, "T05");
                }

                if (profile.items[targetItemId].attributes.alterations[alterationSlot].toLowerCase().includes("t03")) {
                    profile.items[targetItemId].attributes.alterations[alterationSlot] = 
                        profile.items[targetItemId].attributes.alterations[alterationSlot].replace(/t03/ig, "T04");
                }

                if (profile.items[targetItemId].attributes.alterations[alterationSlot].toLowerCase().includes("t02")) {
                    profile.items[targetItemId].attributes.alterations[alterationSlot] = 
                        profile.items[targetItemId].attributes.alterations[alterationSlot].replace(/t02/ig, "T03");
                }

                if (profile.items[targetItemId].attributes.alterations[alterationSlot].toLowerCase().includes("t01")) {
                    profile.items[targetItemId].attributes.alterations[alterationSlot] = 
                        profile.items[targetItemId].attributes.alterations[alterationSlot].replace(/t01/ig, "T02");
                }

                await DatabaseManager.updateItemInProfile(accountId, profileId, targetItemId, {
                    'attributes.alterations': profile.items[targetItemId].attributes.alterations
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: targetItemId,
                    attributeName: "alterations",
                    attributeValue: profile.items[targetItemId].attributes.alterations
                });

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
            LoggerService.log('error', `UpgradeAlteration error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/RespecResearch",
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

            const changes = [];

            if (profile.stats.attributes.research_levels) {
                profile.stats.attributes.research_levels.technology = 0;
                profile.stats.attributes.research_levels.fortitude = 0;
                profile.stats.attributes.research_levels.offense = 0;
                profile.stats.attributes.research_levels.resistance = 0;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.research_levels': profile.stats.attributes.research_levels
                });

                changes.push(MCPResponseBuilder.createStatChange('research_levels', profile.stats.attributes.research_levels));

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
            LoggerService.log('error', `RespecResearch error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/RespecUpgrades",
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

            const changes = [];

            for (const key in profile.items) {
                if (profile.items[key].templateId.toLowerCase().startsWith("homebasenode:skilltree_")) {
                    profile.items[key].quantity = 0;

                    await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                        quantity: 0
                    });

                    changes.push(MCPResponseBuilder.createItemQuantityChanged(key, 0));
                }
            }

            profile.rvn += 1;
            profile.commandRevision += 1;

            await DatabaseManager.saveProfile(accountId, profileId, profile);

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `RespecUpgrades error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/PurchaseResearchStatUpgrade",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { statId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (profile.stats.attributes.research_levels && statId) {
                profile.stats.attributes.research_levels[statId] += 1;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.research_levels': profile.stats.attributes.research_levels
                });

                changes.push(MCPResponseBuilder.createStatChange('research_levels', profile.stats.attributes.research_levels));

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
            LoggerService.log('error', `PurchaseResearchStatUpgrade error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/PurchaseOrUpgradeHomebaseNode",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { nodeId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            let createHomebaseNode = true;

            if (nodeId) {
                for (const key in profile.items) {
                    if (profile.items[key].templateId.toLowerCase() === nodeId.toLowerCase()) {
                        profile.items[key].quantity += 1;

                        await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                            quantity: profile.items[key].quantity
                        });

                        changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                        createHomebaseNode = false;
                        break;
                    }
                }

                if (createHomebaseNode) {
                    const itemId = DatabaseManager.generateItemId();
                    const item = {
                        templateId: nodeId,
                        attributes: {
                            item_seen: false
                        },
                        quantity: 1
                    };

                    profile.items[itemId] = item;

                    await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                    changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                }

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
            LoggerService.log('error', `PurchaseOrUpgradeHomebaseNode error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/RefreshExpeditions",
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

            
            
            const expeditionDataPath = path.join(__dirname, '../../content/campaign/ExpeditionData.json');
            
            let expeditionData;
            try {
                const data = await fs.readFile(expeditionDataPath, 'utf-8');
                expeditionData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load ExpeditionData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            let expeditionSlots = [];
            const date = new Date().toISOString();

            for (const key in profile.items) {
                const templateId = profile.items[key].templateId.toLowerCase();
                if (expeditionData.questsUnlockingSlots.includes(templateId)) {
                    if (profile.items[key].attributes.quest_state === "Claimed") {
                        expeditionSlots = expeditionSlots.concat(expeditionData.slotsFromQuests[templateId]);
                    }
                }
            }

            for (const key in profile.items) {
                if (profile.items[key].templateId.toLowerCase().startsWith("expedition:")) {
                    const expirationEndTime = new Date(profile.items[key].attributes.expedition_expiration_end_time).toISOString();
                    if (date > expirationEndTime && !profile.items[key].attributes.expedition_start_time) {
                        delete profile.items[key];

                        await DatabaseManager.removeItemFromProfile(accountId, profileId, key);

                        changes.push(MCPResponseBuilder.createItemRemoved(key));
                    } else {
                        const index = expeditionSlots.indexOf(profile.items[key].attributes.expedition_slot_id);
                        if (index !== -1) {
                            expeditionSlots.splice(index, 1);
                        }
                    }
                }
            }

            for (let i = 0; i < expeditionSlots.length; i++) {
                const slot = expeditionSlots[i];

                let expeditionsToChoose = expeditionData.slots[slot];
                if (expeditionsToChoose.rare && Math.random() < 0.05) {
                    expeditionsToChoose = expeditionsToChoose.rare;
                } else {
                    expeditionsToChoose = expeditionsToChoose.normal;
                }

                const randomNumber = Math.floor(Math.random() * expeditionsToChoose.length);
                const itemId = DatabaseManager.generateItemId();
                const templateId = expeditionsToChoose[randomNumber];

                const endDate = new Date(date);
                endDate.setMinutes(endDate.getMinutes() + expeditionData.attributes[templateId].expiration_duration_minutes);
                const endDateISO = endDate.toISOString();

                const item = {
                    templateId: templateId,
                    attributes: {
                        expedition_expiration_end_time: endDateISO,
                        expedition_criteria: [],
                        level: 1,
                        expedition_max_target_power: expeditionData.attributes[templateId].expedition_max_target_power,
                        expedition_min_target_power: expeditionData.attributes[templateId].expedition_min_target_power,
                        expedition_slot_id: slot,
                        expedition_expiration_start_time: date
                    },
                    quantity: 1
                };

                for (let x = 0; x < 3; x++) {
                    if (Math.random() < 0.2) {
                        const criteriaIndex = Math.floor(Math.random() * expeditionData.criteria.length);
                        item.attributes.expedition_criteria.push(expeditionData.criteria[criteriaIndex]);
                    }
                }

                profile.items[itemId] = item;

                await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
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
            LoggerService.log('error', `RefreshExpeditions error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/StartExpedition",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { expeditionId, squadId, itemIds, slotIndices } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const versionInfo = VersionService.getVersionInfo(req);

            
            
            const expeditionDataPath = path.join(__dirname, '../../content/campaign/ExpeditionData.json');
            
            let expeditionData;
            try {
                const data = await fs.readFile(expeditionDataPath, 'utf-8');
                expeditionData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load ExpeditionData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const date = new Date().toISOString();

            if (expeditionId && squadId && itemIds && slotIndices) {
                const expeditionLevel = profile.items[expeditionId].attributes.expedition_max_target_power;
                let heroLevels = expeditionData.heroLevels;
                
                if (versionInfo.build < 13.20) {
                    heroLevels = heroLevels.old;
                } else {
                    heroLevels = heroLevels.new;
                }

                const sortedHeroes = [];
                for (let i = 0; i < itemIds.length; i++) {
                    const heroId = itemIds[i];
                    for (const item in profile.items) {
                        if (heroId === item) {
                            const splitTemplateId = profile.items[item].templateId.split("_");
                            const rarity = splitTemplateId.slice(-2, -1)[0].toLowerCase();
                            const tier = splitTemplateId.slice(-1)[0].toLowerCase();
                            const level = profile.items[item].attributes.level;
                            
                            const hero = {
                                itemGuid: heroId,
                                templateId: profile.items[item].templateId,
                                class: splitTemplateId[1].toLowerCase(),
                                rarity: rarity,
                                tier: tier,
                                level: level,
                                powerLevel: heroLevels[rarity][tier][level],
                                bBoostedByCriteria: false
                            };
                            sortedHeroes.push(hero);
                        }
                    }
                }
                sortedHeroes.sort((a, b) => b.powerLevel - a.powerLevel);

                if (profile.items[expeditionId].attributes.expedition_criteria) {
                    const criteria = profile.items[expeditionId].attributes.expedition_criteria;
                    for (let i = 0; i < criteria.length; i++) {
                        const criterion = criteria[i];

                        for (let x = 0; x < sortedHeroes.length; x++) {
                            let isMatchingHero = true;
                            const requirements = expeditionData.criteriaRequirements[criterion].requirements;
                            
                            if (requirements.class !== sortedHeroes[x].class) {
                                isMatchingHero = false;
                            }
                            if (requirements.rarity) {
                                if (!requirements.rarity.includes(sortedHeroes[x].rarity)) {
                                    isMatchingHero = false;
                                }
                            }

                            if (isMatchingHero && !sortedHeroes[x].bBoostedByCriteria) {
                                sortedHeroes[x].powerLevel = sortedHeroes[x].powerLevel * expeditionData.criteriaRequirements[criterion].ModValue;
                                sortedHeroes[x].bBoostedByCriteria = true;
                                break;
                            }
                        }
                    }
                }

                let totalPowerLevel = 0;
                for (let i = 0; i < sortedHeroes.length; i++) {
                    totalPowerLevel += sortedHeroes[i].powerLevel;
                }
                
                let expeditionSuccessChance = totalPowerLevel / expeditionLevel;
                if (expeditionSuccessChance > 1) {
                    expeditionSuccessChance = 1;
                }

                for (let i = 0; i < itemIds.length; i++) {
                    const heroId = itemIds[i];
                    profile.items[heroId].attributes.squad_id = squadId.toLowerCase();
                    profile.items[heroId].attributes.squad_slot_idx = slotIndices[i];

                    await DatabaseManager.updateItemInProfile(accountId, profileId, heroId, {
                        'attributes.squad_id': squadId.toLowerCase(),
                        'attributes.squad_slot_idx': slotIndices[i]
                    });

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: heroId,
                        attributeName: "squad_id",
                        attributeValue: squadId.toLowerCase()
                    });

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: heroId,
                        attributeName: "squad_slot_idx",
                        attributeValue: slotIndices[i]
                    });
                }

                const endDate = new Date(date);
                endDate.setMinutes(endDate.getMinutes() + expeditionData.attributes[profile.items[expeditionId].templateId].expedition_duration_minutes);
                const endDateISO = endDate.toISOString();

                profile.items[expeditionId].attributes.expedition_squad_id = squadId.toLowerCase();
                profile.items[expeditionId].attributes.expedition_success_chance = expeditionSuccessChance;
                profile.items[expeditionId].attributes.expedition_start_time = date;
                profile.items[expeditionId].attributes.expedition_end_time = endDateISO;

                await DatabaseManager.updateItemInProfile(accountId, profileId, expeditionId, {
                    'attributes.expedition_squad_id': squadId.toLowerCase(),
                    'attributes.expedition_success_chance': expeditionSuccessChance,
                    'attributes.expedition_start_time': date,
                    'attributes.expedition_end_time': endDateISO
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_squad_id",
                    attributeValue: squadId.toLowerCase()
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_success_chance",
                    attributeValue: expeditionSuccessChance
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_start_time",
                    attributeValue: date
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_end_time",
                    attributeValue: endDateISO
                });

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
            LoggerService.log('error', `StartExpedition error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/AbandonExpedition",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { expeditionId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const expeditionDataPath = path.join(__dirname, '../../content/campaign/ExpeditionData.json');
            
            let expeditionData;
            try {
                const data = await fs.readFile(expeditionDataPath, 'utf-8');
                expeditionData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load ExpeditionData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const date = new Date().toISOString();

            if (expeditionId) {
                const squadId = profile.items[expeditionId].attributes.expedition_squad_id;
                
                for (const itemKey in profile.items) {
                    if (profile.items[itemKey].attributes.squad_id) {
                        if (profile.items[itemKey].attributes.squad_id === squadId) {
                            profile.items[itemKey].attributes.squad_id = "";
                            profile.items[itemKey].attributes.squad_slot_idx = -1;

                            await DatabaseManager.updateItemInProfile(accountId, profileId, itemKey, {
                                'attributes.squad_id': "",
                                'attributes.squad_slot_idx': -1
                            });

                            changes.push({
                                changeType: "itemAttrChanged",
                                itemId: itemKey,
                                attributeName: "squad_id",
                                attributeValue: ""
                            });

                            changes.push({
                                changeType: "itemAttrChanged",
                                itemId: itemKey,
                                attributeName: "squad_slot_idx",
                                attributeValue: -1
                            });
                        }
                    }
                }

                delete profile.items[expeditionId].attributes.expedition_squad_id;
                delete profile.items[expeditionId].attributes.expedition_start_time;
                delete profile.items[expeditionId].attributes.expedition_end_time;

                await DatabaseManager.updateItemInProfile(accountId, profileId, expeditionId, {
                    'attributes.expedition_squad_id': null,
                    'attributes.expedition_start_time': null,
                    'attributes.expedition_end_time': null
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_squad_id",
                    attributeValue: ""
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_start_time",
                    attributeValue: null
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_end_time",
                    attributeValue: null
                });

                const expirationEndTime = new Date(profile.items[expeditionId].attributes.expedition_expiration_end_time).toISOString();
                if (date > expirationEndTime) {
                    const slot = profile.items[expeditionId].attributes.expedition_slot_id;
                    delete profile.items[expeditionId];

                    await DatabaseManager.removeItemFromProfile(accountId, profileId, expeditionId);

                    changes.push(MCPResponseBuilder.createItemRemoved(expeditionId));

                    let expeditionsToChoose = expeditionData.slots[slot];
                    if (expeditionsToChoose.rare && Math.random() < 0.05) {
                        expeditionsToChoose = expeditionsToChoose.rare;
                    } else {
                        expeditionsToChoose = expeditionsToChoose.normal;
                    }

                    const randomNumber = Math.floor(Math.random() * expeditionsToChoose.length);
                    const itemId = DatabaseManager.generateItemId();
                    const templateId = expeditionsToChoose[randomNumber];

                    const endDate = new Date(date);
                    endDate.setMinutes(endDate.getMinutes() + expeditionData.attributes[templateId].expiration_duration_minutes);
                    const endDateISO = endDate.toISOString();

                    const item = {
                        templateId: templateId,
                        attributes: {
                            expedition_expiration_end_time: endDateISO,
                            expedition_criteria: [],
                            level: 1,
                            expedition_max_target_power: expeditionData.attributes[templateId].expedition_max_target_power,
                            expedition_min_target_power: expeditionData.attributes[templateId].expedition_min_target_power,
                            expedition_slot_id: slot,
                            expedition_expiration_start_time: date
                        },
                        quantity: 1
                    };

                    for (let x = 0; x < 3; x++) {
                        if (Math.random() < 0.2) {
                            const criteriaIndex = Math.floor(Math.random() * expeditionData.criteria.length);
                            item.attributes.expedition_criteria.push(expeditionData.criteria[criteriaIndex]);
                        }
                    }

                    profile.items[itemId] = item;

                    await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                    changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                }

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
            LoggerService.log('error', `AbandonExpedition error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/CollectExpedition",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { expeditionId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const expeditionDataPath = path.join(__dirname, '../../content/campaign/ExpeditionData.json');
            
            let expeditionData;
            try {
                const data = await fs.readFile(expeditionDataPath, 'utf-8');
                expeditionData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load ExpeditionData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const multiUpdate = [];
            const notifications = [];
            const otherProfiles = [];
            const date = new Date().toISOString();

            if (expeditionId) {
                notifications.push({
                    type: "expeditionResult",
                    primary: true,
                    client_request_id: "",
                    bExpeditionSucceeded: false
                });

                if (Math.random() < profile.items[expeditionId].attributes.expedition_success_chance) {
                    notifications[0].bExpeditionSucceeded = true;
                    notifications[0].expeditionRewards = [];

                    for (let i = 0; i < expeditionData.rewards.length; i++) {
                        const randomNumber = Math.floor(Math.random() * expeditionData.rewards[i].length);
                        const itemId = DatabaseManager.generateItemId();
                        const templateId = expeditionData.rewards[i][randomNumber].templateId;
                        const itemProfile = expeditionData.rewards[i][randomNumber].itemProfile;

                        const minQ = expeditionData.rewards[i][randomNumber].minQuantity;
                        const maxQ = expeditionData.rewards[i][randomNumber].maxQuantity;
                        const quantity = Math.floor(Math.random() * (maxQ - minQ + 1)) + minQ;

                        const item = {
                            templateId: templateId,
                            attributes: {
                                loadedAmmo: 0,
                                inventory_overflow_date: false,
                                level: 0,
                                alterationDefinitions: [],
                                durability: 1,
                                itemSource: ""
                            },
                            quantity: quantity
                        };

                        notifications[0].expeditionRewards.push({
                            itemType: templateId,
                            itemGuid: itemId,
                            itemProfile: itemProfile,
                            quantity: quantity
                        });

                        if (itemProfile === profileId) {
                            profile.items[itemId] = item;

                            await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                            changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                        } else {
                            let k = -1;
                            for (let x = 0; x < multiUpdate.length; x++) {
                                if (multiUpdate[x].profileId === itemProfile) {
                                    k = x;
                                }
                            }

                            if (k === -1) {
                                const otherProfile = await DatabaseManager.getProfile(accountId, itemProfile);
                                otherProfiles.push(otherProfile);
                                k = multiUpdate.length;
                                multiUpdate.push({
                                    profileRevision: otherProfile.rvn || 0,
                                    profileId: otherProfile.profileId,
                                    profileChangesBaseRevision: otherProfile.rvn || 0,
                                    profileChanges: [],
                                    profileCommandRevision: otherProfile.commandRevision || 0
                                });
                            }

                            otherProfiles[k].items[itemId] = item;

                            await DatabaseManager.addItemToProfile(accountId, itemProfile, itemId, item);

                            multiUpdate[k].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));
                        }
                    }
                }

                const squadId = profile.items[expeditionId].attributes.expedition_squad_id;
                for (const itemKey in profile.items) {
                    if (profile.items[itemKey].attributes.squad_id) {
                        if (profile.items[itemKey].attributes.squad_id === squadId) {
                            profile.items[itemKey].attributes.squad_id = "";
                            profile.items[itemKey].attributes.squad_slot_idx = -1;

                            await DatabaseManager.updateItemInProfile(accountId, profileId, itemKey, {
                                'attributes.squad_id': "",
                                'attributes.squad_slot_idx': -1
                            });

                            changes.push({
                                changeType: "itemAttrChanged",
                                itemId: itemKey,
                                attributeName: "squad_id",
                                attributeValue: ""
                            });

                            changes.push({
                                changeType: "itemAttrChanged",
                                itemId: itemKey,
                                attributeName: "squad_slot_idx",
                                attributeValue: -1
                            });
                        }
                    }
                }

                const slot = profile.items[expeditionId].attributes.expedition_slot_id;
                delete profile.items[expeditionId];

                await DatabaseManager.removeItemFromProfile(accountId, profileId, expeditionId);

                changes.push(MCPResponseBuilder.createItemRemoved(expeditionId));

                let expeditionsToChoose = expeditionData.slots[slot];
                if (expeditionsToChoose.rare && Math.random() < 0.05) {
                    expeditionsToChoose = expeditionsToChoose.rare;
                } else {
                    expeditionsToChoose = expeditionsToChoose.normal;
                }

                const randomNumber = Math.floor(Math.random() * expeditionsToChoose.length);
                const newExpeditionId = DatabaseManager.generateItemId();
                const templateId = expeditionsToChoose[randomNumber];

                const endDate = new Date(date);
                endDate.setMinutes(endDate.getMinutes() + expeditionData.attributes[templateId].expiration_duration_minutes);
                const endDateISO = endDate.toISOString();

                const newExpedition = {
                    templateId: templateId,
                    attributes: {
                        expedition_expiration_end_time: endDateISO,
                        expedition_criteria: [],
                        level: 1,
                        expedition_max_target_power: expeditionData.attributes[templateId].expedition_max_target_power,
                        expedition_min_target_power: expeditionData.attributes[templateId].expedition_min_target_power,
                        expedition_slot_id: slot,
                        expedition_expiration_start_time: date
                    },
                    quantity: 1
                };

                for (let x = 0; x < 3; x++) {
                    if (Math.random() < 0.2) {
                        const criteriaIndex = Math.floor(Math.random() * expeditionData.criteria.length);
                        newExpedition.attributes.expedition_criteria.push(expeditionData.criteria[criteriaIndex]);
                    }
                }

                profile.items[newExpeditionId] = newExpedition;

                await DatabaseManager.addItemToProfile(accountId, profileId, newExpeditionId, newExpedition);

                changes.push(MCPResponseBuilder.createItemAdded(newExpeditionId, newExpedition));

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);

                for (let i = 0; i < otherProfiles.length; i++) {
                    otherProfiles[i].rvn += 1;
                    otherProfiles[i].commandRevision += 1;

                    multiUpdate[i].profileRevision = otherProfiles[i].rvn;
                    multiUpdate[i].profileCommandRevision = otherProfiles[i].commandRevision;

                    await DatabaseManager.saveProfile(accountId, otherProfiles[i].profileId, otherProfiles[i]);
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
                    notifications: notifications,
                    profileCommandRevision: profile.commandRevision,
                    serverTime: new Date().toISOString(),
                    multiUpdate: multiUpdate,
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `CollectExpedition error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetActiveHeroLoadout",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { selectedLoadout } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (selectedLoadout) {
                profile.stats.attributes.selected_hero_loadout = selectedLoadout;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.selected_hero_loadout': selectedLoadout
                });

                changes.push(MCPResponseBuilder.createStatChange('selected_hero_loadout', selectedLoadout));

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
            LoggerService.log('error', `SetActiveHeroLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/ActivateConsumable",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            let xpBoostKey = null;

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                profile.items[targetItemId].quantity -= 1;

                await DatabaseManager.updateItemInProfile(accountId, profileId, targetItemId, {
                    quantity: profile.items[targetItemId].quantity
                });

                changes.push(MCPResponseBuilder.createItemQuantityChanged(targetItemId, profile.items[targetItemId].quantity));

                for (const key in profile.items) {
                    if (profile.items[key].templateId === "Token:xpboost") {
                        let randomNumber = Math.floor(Math.random() * 1250000);
                        if (randomNumber < 1000000) {
                            randomNumber += 1000000;
                        }

                        profile.items[key].quantity += randomNumber;

                        await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                            quantity: profile.items[key].quantity
                        });

                        xpBoostKey = key;
                        break;
                    }
                }

                if (xpBoostKey) {
                    changes.push(MCPResponseBuilder.createItemQuantityChanged(xpBoostKey, profile.items[xpBoostKey].quantity));
                }

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
            LoggerService.log('error', `ActivateConsumable error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/UnassignAllSquads",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { squadIds } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (squadIds) {
                for (const squadId of squadIds) {
                    for (const key in profile.items) {
                        if (profile.items[key].attributes.squad_id) {
                            if (profile.items[key].attributes.squad_id.toLowerCase() === squadId.toLowerCase()) {
                                profile.items[key].attributes.squad_id = "";

                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                    'attributes.squad_id': ""
                                });

                                changes.push({
                                    changeType: "itemAttrChanged",
                                    itemId: key,
                                    attributeName: "squad_id",
                                    attributeValue: ""
                                });
                            }
                        }
                    }
                }

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
            LoggerService.log('error', `UnassignAllSquads error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/OpenCardPack",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { cardPackItemId, selectionIdx } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const cardPackDataPath = path.join(__dirname, '../../content/campaign/CardPackData.json');
            
            let cardPackData;
            try {
                const data = await fs.readFile(cardPackDataPath, 'utf-8');
                cardPackData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load CardPackData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const notifications = [];

            if (cardPackItemId) {
                if (!profile.items[cardPackItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                notifications.push({
                    type: "cardPackResult",
                    primary: true,
                    lootGranted: {
                        tierGroupName: profile.items[cardPackItemId].templateId.split(":")[1],
                        items: []
                    },
                    displayLevel: 0
                });

                if (cardPackData.choiceCardPacks.includes(profile.items[cardPackItemId].templateId)) {
                    const chosenItem = profile.items[cardPackItemId].attributes.options[selectionIdx];
                    const item = {
                        templateId: chosenItem.itemType,
                        attributes: chosenItem.attributes,
                        quantity: chosenItem.quantity
                    };
                    const itemId = DatabaseManager.generateItemId();

                    profile.items[itemId] = item;

                    await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                    changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

                    notifications[0].lootGranted.items.push({
                        itemType: item.templateId,
                        itemGuid: itemId,
                        itemProfile: profileId,
                        attributes: item.attributes,
                        quantity: item.quantity
                    });
                } else {
                    for (let i = 0; i < 10; i++) {
                        const itemId = DatabaseManager.generateItemId();
                        let itemIds = cardPackData.default;
                        let randomNumber = Math.floor(Math.random() * itemIds.length);
                        let item = {
                            templateId: itemIds[randomNumber],
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
                            quantity: 1
                        };

                        if (itemIds[randomNumber].toLowerCase().startsWith("worker:")) {
                            item.attributes = FunctionsService.makeSurvivorAttributes(itemIds[randomNumber]);
                        }

                        if (Math.random() < 0.1) {
                            const cpTemplateId = cardPackData.choiceCardPacks[Math.floor(Math.random() * cardPackData.choiceCardPacks.length)];
                            const cpItem = {
                                templateId: cpTemplateId,
                                attributes: {
                                    level: 1,
                                    pack_source: "Store",
                                    options: []
                                },
                                quantity: 1
                            };
                            itemIds = cardPackData[cpTemplateId.toLowerCase()] || cardPackData.default;

                            for (let x = 0; x < 2; x++) {
                                randomNumber = Math.floor(Math.random() * itemIds.length);
                                let choiceItem = {
                                    itemType: itemIds[randomNumber],
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
                                    quantity: 1
                                };

                                if (itemIds[randomNumber].toLowerCase().startsWith("worker:")) {
                                    choiceItem.attributes = FunctionsService.makeSurvivorAttributes(itemIds[randomNumber]);
                                }

                                itemIds.splice(itemIds.indexOf(itemIds[randomNumber]), 1);
                                cpItem.attributes.options.push(choiceItem);
                            }
                            item = cpItem;
                        }

                        profile.items[itemId] = item;

                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                        changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

                        notifications[0].lootGranted.items.push({
                            itemType: item.templateId || itemIds[randomNumber],
                            itemGuid: itemId,
                            itemProfile: profileId,
                            attributes: item.attributes,
                            quantity: 1
                        });
                    }
                }

                if (profile.items[cardPackItemId].quantity <= 1) {
                    delete profile.items[cardPackItemId];

                    await DatabaseManager.removeItemFromProfile(accountId, profileId, cardPackItemId);

                    changes.push(MCPResponseBuilder.createItemRemoved(cardPackItemId));
                } else {
                    profile.items[cardPackItemId].quantity -= 1;

                    await DatabaseManager.updateItemInProfile(accountId, profileId, cardPackItemId, {
                        quantity: profile.items[cardPackItemId].quantity
                    });

                    changes.push(MCPResponseBuilder.createItemQuantityChanged(cardPackItemId, profile.items[cardPackItemId].quantity));
                }

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);
            }

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
        } catch (error) {
            LoggerService.log('error', `OpenCardPack error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/PopulatePrerolledOffers",
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

            
            
            const cardPackDataPath = path.join(__dirname, '../../content/campaign/CardPackData.json');
            
            let cardPackData;
            try {
                const data = await fs.readFile(cardPackDataPath, 'utf-8');
                cardPackData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load CardPackData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const date = new Date().toISOString();

            for (const key in profile.items) {
                if (profile.items[key].templateId.toLowerCase() === "prerolldata:preroll_basic") {
                    if (date > profile.items[key].attributes.expiration) {
                        profile.items[key].attributes.items = [];

                        for (let i = 0; i < 10; i++) {
                            let itemIds = cardPackData.default;
                            let randomNumber = Math.floor(Math.random() * itemIds.length);
                            let item = {
                                itemType: itemIds[randomNumber],
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
                                quantity: 1
                            };

                            if (itemIds[randomNumber].toLowerCase().startsWith("worker:")) {
                                item.attributes = FunctionsService.makeSurvivorAttributes(itemIds[randomNumber]);
                            }

                            if (Math.random() < 0.1) {
                                const cpTemplateId = cardPackData.choiceCardPacks[Math.floor(Math.random() * cardPackData.choiceCardPacks.length)];
                                const cpItem = {
                                    itemType: cpTemplateId,
                                    attributes: {
                                        level: 1,
                                        pack_source: "Store",
                                        options: []
                                    },
                                    quantity: 1
                                };
                                itemIds = cardPackData[cpTemplateId.toLowerCase()] || cardPackData.default;

                                for (let x = 0; x < 2; x++) {
                                    randomNumber = Math.floor(Math.random() * itemIds.length);
                                    let choiceItem = {
                                        itemType: itemIds[randomNumber],
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
                                        quantity: 1
                                    };

                                    if (itemIds[randomNumber].toLowerCase().startsWith("worker:")) {
                                        choiceItem.attributes = FunctionsService.makeSurvivorAttributes(itemIds[randomNumber]);
                                    }

                                    itemIds.splice(itemIds.indexOf(itemIds[randomNumber]), 1);
                                    cpItem.attributes.options.push(choiceItem);
                                }
                                item = cpItem;
                            }

                            profile.items[key].attributes.items.push(item);
                        }

                        await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                            'attributes.items': profile.items[key].attributes.items
                        });

                        changes.push({
                            changeType: "itemAttrChanged",
                            itemId: key,
                            attributeName: "items",
                            attributeValue: profile.items[key].attributes.items
                        });

                        profile.items[key].attributes.expiration = new Date().toISOString().split("T")[0] + "T23:59:59.999Z";

                        await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                            'attributes.expiration': profile.items[key].attributes.expiration
                        });

                        changes.push({
                            changeType: "itemAttrChanged",
                            itemId: key,
                            attributeName: "expiration",
                            attributeValue: profile.items[key].attributes.expiration
                        });

                        profile.rvn += 1;
                        profile.commandRevision += 1;

                        await DatabaseManager.saveProfile(accountId, profileId, profile);
                    }
                }
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `PopulatePrerolledOffers error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/PurchaseCatalogEntry",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            await EXPService.loadConfig();

            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { offerId, purchaseQuantity, currencySubType } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            let campaign = await DatabaseManager.getProfile(accountId, 'campaign');
            let athena = await DatabaseManager.getProfile(accountId, 'athena');
            let commonCore = await DatabaseManager.getProfile(accountId, 'common_core');

            const changes = [];
            const multiUpdate = [];
            const notifications = [];
            let purchasedLlama = false;
            let athenaModified = false;
            let itemExists = false;

            const catalog = ShopService.getItemShop();
            const versionInfo = VersionService.getVersionInfo(req);
            
            

            if (offerId && profile.profileId === 'profile0' && !purchasedLlama) {
                for (const storefront of catalog.storefronts) {
                    if (storefront.name.toLowerCase().startsWith("cardpack")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                let quantity = 0;

                                for (const grant of entry.itemGrants) {
                                    quantity = purchaseQuantity || 1;

                                    const item = {
                                        templateId: grant.templateId || grant,
                                        attributes: {
                                            is_loot_tier_overridden: false,
                                            max_level_bonus: 0,
                                            level: 1391,
                                            pack_source: "Schedule",
                                            item_seen: false,
                                            xp: 0,
                                            favorite: false,
                                            override_loot_tier: 0
                                        },
                                        quantity: 1
                                    };

                                    for (let i = 0; i < quantity; i++) {
                                        const itemId = DatabaseManager.generateItemId();
                                        profile.items[itemId] = item;

                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                                    }
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                
                                                profile.items[key].quantity -= (entry.prices[0].finalPrice) * quantity;

                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                    quantity: profile.items[key].quantity
                                                });

                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                                profile.rvn += 1;
                                                profile.commandRevision += 1;

                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (storefront.name.startsWith("BRSeason")) {
                        if (!Number.isNaN(Number(storefront.name.split("BRSeason")[1]))) {
                            const offer = storefront.catalogEntries.find(i => i.offerId === offerId);

                            if (offer) {
                                if (multiUpdate.length === 0) {
                                    multiUpdate.push({
                                        profileRevision: athena.rvn || 0,
                                        profileId: "athena",
                                        profileChangesBaseRevision: athena.rvn || 0,
                                        profileChanges: [],
                                        profileCommandRevision: athena.commandRevision || 0
                                    });
                                }

                                const seasonName = storefront.name.split("BR")[1];
                                
                                let battlePass;
                                try {
                                    const battlePassPath = path.join(__dirname, `../../content/athena/battlepasses/${seasonName}.json`);
                                    const data = await fs.readFile(battlePassPath, 'utf-8');
                                    battlePass = JSON.parse(data);
                                } catch (error) {
                                    LoggerService.log('error', `Battle pass not found for ${seasonName}`);
                                    continue;
                                }

                                if (battlePass) {
                                    let seasonData = await DatabaseManager.getAthenaProfile(accountId, 'SeasonData');
                                    if (!seasonData) seasonData = {};

                                    if (!seasonData[seasonName]) {
                                        seasonData[seasonName] = {
                                            battlePassPurchased: false,
                                            battlePassTier: 1,
                                            battlePassXPBoost: 0,
                                            battlePassXPFriendBoost: 0
                                        };
                                    }

                                    if (battlePass.battlePassOfferId === offer.offerId || battlePass.battleBundleOfferId === offer.offerId) {
                                        const lootList = [];
                                        let endingTier = seasonData[seasonName].battlePassTier;
                                        seasonData[seasonName].battlePassPurchased = true;

                                        if (battlePass.battleBundleOfferId === offer.offerId) {
                                            seasonData[seasonName].battlePassTier += 25;
                                            if (seasonData[seasonName].battlePassTier > 100) {
                                                seasonData[seasonName].battlePassTier = 100;
                                            }
                                            endingTier = seasonData[seasonName].battlePassTier;
                                        }

                                        if (!athena.stats) athena.stats = {};
                                        if (!athena.stats.attributes) athena.stats.attributes = {};
                                        
                                        athena.stats.attributes.book_purchased = seasonData[seasonName].battlePassPurchased;
                                        athena.stats.attributes.book_level = seasonData[seasonName].battlePassTier;
                                        athena.stats.attributes.season_match_boost = seasonData[seasonName].battlePassXPBoost;
                                        athena.stats.attributes.season_friend_match_boost = seasonData[seasonName].battlePassXPFriendBoost;

                                        for (let i = 0; i < endingTier; i++) {
                                            const freeTier = battlePass.freeRewards[i] || {};
                                            const paidTier = battlePass.paidRewards[i] || {};

                                            for (const item in freeTier) {
                                                if (item.toLowerCase() === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += freeTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_match_boost",
                                                        value: seasonData[seasonName].battlePassXPBoost
                                                    });
                                                }

                                                if (item.toLowerCase() === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += freeTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_friend_match_boost",
                                                        value: seasonData[seasonName].battlePassXPFriendBoost
                                                    });
                                                }

                                                if (item.toLowerCase().startsWith("currency:mtx")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                                
                                                                profile.items[key].quantity += freeTier[item];

                                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                                    quantity: profile.items[key].quantity
                                                                });

                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if (item.toLowerCase().startsWith("homebasebanner")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase() === item.toLowerCase()) {
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
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const bannerItem = {
                                                            templateId: item,
                                                            attributes: { item_seen: false },
                                                            quantity: 1
                                                        };

                                                        profile.items[itemId] = bannerItem;

                                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, bannerItem);

                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, bannerItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                if (item.toLowerCase().startsWith("athena")) {
                                                    for (const key in athena.items) {
                                                        if (athena.items[key].templateId.toLowerCase() === item.toLowerCase()) {
                                                            athena.items[key].attributes.item_seen = false;
                                                            itemExists = true;

                                                            await DatabaseManager.updateItemInProfile(accountId, 'athena', key, {
                                                                'attributes.item_seen': false
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "item_seen",
                                                                attributeValue: false
                                                            });
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const athenaItem = {
                                                            templateId: item,
                                                            attributes: {
                                                                max_level_bonus: 0,
                                                                level: 1,
                                                                item_seen: false,
                                                                xp: 0,
                                                                variants: [],
                                                                favorite: false
                                                            },
                                                            quantity: freeTier[item]
                                                        };

                                                        athena.items[itemId] = athenaItem;

                                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);

                                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                lootList.push({
                                                    itemType: item,
                                                    itemGuid: item,
                                                    quantity: freeTier[item]
                                                });
                                            }

                                            for (const item in paidTier) {
                                                if (item.toLowerCase() === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += paidTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_match_boost",
                                                        value: seasonData[seasonName].battlePassXPBoost
                                                    });
                                                }

                                                if (item.toLowerCase() === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += paidTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_friend_match_boost",
                                                        value: seasonData[seasonName].battlePassXPFriendBoost
                                                    });
                                                }

                                                if (item.toLowerCase().startsWith("currency:mtx")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                                
                                                                profile.items[key].quantity += paidTier[item];

                                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                                    quantity: profile.items[key].quantity
                                                                });

                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if (item.toLowerCase().startsWith("homebasebanner")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase() === item.toLowerCase()) {
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
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const bannerItem = {
                                                            templateId: item,
                                                            attributes: { item_seen: false },
                                                            quantity: 1
                                                        };

                                                        profile.items[itemId] = bannerItem;

                                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, bannerItem);

                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, bannerItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                if (item.toLowerCase().startsWith("athena")) {
                                                    for (const key in athena.items) {
                                                        if (athena.items[key].templateId.toLowerCase() === item.toLowerCase()) {
                                                            athena.items[key].attributes.item_seen = false;
                                                            itemExists = true;

                                                            await DatabaseManager.updateItemInProfile(accountId, 'athena', key, {
                                                                'attributes.item_seen': false
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "item_seen",
                                                                attributeValue: false
                                                            });
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const athenaItem = {
                                                            templateId: item,
                                                            attributes: {
                                                                max_level_bonus: 0,
                                                                level: 1,
                                                                item_seen: false,
                                                                xp: 0,
                                                                variants: [],
                                                                favorite: false
                                                            },
                                                            quantity: paidTier[item]
                                                        };

                                                        athena.items[itemId] = athenaItem;

                                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);

                                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                lootList.push({
                                                    itemType: item,
                                                    itemGuid: item,
                                                    quantity: paidTier[item]
                                                });
                                            }
                                        }

                                        const giftBoxId = DatabaseManager.generateItemId();
                                        const seasonNumber = Number(seasonName.split("Season")[1]);
                                        const giftBox = {
                                            templateId: seasonNumber <= 4 ? "GiftBox:gb_battlepass" : "GiftBox:gb_battlepasspurchased",
                                            attributes: {
                                                max_level_bonus: 0,
                                                fromAccountId: "",
                                                lootList: lootList
                                            },
                                            quantity: 1
                                        };

                                        if (seasonNumber > 2) {
                                            profile.items[giftBoxId] = giftBox;

                                            await DatabaseManager.addItemToProfile(accountId, profileId, giftBoxId, giftBox);

                                            changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));
                                        }

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_purchased",
                                            value: seasonData[seasonName].battlePassPurchased
                                        });

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_level",
                                            value: seasonData[seasonName].battlePassTier
                                        });

                                        if (offer.prices && offer.prices[0] && offer.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                            let vbucksDeducted = false;
                                            for (const key in profile.items) {
                                                if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                    if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                        profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                        
                                                        const price = offer.prices[0].finalPrice;
                                                        const oldQuantity = profile.items[key].quantity;
                                                        profile.items[key].quantity -= price;
                                                        
                                                        LoggerService.log('debug', `[PURCHASE] V-Bucks deducted - old: ${oldQuantity}, new: ${profile.items[key].quantity}, price: ${price}`);
                                    
                                                        await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                            quantity: profile.items[key].quantity
                                                        });
                                    
                                                        changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));
                                    
                                                        profile.rvn += 1;
                                                        profile.commandRevision += 1;
                                    
                                                        vbucksDeducted = true;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                        
                                        athenaModified = true;
                                    }

                                    if (battlePass.tierOfferId === offer.offerId) {
                                        const lootList = [];
                                        const startingTier = seasonData[seasonName].battlePassTier;
                                        seasonData[seasonName].battlePassTier += purchaseQuantity || 1;
                                        const endingTier = seasonData[seasonName].battlePassTier;

                                        if (!athena.stats) athena.stats = {};
                                        if (!athena.stats.attributes) athena.stats.attributes = {};
                                        athena.stats.attributes.book_level = seasonData[seasonName].battlePassTier;

                                        const xpResult = EXPService.addXpForTiersPurchased(athena, purchaseQuantity || 1);
                                        athena = xpResult.profile;
                                    
                                        const xpChanges = EXPService.createStatModifiedChanges(xpResult.beforeChanges, xpResult.afterChanges);
                                        multiUpdate[0].profileChanges.push(...xpChanges);

                                        for (let i = startingTier; i < endingTier; i++) {
                                            const freeTier = battlePass.freeRewards[i] || {};
                                            const paidTier = battlePass.paidRewards[i] || {};

                                            for (const item in freeTier) {
                                                if (item.toLowerCase() === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += freeTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_match_boost",
                                                        value: seasonData[seasonName].battlePassXPBoost
                                                    });
                                                }

                                                if (item.toLowerCase() === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += freeTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_friend_match_boost",
                                                        value: seasonData[seasonName].battlePassXPFriendBoost
                                                    });
                                                }

                                                if (item.toLowerCase().startsWith("currency:mtx")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                                
                                                                profile.items[key].quantity += freeTier[item];

                                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                                    quantity: profile.items[key].quantity
                                                                });

                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if (item.toLowerCase().startsWith("homebasebanner")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase() === item.toLowerCase()) {
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
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const bannerItem = {
                                                            templateId: item,
                                                            attributes: { item_seen: false },
                                                            quantity: 1
                                                        };

                                                        profile.items[itemId] = bannerItem;

                                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, bannerItem);

                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, bannerItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                if (item.toLowerCase().startsWith("athena")) {
                                                    for (const key in athena.items) {
                                                        if (athena.items[key].templateId.toLowerCase() === item.toLowerCase()) {
                                                            athena.items[key].attributes.item_seen = false;
                                                            itemExists = true;

                                                            await DatabaseManager.updateItemInProfile(accountId, 'athena', key, {
                                                                'attributes.item_seen': false
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "item_seen",
                                                                attributeValue: false
                                                            });
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const athenaItem = {
                                                            templateId: item,
                                                            attributes: {
                                                                max_level_bonus: 0,
                                                                level: 1,
                                                                item_seen: false,
                                                                xp: 0,
                                                                variants: [],
                                                                favorite: false
                                                            },
                                                            quantity: freeTier[item]
                                                        };

                                                        athena.items[itemId] = athenaItem;

                                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);

                                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                lootList.push({
                                                    itemType: item,
                                                    itemGuid: item,
                                                    quantity: freeTier[item]
                                                });
                                            }

                                            for (const item in paidTier) {
                                                if (item.toLowerCase() === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += paidTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_match_boost",
                                                        value: seasonData[seasonName].battlePassXPBoost
                                                    });
                                                }

                                                if (item.toLowerCase() === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += paidTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_friend_match_boost",
                                                        value: seasonData[seasonName].battlePassXPFriendBoost
                                                    });
                                                }

                                                if (item.toLowerCase().startsWith("currency:mtx")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                                
                                                                profile.items[key].quantity += paidTier[item];

                                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                                    quantity: profile.items[key].quantity
                                                                });

                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if (item.toLowerCase().startsWith("homebasebanner")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase() === item.toLowerCase()) {
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
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const bannerItem = {
                                                            templateId: item,
                                                            attributes: { item_seen: false },
                                                            quantity: 1
                                                        };

                                                        profile.items[itemId] = bannerItem;

                                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, bannerItem);

                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, bannerItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                if (item.toLowerCase().startsWith("athena")) {
                                                    for (const key in athena.items) {
                                                        if (athena.items[key].templateId.toLowerCase() === item.toLowerCase()) {
                                                            athena.items[key].attributes.item_seen = false;
                                                            itemExists = true;

                                                            await DatabaseManager.updateItemInProfile(accountId, 'athena', key, {
                                                                'attributes.item_seen': false
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "item_seen",
                                                                attributeValue: false
                                                            });
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const athenaItem = {
                                                            templateId: item,
                                                            attributes: {
                                                                max_level_bonus: 0,
                                                                level: 1,
                                                                item_seen: false,
                                                                xp: 0,
                                                                variants: [],
                                                                favorite: false
                                                            },
                                                            quantity: paidTier[item]
                                                        };

                                                        athena.items[itemId] = athenaItem;

                                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);

                                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                lootList.push({
                                                    itemType: item,
                                                    itemGuid: item,
                                                    quantity: paidTier[item]
                                                });
                                            }
                                        }

                                        const giftBoxId = DatabaseManager.generateItemId();
                                        const giftBox = {
                                            templateId: "GiftBox:gb_battlepass",
                                            attributes: {
                                                max_level_bonus: 0,
                                                fromAccountId: "",
                                                lootList: lootList
                                            },
                                            quantity: 1
                                        };

                                        const seasonNumber = Number(seasonName.split("Season")[1]);
                                        if (seasonNumber > 2) {
                                            profile.items[giftBoxId] = giftBox;

                                            await DatabaseManager.addItemToProfile(accountId, profileId, giftBoxId, giftBox);

                                            changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));
                                        }

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_level",
                                            value: seasonData[seasonName].battlePassTier
                                        });

                                        if (offer.prices && offer.prices[0] && offer.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                            let vbucksDeducted = false;
                                            for (const key in profile.items) {
                                                if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                    if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                        profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                        
                                                        const price = offer.prices[0].finalPrice;
                                                        const oldQuantity = profile.items[key].quantity;
                                                        profile.items[key].quantity -= price;
                                                        
                                                        LoggerService.log('debug', `[PURCHASE] V-Bucks deducted - old: ${oldQuantity}, new: ${profile.items[key].quantity}, price: ${price}`);
                                    
                                                        await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                            quantity: profile.items[key].quantity
                                                        });
                                    
                                                        changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));
                                    
                                                        profile.rvn += 1;
                                                        profile.commandRevision += 1;
                                    
                                                        vbucksDeducted = true;
                                                        break;
                                                    }
                                                }
                                            }
                                        }

                                        athenaModified = true;
                                    }

                                    await DatabaseManager.saveAthenaProfile(accountId, 'seasonData', seasonData);
                                }
                            }
                        }
                    }

                    if (storefront.name.startsWith("BR") && !storefront.name.startsWith("BRSeason")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                for (const grant of entry.itemGrants) {
                                    const itemId = DatabaseManager.generateItemId();
                                    const templateId = grant.templateId || grant;

                                    for (const key in athena.items) {
                                        if (templateId.toLowerCase() === athena.items[key].templateId.toLowerCase()) {
                                            itemExists = true;
                                            break;
                                        }
                                    }

                                    if (!itemExists) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: athena.rvn || 0,
                                                profileId: "athena",
                                                profileChangesBaseRevision: athena.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: athena.commandRevision || 0
                                            });
                                        }

                                        if (notifications.length === 0) {
                                            notifications.push({
                                                type: "CatalogPurchase",
                                                primary: true,
                                                lootResult: {
                                                    items: []
                                                }
                                            });
                                        }

                                        const item = {
                                            templateId: templateId,
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

                                        athena.items[itemId] = item;

                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, item);

                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                        notifications[0].lootResult.items.push({
                                            itemType: templateId,
                                            itemGuid: itemId,
                                            itemProfile: "athena",
                                            quantity: grant.quantity || 1
                                        });

                                        athenaModified = true;
                                    }

                                    itemExists = false;
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                
                                                profile.items[key].quantity -= (entry.prices[0].finalPrice) * (purchaseQuantity || 1);

                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                    quantity: profile.items[key].quantity
                                                });

                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                                profile.rvn += 1;
                                                profile.commandRevision += 1;

                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (storefront.name.startsWith("STW")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                for (const grant of entry.itemGrants) {
                                    const itemId = DatabaseManager.generateItemId();
                                    const templateId = grant.templateId || grant;

                                    if (notifications.length === 0) {
                                        notifications.push({
                                            type: "CatalogPurchase",
                                            primary: true,
                                            lootResult: {
                                                items: []
                                            }
                                        });
                                    }

                                    let item = {
                                        templateId: templateId,
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
                                        quantity: (purchaseQuantity || 1) * (grant.quantity || 1)
                                    };

                                    if (templateId.toLowerCase().startsWith("worker:")) {
                                        item.attributes = FunctionsService.makeSurvivorAttributes(templateId);
                                    }

                                    profile.items[itemId] = item;

                                    await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                                    changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                    notifications[0].lootResult.items.push({
                                        itemType: templateId,
                                        itemGuid: itemId,
                                        itemProfile: "profile0",
                                        quantity: (purchaseQuantity || 1) * (grant.quantity || 1)
                                    });
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "gameitem") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase() === entry.prices[0].currencySubType.toLowerCase()) {
                                            profile.items[key].quantity -= (entry.prices[0].finalPrice) * (purchaseQuantity || 1);

                                            await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                quantity: profile.items[key].quantity
                                            });

                                            changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                            break;
                                        }
                                    }
                                }

                                profile.rvn += 1;
                                profile.commandRevision += 1;
                            }
                        }
                    }
                }

                purchasedLlama = true;

                if (athenaModified) {
                    athena.rvn += 1;
                    athena.commandRevision += 1;

                    if (multiUpdate[0]) {
                        multiUpdate[0].profileRevision = athena.rvn;
                        multiUpdate[0].profileCommandRevision = athena.commandRevision;
                    }

                    await DatabaseManager.saveProfile(accountId, 'athena', athena);
                    await DatabaseManager.saveProfile(accountId, profileId, profile);
                } else {
                    await DatabaseManager.saveProfile(accountId, profileId, profile);
                }
            }

            if (offerId && profile.profileId === "common_core" && !purchasedLlama) {
                for (const storefront of catalog.storefronts) {
                    if (storefront.name.toLowerCase().startsWith("cardpack")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                let quantity = 0;

                                for (const grant of entry.itemGrants) {
                                    if (versionInfo.season <= 4 && !purchasedLlama) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: campaign.rvn || 0,
                                                profileId: "campaign",
                                                profileChangesBaseRevision: campaign.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: campaign.commandRevision || 0
                                            });
                                        }

                                        quantity = purchaseQuantity || 1;

                                        const item = {
                                            templateId: grant.templateId || grant,
                                            attributes: {
                                                is_loot_tier_overridden: false,
                                                max_level_bonus: 0,
                                                level: 1391,
                                                pack_source: "Schedule",
                                                item_seen: false,
                                                xp: 0,
                                                favorite: false,
                                                override_loot_tier: 0
                                            },
                                            quantity: 1
                                        };

                                        for (let i = 0; i < quantity; i++) {
                                            const itemId = DatabaseManager.generateItemId();

                                            campaign.items[itemId] = item;

                                            await DatabaseManager.addItemToProfile(accountId, 'campaign', itemId, item);

                                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));
                                        }

                                        purchasedLlama = true;
                                    }

                                    if (versionInfo.build >= 5 && versionInfo.build <= 7.20 && !purchasedLlama) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: campaign.rvn || 0,
                                                profileId: "campaign",
                                                profileChangesBaseRevision: campaign.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: campaign.commandRevision || 0
                                            });
                                        }

                                        quantity = purchaseQuantity || 1;

                                        const item = {
                                            templateId: grant.templateId || grant,
                                            attributes: {
                                                is_loot_tier_overridden: false,
                                                max_level_bonus: 0,
                                                level: 1391,
                                                pack_source: "Schedule",
                                                item_seen: false,
                                                xp: 0,
                                                favorite: false,
                                                override_loot_tier: 0
                                            },
                                            quantity: 1
                                        };

                                        for (let i = 0; i < quantity; i++) {
                                            const itemId = DatabaseManager.generateItemId();

                                            campaign.items[itemId] = item;

                                            await DatabaseManager.addItemToProfile(accountId, 'campaign', itemId, item);

                                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));
                                        }

                                        notifications.push({
                                            type: "cardPackResult",
                                            primary: true,
                                            lootGranted: {
                                                tierGroupName: "",
                                                items: []
                                            },
                                            displayLevel: 0
                                        });

                                        purchasedLlama = true;
                                    }

                                    if (versionInfo.season > 6 && !purchasedLlama) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: campaign.rvn || 0,
                                                profileId: "campaign",
                                                profileChangesBaseRevision: campaign.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: campaign.commandRevision || 0
                                            });
                                        }

                                        quantity = purchaseQuantity || 1;
                                        const llamaItemIds = [];

                                        const item = {
                                            templateId: grant.templateId || grant,
                                            attributes: {
                                                is_loot_tier_overridden: false,
                                                max_level_bonus: 0,
                                                level: 1391,
                                                pack_source: "Schedule",
                                                item_seen: false,
                                                xp: 0,
                                                favorite: false,
                                                override_loot_tier: 0
                                            },
                                            quantity: 1
                                        };

                                        for (let i = 0; i < quantity; i++) {
                                            const itemId = DatabaseManager.generateItemId();

                                            campaign.items[itemId] = item;

                                            await DatabaseManager.addItemToProfile(accountId, 'campaign', itemId, item);

                                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                            llamaItemIds.push(itemId);
                                        }

                                        notifications.push({
                                            type: "CatalogPurchase",
                                            primary: true,
                                            lootResult: {
                                                items: []
                                            }
                                        });

                                        if (currencySubType && currencySubType.toLowerCase() !== "accountresource:voucher_basicpack") {
                                            let cardPackData;
                                            try {
                                                const cardPackDataPath = path.join(__dirname, '../../content/campaign/CardPackData.json');
                                                const data = await fs.readFile(cardPackDataPath, 'utf-8');
                                                cardPackData = JSON.parse(data);
                                            } catch (error) {
                                                LoggerService.log('error', 'Failed to load CardPackData');
                                                cardPackData = { default: [] };
                                            }

                                            for (let x = 0; x < quantity; x++) {
                                                for (const key in campaign.items) {
                                                    if (campaign.items[key].templateId.toLowerCase() === "prerolldata:preroll_basic") {
                                                        if (campaign.items[key].attributes.offerId === offerId) {
                                                            for (const prerollItem of campaign.items[key].attributes.items || []) {
                                                                const id = DatabaseManager.generateItemId();
                                                                const newItem = {
                                                                    templateId: prerollItem.itemType,
                                                                    attributes: prerollItem.attributes,
                                                                    quantity: prerollItem.quantity
                                                                };

                                                                campaign.items[id] = newItem;

                                                                await DatabaseManager.addItemToProfile(accountId, 'campaign', id, newItem);

                                                                multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(id, newItem));

                                                                notifications[0].lootResult.items.push({
                                                                    itemType: prerollItem.itemType,
                                                                    itemGuid: id,
                                                                    itemProfile: "campaign",
                                                                    attributes: newItem.attributes,
                                                                    quantity: 1
                                                                });
                                                            }

                                                            campaign.items[key].attributes.items = [];

                                                            for (let i = 0; i < 10; i++) {
                                                                const itemIds = cardPackData.default || [];
                                                                const randomNumber = Math.floor(Math.random() * itemIds.length);
                                                                let randomItem = {
                                                                    itemType: itemIds[randomNumber],
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
                                                                    quantity: 1
                                                                };

                                                                if (itemIds[randomNumber].toLowerCase().startsWith("worker:")) {
                                                                    randomItem.attributes = FunctionsService.makeSurvivorAttributes(itemIds[randomNumber]);
                                                                }

                                                                if (Math.random() < 0.1) {
                                                                    const cpTemplateId = cardPackData.choiceCardPacks[Math.floor(Math.random() * cardPackData.choiceCardPacks.length)];
                                                                    const cpItem = {
                                                                        itemType: cpTemplateId,
                                                                        attributes: {
                                                                            level: 1,
                                                                            pack_source: "Store",
                                                                            options: []
                                                                        },
                                                                        quantity: 1
                                                                    };
                                                                    const cpItemIds = cardPackData[cpTemplateId.toLowerCase()] || cardPackData.default;

                                                                    for (let x = 0; x < 2; x++) {
                                                                        const randomIndex = Math.floor(Math.random() * cpItemIds.length);
                                                                        let choiceItem = {
                                                                            itemType: cpItemIds[randomIndex],
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
                                                                            quantity: 1
                                                                        };

                                                                        if (cpItemIds[randomIndex].toLowerCase().startsWith("worker:")) {
                                                                            choiceItem.attributes = FunctionsService.makeSurvivorAttributes(cpItemIds[randomIndex]);
                                                                        }

                                                                        cpItemIds.splice(cpItemIds.indexOf(cpItemIds[randomIndex]), 1);
                                                                        cpItem.attributes.options.push(choiceItem);
                                                                    }

                                                                    randomItem = cpItem;
                                                                }

                                                                campaign.items[key].attributes.items.push(randomItem);
                                                            }

                                                            await DatabaseManager.updateItemInProfile(accountId, 'campaign', key, {
                                                                'attributes.items': campaign.items[key].attributes.items
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "items",
                                                                attributeValue: campaign.items[key].attributes.items
                                                            });
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        try {
                                            if (currencySubType && currencySubType.toLowerCase() !== "accountresource:voucher_basicpack") {
                                                for (const id of llamaItemIds) {
                                                    delete campaign.items[id];

                                                    await DatabaseManager.removeItemFromProfile(accountId, 'campaign', id);

                                                    multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(id));
                                                }
                                            }
                                        } catch (err) {
                                            LoggerService.log('error', 'Error removing llama items:', { error: err.message });
                                        }

                                        purchasedLlama = true;
                                    }
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                
                                                profile.items[key].quantity -= (entry.prices[0].finalPrice) * quantity;

                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                    quantity: profile.items[key].quantity
                                                });

                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                                profile.rvn += 1;
                                                profile.commandRevision += 1;

                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (storefront.name.startsWith("BRSeason")) {
                        if (!Number.isNaN(Number(storefront.name.split("BRSeason")[1]))) {
                            const offer = storefront.catalogEntries.find(i => i.offerId === offerId);

                            if (offer) {
                                if (multiUpdate.length === 0) {
                                    multiUpdate.push({
                                        profileRevision: athena.rvn || 0,
                                        profileId: "athena",
                                        profileChangesBaseRevision: athena.rvn || 0,
                                        profileChanges: [],
                                        profileCommandRevision: athena.commandRevision || 0
                                    });
                                }

                                const seasonName = storefront.name.split("BR")[1];

                                let battlePass;
                                try {
                                    const battlePassPath = path.join(__dirname, `../../content/athena/battlepasses/${seasonName}.json`);
                                    const data = await fs.readFile(battlePassPath, 'utf-8');
                                    battlePass = JSON.parse(data);
                                } catch (error) {
                                    LoggerService.log('error', `Battle pass not found for ${seasonName}`);
                                    continue;
                                }

                                if (battlePass) {
                                    let seasonData = await DatabaseManager.getAthenaProfile(accountId, 'SeasonData');
                                    if (!seasonData) seasonData = {};

                                    if (!seasonData[seasonName]) {
                                        seasonData[seasonName] = {
                                            battlePassPurchased: false,
                                            battlePassTier: 1,
                                            battlePassXPBoost: 0,
                                            battlePassXPFriendBoost: 0
                                        };
                                    }

                                    if (battlePass.battlePassOfferId === offer.offerId || battlePass.battleBundleOfferId === offer.offerId) {
                                        const lootList = [];
                                        let endingTier = seasonData[seasonName].battlePassTier;
                                        seasonData[seasonName].battlePassPurchased = true;

                                        if (battlePass.battleBundleOfferId === offer.offerId) {
                                            seasonData[seasonName].battlePassTier += 25;
                                            if (seasonData[seasonName].battlePassTier > 100) {
                                                seasonData[seasonName].battlePassTier = 100;
                                            }
                                            endingTier = seasonData[seasonName].battlePassTier;
                                        }

                                        if (!athena.stats) athena.stats = {};
                                        if (!athena.stats.attributes) athena.stats.attributes = {};
                                        
                                        athena.stats.attributes.book_purchased = seasonData[seasonName].battlePassPurchased;
                                        athena.stats.attributes.book_level = seasonData[seasonName].battlePassTier;
                                        athena.stats.attributes.season_match_boost = seasonData[seasonName].battlePassXPBoost;
                                        athena.stats.attributes.season_friend_match_boost = seasonData[seasonName].battlePassXPFriendBoost;

                                        for (let i = 0; i < endingTier; i++) {
                                            const freeTier = battlePass.freeRewards[i] || {};
                                            const paidTier = battlePass.paidRewards[i] || {};

                                            for (const item in freeTier) {
                                                if (item.toLowerCase() === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += freeTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_match_boost",
                                                        value: seasonData[seasonName].battlePassXPBoost
                                                    });
                                                }

                                                if (item.toLowerCase() === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += freeTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_friend_match_boost",
                                                        value: seasonData[seasonName].battlePassXPFriendBoost
                                                    });
                                                }

                                                if (item.toLowerCase().startsWith("currency:mtx")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                                
                                                                profile.items[key].quantity += freeTier[item];

                                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                                    quantity: profile.items[key].quantity
                                                                });

                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if (item.toLowerCase().startsWith("homebasebanner")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase() === item.toLowerCase()) {
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
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const bannerItem = {
                                                            templateId: item,
                                                            attributes: { item_seen: false },
                                                            quantity: 1
                                                        };

                                                        profile.items[itemId] = bannerItem;

                                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, bannerItem);

                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, bannerItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                if (item.toLowerCase().startsWith("athena")) {
                                                    for (const key in athena.items) {
                                                        if (athena.items[key].templateId.toLowerCase() === item.toLowerCase()) {
                                                            athena.items[key].attributes.item_seen = false;
                                                            itemExists = true;

                                                            await DatabaseManager.updateItemInProfile(accountId, 'athena', key, {
                                                                'attributes.item_seen': false
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "item_seen",
                                                                attributeValue: false
                                                            });
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const athenaItem = {
                                                            templateId: item,
                                                            attributes: {
                                                                max_level_bonus: 0,
                                                                level: 1,
                                                                item_seen: false,
                                                                xp: 0,
                                                                variants: [],
                                                                favorite: false
                                                            },
                                                            quantity: freeTier[item]
                                                        };

                                                        athena.items[itemId] = athenaItem;

                                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);

                                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                lootList.push({
                                                    itemType: item,
                                                    itemGuid: item,
                                                    quantity: freeTier[item]
                                                });
                                            }

                                            for (const item in paidTier) {
                                                if (item.toLowerCase() === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += paidTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_match_boost",
                                                        value: seasonData[seasonName].battlePassXPBoost
                                                    });
                                                }

                                                if (item.toLowerCase() === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += paidTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_friend_match_boost",
                                                        value: seasonData[seasonName].battlePassXPFriendBoost
                                                    });
                                                }

                                                if (item.toLowerCase().startsWith("currency:mtx")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                                
                                                                profile.items[key].quantity += paidTier[item];

                                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                                    quantity: profile.items[key].quantity
                                                                });

                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if (item.toLowerCase().startsWith("homebasebanner")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase() === item.toLowerCase()) {
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
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const bannerItem = {
                                                            templateId: item,
                                                            attributes: { item_seen: false },
                                                            quantity: 1
                                                        };

                                                        profile.items[itemId] = bannerItem;

                                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, bannerItem);

                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, bannerItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                if (item.toLowerCase().startsWith("athena")) {
                                                    for (const key in athena.items) {
                                                        if (athena.items[key].templateId.toLowerCase() === item.toLowerCase()) {
                                                            athena.items[key].attributes.item_seen = false;
                                                            itemExists = true;

                                                            await DatabaseManager.updateItemInProfile(accountId, 'athena', key, {
                                                                'attributes.item_seen': false
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "item_seen",
                                                                attributeValue: false
                                                            });
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const athenaItem = {
                                                            templateId: item,
                                                            attributes: {
                                                                max_level_bonus: 0,
                                                                level: 1,
                                                                item_seen: false,
                                                                xp: 0,
                                                                variants: [],
                                                                favorite: false
                                                            },
                                                            quantity: paidTier[item]
                                                        };

                                                        athena.items[itemId] = athenaItem;

                                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);

                                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                lootList.push({
                                                    itemType: item,
                                                    itemGuid: item,
                                                    quantity: paidTier[item]
                                                });
                                            }
                                        }

                                        const giftBoxId = DatabaseManager.generateItemId();
                                        const seasonNumber = Number(seasonName.split("Season")[1]);
                                        const giftBox = {
                                            templateId: seasonNumber <= 4 ? "GiftBox:gb_battlepass" : "GiftBox:gb_battlepasspurchased",
                                            attributes: {
                                                max_level_bonus: 0,
                                                fromAccountId: "",
                                                lootList: lootList
                                            },
                                            quantity: 1
                                        };

                                        if (seasonNumber > 2) {
                                            profile.items[giftBoxId] = giftBox;

                                            await DatabaseManager.addItemToProfile(accountId, profileId, giftBoxId, giftBox);

                                            changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));
                                        }

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_purchased",
                                            value: seasonData[seasonName].battlePassPurchased
                                        });

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_level",
                                            value: seasonData[seasonName].battlePassTier
                                        });

                                        if (offer.prices && offer.prices[0] && offer.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                            let vbucksDeducted = false;
                                            for (const key in profile.items) {
                                                if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                    if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                        profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                        
                                                        const price = offer.prices[0].finalPrice;
                                                        const oldQuantity = profile.items[key].quantity;
                                                        profile.items[key].quantity -= price;
                                                        
                                                        LoggerService.log('debug', `[PURCHASE] V-Bucks deducted - old: ${oldQuantity}, new: ${profile.items[key].quantity}, price: ${price}`);
                                    
                                                        await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                            quantity: profile.items[key].quantity
                                                        });
                                    
                                                        changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));
                                    
                                                        profile.rvn += 1;
                                                        profile.commandRevision += 1;
                                    
                                                        vbucksDeducted = true;
                                                        break;
                                                    }
                                                }
                                            }
                                        }

                                        athenaModified = true;
                                    }

                                    if (battlePass.tierOfferId === offer.offerId) {
                                        const lootList = [];
                                        const startingTier = seasonData[seasonName].battlePassTier;
                                        seasonData[seasonName].battlePassTier += purchaseQuantity || 1;
                                        const endingTier = seasonData[seasonName].battlePassTier;

                                        if (!athena.stats) athena.stats = {};
                                        if (!athena.stats.attributes) athena.stats.attributes = {};
                                        athena.stats.attributes.book_level = seasonData[seasonName].battlePassTier;

                                        const xpResult = EXPService.addXpForTiersPurchased(athena, purchaseQuantity || 1);
                                        athena = xpResult.profile;
                                    
                                        const xpChanges = EXPService.createStatModifiedChanges(xpResult.beforeChanges, xpResult.afterChanges);
                                        multiUpdate[0].profileChanges.push(...xpChanges);

                                        for (let i = startingTier; i < endingTier; i++) {
                                            const freeTier = battlePass.freeRewards[i] || {};
                                            const paidTier = battlePass.paidRewards[i] || {};

                                            for (const item in freeTier) {
                                                if (item.toLowerCase() === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += freeTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_match_boost",
                                                        value: seasonData[seasonName].battlePassXPBoost
                                                    });
                                                }

                                                if (item.toLowerCase() === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += freeTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_friend_match_boost",
                                                        value: seasonData[seasonName].battlePassXPFriendBoost
                                                    });
                                                }

                                                if (item.toLowerCase().startsWith("currency:mtx")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                                
                                                                profile.items[key].quantity += freeTier[item];

                                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                                    quantity: profile.items[key].quantity
                                                                });

                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if (item.toLowerCase().startsWith("homebasebanner")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase() === item.toLowerCase()) {
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
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const bannerItem = {
                                                            templateId: item,
                                                            attributes: { item_seen: false },
                                                            quantity: 1
                                                        };

                                                        profile.items[itemId] = bannerItem;

                                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, bannerItem);

                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, bannerItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                if (item.toLowerCase().startsWith("athena")) {
                                                    for (const key in athena.items) {
                                                        if (athena.items[key].templateId.toLowerCase() === item.toLowerCase()) {
                                                            athena.items[key].attributes.item_seen = false;
                                                            itemExists = true;

                                                            await DatabaseManager.updateItemInProfile(accountId, 'athena', key, {
                                                                'attributes.item_seen': false
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "item_seen",
                                                                attributeValue: false
                                                            });
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const athenaItem = {
                                                            templateId: item,
                                                            attributes: {
                                                                max_level_bonus: 0,
                                                                level: 1,
                                                                item_seen: false,
                                                                xp: 0,
                                                                variants: [],
                                                                favorite: false
                                                            },
                                                            quantity: freeTier[item]
                                                        };

                                                        athena.items[itemId] = athenaItem;

                                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);

                                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                lootList.push({
                                                    itemType: item,
                                                    itemGuid: item,
                                                    quantity: freeTier[item]
                                                });
                                            }

                                            for (const item in paidTier) {
                                                if (item.toLowerCase() === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += paidTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_match_boost",
                                                        value: seasonData[seasonName].battlePassXPBoost
                                                    });
                                                }

                                                if (item.toLowerCase() === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += paidTier[item];

                                                    multiUpdate[0].profileChanges.push({
                                                        changeType: "statModified",
                                                        name: "season_friend_match_boost",
                                                        value: seasonData[seasonName].battlePassXPFriendBoost
                                                    });
                                                }

                                                if (item.toLowerCase().startsWith("currency:mtx")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                                
                                                                profile.items[key].quantity += paidTier[item];

                                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                                    quantity: profile.items[key].quantity
                                                                });

                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if (item.toLowerCase().startsWith("homebasebanner")) {
                                                    for (const key in profile.items) {
                                                        if (profile.items[key].templateId.toLowerCase() === item.toLowerCase()) {
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
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const bannerItem = {
                                                            templateId: item,
                                                            attributes: { item_seen: false },
                                                            quantity: 1
                                                        };

                                                        profile.items[itemId] = bannerItem;

                                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, bannerItem);

                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, bannerItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                if (item.toLowerCase().startsWith("athena")) {
                                                    for (const key in athena.items) {
                                                        if (athena.items[key].templateId.toLowerCase() === item.toLowerCase()) {
                                                            athena.items[key].attributes.item_seen = false;
                                                            itemExists = true;

                                                            await DatabaseManager.updateItemInProfile(accountId, 'athena', key, {
                                                                'attributes.item_seen': false
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "item_seen",
                                                                attributeValue: false
                                                            });
                                                        }
                                                    }

                                                    if (!itemExists) {
                                                        const itemId = DatabaseManager.generateItemId();
                                                        const athenaItem = {
                                                            templateId: item,
                                                            attributes: {
                                                                max_level_bonus: 0,
                                                                level: 1,
                                                                item_seen: false,
                                                                xp: 0,
                                                                variants: [],
                                                                favorite: false
                                                            },
                                                            quantity: paidTier[item]
                                                        };

                                                        athena.items[itemId] = athenaItem;

                                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);

                                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    }

                                                    itemExists = false;
                                                }

                                                lootList.push({
                                                    itemType: item,
                                                    itemGuid: item,
                                                    quantity: paidTier[item]
                                                });
                                            }
                                        }

                                        const giftBoxId = DatabaseManager.generateItemId();
                                        const giftBox = {
                                            templateId: "GiftBox:gb_battlepass",
                                            attributes: {
                                                max_level_bonus: 0,
                                                fromAccountId: "",
                                                lootList: lootList
                                            },
                                            quantity: 1
                                        };

                                        const seasonNumber = Number(seasonName.split("Season")[1]);
                                        if (seasonNumber > 2) {
                                            profile.items[giftBoxId] = giftBox;

                                            await DatabaseManager.addItemToProfile(accountId, profileId, giftBoxId, giftBox);

                                            changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));
                                        }

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_level",
                                            value: seasonData[seasonName].battlePassTier
                                        });

                                        if (offer.prices && offer.prices[0] && offer.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                            let vbucksDeducted = false;
                                            for (const key in profile.items) {
                                                if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                    if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                        profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                        
                                                        const price = offer.prices[0].finalPrice;
                                                        const oldQuantity = profile.items[key].quantity;
                                                        profile.items[key].quantity -= price;
                                                        
                                                        LoggerService.log('debug', `[PURCHASE] V-Bucks deducted - old: ${oldQuantity}, new: ${profile.items[key].quantity}, price: ${price}`);
                                    
                                                        await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                            quantity: profile.items[key].quantity
                                                        });
                                    
                                                        changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));
                                    
                                                        profile.rvn += 1;
                                                        profile.commandRevision += 1;
                                    
                                                        vbucksDeducted = true;
                                                        break;
                                                    }
                                                }
                                            }
                                        }

                                        athenaModified = true;
                                    }

                                    await DatabaseManager.saveAthenaProfile(accountId, 'seasonData', seasonData);
                                }
                            }
                        }
                    }

                    if (storefront.name.startsWith("BR") && !storefront.name.startsWith("BRSeason")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                for (const grant of entry.itemGrants) {
                                    const itemId = DatabaseManager.generateItemId();
                                    const templateId = grant.templateId || grant;

                                    for (const key in athena.items) {
                                        if (templateId.toLowerCase() === athena.items[key].templateId.toLowerCase()) {
                                            itemExists = true;
                                            break;
                                        }
                                    }

                                    if (!itemExists) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: athena.rvn || 0,
                                                profileId: "athena",
                                                profileChangesBaseRevision: athena.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: athena.commandRevision || 0
                                            });
                                        }

                                        if (notifications.length === 0) {
                                            notifications.push({
                                                type: "CatalogPurchase",
                                                primary: true,
                                                lootResult: {
                                                    items: []
                                                }
                                            });
                                        }

                                        const item = {
                                            templateId: templateId,
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

                                        athena.items[itemId] = item;

                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, item);

                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                        notifications[0].lootResult.items.push({
                                            itemType: templateId,
                                            itemGuid: itemId,
                                            itemProfile: "athena",
                                            quantity: grant.quantity || 1
                                        });

                                        athenaModified = true;
                                    }

                                    itemExists = false;
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                                
                                                profile.items[key].quantity -= (entry.prices[0].finalPrice) * (purchaseQuantity || 1);

                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                    quantity: profile.items[key].quantity
                                                });

                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                                break;
                                            }
                                        }
                                    }
                                }

                                if (entry.itemGrants.length !== 0) {
                                    const purchaseId = DatabaseManager.generateItemId();
                                    
                                    if (!profile.stats.attributes.mtx_purchase_history) {
                                        profile.stats.attributes.mtx_purchase_history = { purchases: [] };
                                    }

                                    profile.stats.attributes.mtx_purchase_history.purchases.push({
                                        purchaseId: purchaseId,
                                        offerId: `v2:/${purchaseId}`,
                                        purchaseDate: new Date().toISOString(),
                                        freeRefundEligible: false,
                                        fulfillments: [],
                                        lootResult: notifications[0]?.lootResult?.items || [],
                                        totalMtxPaid: entry.prices[0].finalPrice,
                                        metadata: {},
                                        gameContext: ""
                                    });

                                    await DatabaseManager.updateProfileStats(accountId, profileId, {
                                        'attributes.mtx_purchase_history': profile.stats.attributes.mtx_purchase_history
                                    });

                                    changes.push({
                                        changeType: "statModified",
                                        name: "mtx_purchase_history",
                                        value: profile.stats.attributes.mtx_purchase_history
                                    });
                                }

                                profile.rvn += 1;
                                profile.commandRevision += 1;
                            }
                        }
                    }

                    if (storefront.name.startsWith("STW")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                if (multiUpdate.length === 0) {
                                    multiUpdate.push({
                                        profileRevision: campaign.rvn || 0,
                                        profileId: "campaign",
                                        profileChangesBaseRevision: campaign.rvn || 0,
                                        profileChanges: [],
                                        profileCommandRevision: campaign.commandRevision || 0
                                    });
                                }

                                for (const grant of entry.itemGrants) {
                                    const itemId = DatabaseManager.generateItemId();
                                    const templateId = grant.templateId || grant;

                                    if (notifications.length === 0) {
                                        notifications.push({
                                            type: "CatalogPurchase",
                                            primary: true,
                                            lootResult: {
                                                items: []
                                            }
                                        });
                                    }

                                    let item = {
                                        templateId: templateId,
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
                                        quantity: (purchaseQuantity || 1) * (grant.quantity || 1)
                                    };

                                    if (templateId.toLowerCase().startsWith("worker:")) {
                                        item.attributes = FunctionsService.makeSurvivorAttributes(templateId);
                                    }

                                    campaign.items[itemId] = item;

                                    await DatabaseManager.addItemToProfile(accountId, 'campaign', itemId, item);

                                    multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                    notifications[0].lootResult.items.push({
                                        itemType: templateId,
                                        itemGuid: itemId,
                                        itemProfile: "campaign",
                                        quantity: (purchaseQuantity || 1) * (grant.quantity || 1)
                                    });
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "gameitem") {
                                    for (const key in campaign.items) {
                                        if (campaign.items[key].templateId.toLowerCase() === entry.prices[0].currencySubType.toLowerCase()) {
                                            campaign.items[key].quantity -= (entry.prices[0].finalPrice) * (purchaseQuantity || 1);

                                            await DatabaseManager.updateItemInProfile(accountId, 'campaign', key, {
                                                quantity: campaign.items[key].quantity
                                            });

                                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemQuantityChanged(key, campaign.items[key].quantity));

                                            break;
                                        }
                                    }
                                }

                                profile.rvn += 1;
                                profile.commandRevision += 1;
                            }
                        }
                    }
                }

                if (athenaModified) {
                    athena.rvn += 1;
                    athena.commandRevision += 1;

                    if (multiUpdate[0]) {
                        multiUpdate[0].profileRevision = athena.rvn;
                        multiUpdate[0].profileCommandRevision = athena.commandRevision;
                    }

                    await DatabaseManager.saveProfile(accountId, 'athena', athena);
                    await DatabaseManager.saveProfile(accountId, profileId, profile);
                } else {
                    campaign.rvn += 1;
                    campaign.commandRevision += 1;

                    if (multiUpdate[0]) {
                        multiUpdate[0].profileRevision = campaign.rvn;
                        multiUpdate[0].profileCommandRevision = campaign.commandRevision;
                    }

                    await DatabaseManager.saveProfile(accountId, 'campaign', campaign);
                    await DatabaseManager.saveProfile(accountId, profileId, profile);
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
                    notifications: notifications,
                    profileCommandRevision: profile.commandRevision,
                    serverTime: new Date().toISOString(),
                    multiUpdate: multiUpdate,
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `PurchaseCatalogEntry error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetSeasonPassAutoClaim",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { seasonIds, bEnabled } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (seasonIds && bEnabled !== undefined) {
                if (!profile.stats.attributes.auto_spend_season_currency_ids) {
                    profile.stats.attributes.auto_spend_season_currency_ids = [];
                }

                for (const seasonId of seasonIds) {
                    if (bEnabled === true) {
                        if (!profile.stats.attributes.auto_spend_season_currency_ids.includes(seasonId)) {
                            profile.stats.attributes.auto_spend_season_currency_ids.push(seasonId);
                        }
                    } else {
                        const index = profile.stats.attributes.auto_spend_season_currency_ids.indexOf(seasonId);
                        if (index !== -1) {
                            profile.stats.attributes.auto_spend_season_currency_ids.splice(index, 1);
                        }
                    }
                }

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.auto_spend_season_currency_ids': profile.stats.attributes.auto_spend_season_currency_ids
                });

                changes.push(MCPResponseBuilder.createStatChange(
                    'auto_spend_season_currency_ids',
                    profile.stats.attributes.auto_spend_season_currency_ids
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
            LoggerService.log('error', `SetSeasonPassAutoClaim error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetItemArchivedStatusBatch",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { itemIds, archived } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (itemIds) {
                for (const itemId of itemIds) {
                    if (!profile.items[itemId]) {
                        continue;
                    }

                    profile.items[itemId].attributes.archived = archived || false;

                    await DatabaseManager.updateItemInProfile(accountId, profileId, itemId, {
                        'attributes.archived': archived || false
                    });

                    changes.push({
                        changeType: 'itemAttrChanged',
                        itemId: itemId,
                        attributeName: 'archived',
                        attributeValue: profile.items[itemId].attributes.archived
                    });
                }

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
            LoggerService.log('error', `SetItemArchivedStatusBatch error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetItemFavoriteStatusBatch",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { itemIds, itemFavStatus } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (itemIds) {
                for (let i = 0; i < itemIds.length; i++) {
                    const itemId = itemIds[i];
                    
                    if (!profile.items[itemId]) {
                        continue;
                    }

                    profile.items[itemId].attributes.favorite = itemFavStatus[i] || false;

                    await DatabaseManager.updateItemInProfile(accountId, profileId, itemId, {
                        'attributes.favorite': itemFavStatus[i] || false
                    });

                    changes.push({
                        changeType: 'itemAttrChanged',
                        itemId: itemId,
                        attributeName: 'favorite',
                        attributeValue: profile.items[itemId].attributes.favorite
                    });
                }

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
            LoggerService.log('error', `SetItemFavoriteStatusBatch error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetItemFavoriteStatus",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId, bFavorite } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                profile.items[targetItemId].attributes.favorite = bFavorite || false;

                await DatabaseManager.updateItemInProfile(accountId, profileId, targetItemId, {
                    'attributes.favorite': bFavorite || false
                });

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: targetItemId,
                    attributeName: 'favorite',
                    attributeValue: profile.items[targetItemId].attributes.favorite
                });

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
            LoggerService.log('error', `SetItemFavoriteStatus error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/MarkItemSeen",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { itemIds } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (itemIds) {
                for (const itemId of itemIds) {
                    if (!profile.items[itemId]) {
                        continue;
                    }

                    profile.items[itemId].attributes.item_seen = true;

                    await DatabaseManager.updateItemInProfile(accountId, profileId, itemId, {
                        'attributes.item_seen': true
                    });

                    changes.push({
                        changeType: 'itemAttrChanged',
                        itemId: itemId,
                        attributeName: 'item_seen',
                        attributeValue: true
                    });
                }

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
            LoggerService.log('error', `MarkItemSeen error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/EquipBattleRoyaleCustomization",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const queryRevision = req.query.rvn || -1;
            const { slotName, itemToSlot, indexWithinSlot, variantUpdates } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.stats.attributes.favorite_dance) {
                profile.stats.attributes.favorite_dance = ["","","","","",""];
            }
            if (!profile.stats.attributes.favorite_itemwraps) {
                profile.stats.attributes.favorite_itemwraps = ["","","","","","",""];
            }

            const changes = [];
            let variantChanged = false;

            try {
                const returnVariantsAsString = JSON.stringify(variantUpdates || []);

                if (returnVariantsAsString.includes("active") && itemToSlot && profile.items[itemToSlot]) {
                    if (!profile.items[itemToSlot].attributes.variants) {
                        profile.items[itemToSlot].attributes.variants = [];
                    }

                    if (profile.items[itemToSlot].attributes.variants.length === 0) {
                        profile.items[itemToSlot].attributes.variants = variantUpdates || [];
                    } else {
                        for (let i = 0; i < profile.items[itemToSlot].attributes.variants.length; i++) {
                            try {
                                if (variantUpdates[i] && profile.items[itemToSlot].attributes.variants[i].channel.toLowerCase() === variantUpdates[i].channel.toLowerCase()) {
                                    profile.items[itemToSlot].attributes.variants[i].active = variantUpdates[i].active || "";
                                }
                            } catch (err) {}
                        }
                    }

                    await DatabaseManager.updateItemInProfile(accountId, 'athena', itemToSlot, {
                        'attributes.variants': profile.items[itemToSlot].attributes.variants
                    });

                    variantChanged = true;
                }
            } catch (err) {}

            if (slotName) {
                let category = `favorite_${slotName.toLowerCase()}`;

                switch (slotName) {
                    case "Character":
                    case "Backpack":
                    case "Pickaxe":
                    case "Glider":
                    case "SkyDiveContrail":
                    case "MusicPack":
                    case "LoadingScreen":
                        profile.stats.attributes[category] = itemToSlot || "";
                        break;

                    case "Dance":
                        const danceIndex = indexWithinSlot || 0;
                        if (Math.sign(danceIndex) === 1 || Math.sign(danceIndex) === 0) {
                            profile.stats.attributes.favorite_dance[danceIndex] = itemToSlot || "";
                        }
                        break;

                    case "ItemWrap":
                        const wrapIndex = indexWithinSlot || 0;
                        const sign = Math.sign(wrapIndex);

                        if (sign === 0 || sign === 1) {
                            profile.stats.attributes.favorite_itemwraps[wrapIndex] = itemToSlot || "";
                        } else if (sign === -1) {
                            for (let i = 0; i < 7; i++) {
                                profile.stats.attributes.favorite_itemwraps[i] = itemToSlot || "";
                            }
                        }
                        break;
                }

                if (category === "favorite_itemwrap") {
                    category += "s";
                }

                await DatabaseManager.updateProfileStats(accountId, 'athena', {
                    [`attributes.${category}`]: profile.stats.attributes[category]
                });

                changes.push(MCPResponseBuilder.createStatChange(category, profile.stats.attributes[category]));

                if (variantChanged && itemToSlot) {
                    changes.push({
                        changeType: 'itemAttrChanged',
                        itemId: itemToSlot,
                        attributeName: 'variants',
                        attributeValue: profile.items[itemToSlot].attributes.variants
                    });
                }

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `EquipBattleRoyaleCustomization error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetBattleRoyaleBanner",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const queryRevision = req.query.rvn || -1;
            const { homebaseBannerIconId, homebaseBannerColorId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (homebaseBannerIconId && homebaseBannerColorId) {
                profile.stats.attributes.banner_icon = homebaseBannerIconId;
                profile.stats.attributes.banner_color = homebaseBannerColorId;

                await DatabaseManager.updateProfileStats(accountId, 'athena', {
                    'attributes.banner_icon': homebaseBannerIconId,
                    'attributes.banner_color': homebaseBannerColorId
                });

                changes.push(MCPResponseBuilder.createStatChange('banner_icon', profile.stats.attributes.banner_icon));
                changes.push(MCPResponseBuilder.createStatChange('banner_color', profile.stats.attributes.banner_color));

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `SetBattleRoyaleBanner error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetCosmeticLockerBanner",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { bannerIconTemplateName, bannerColorTemplateName, lockerItem } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (bannerIconTemplateName && bannerColorTemplateName && lockerItem) {
                if (!profile.items[lockerItem]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                profile.items[lockerItem].attributes.banner_icon_template = bannerIconTemplateName;
                profile.items[lockerItem].attributes.banner_color_template = bannerColorTemplateName;

                await DatabaseManager.updateItemInProfile(accountId, profileId, lockerItem, {
                    'attributes.banner_icon_template': bannerIconTemplateName,
                    'attributes.banner_color_template': bannerColorTemplateName
                });

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: lockerItem,
                    attributeName: 'banner_icon_template',
                    attributeValue: profile.items[lockerItem].attributes.banner_icon_template
                });

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: lockerItem,
                    attributeName: 'banner_color_template',
                    attributeValue: profile.items[lockerItem].attributes.banner_color_template
                });

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
            LoggerService.log('error', `SetCosmeticLockerBanner error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetCosmeticLockerSlot",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { category, lockerItem, itemToSlot, variantUpdates, slotIndex } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            try {
                const returnVariantsAsString = JSON.stringify(variantUpdates || []);

                if (returnVariantsAsString.includes("active")) {
                    const newVariants = [{ variants: [] }];

                    if (profileId === "athena") {
                        if (!profile.items[itemToSlot]) {
                            const err = Errors.MCP.itemNotFound();
                            return res.status(err.statusCode).json(err.toJSON());
                        }

                        if (!profile.items[itemToSlot].attributes.variants) {
                            profile.items[itemToSlot].attributes.variants = [];
                        }

                        for (const variantUpdate of variantUpdates) {
                            let found = false;
                            
                            for (const variant of profile.items[itemToSlot].attributes.variants) {
                                if (variantUpdate.channel === variant.channel) {
                                    variant.active = variantUpdate.active;
                                    found = true;
                                    break;
                                }
                            }

                            if (!found) {
                                profile.items[itemToSlot].attributes.variants.push(variantUpdate);
                            }
                        }

                        await DatabaseManager.updateItemInProfile(accountId, profileId, itemToSlot, {
                            'attributes.variants': profile.items[itemToSlot].attributes.variants
                        });

                        changes.push({
                            changeType: 'itemAttrChanged',
                            itemId: itemToSlot,
                            attributeName: 'variants',
                            attributeValue: profile.items[itemToSlot].attributes.variants
                        });
                    }

                    for (const variantUpdate of variantUpdates) {
                        newVariants[0].variants.push({
                            channel: variantUpdate.channel,
                            active: variantUpdate.active
                        });

                        if (profile.items[lockerItem]?.attributes?.locker_slots_data?.slots?.[category]) {
                            profile.items[lockerItem].attributes.locker_slots_data.slots[category].activeVariants = newVariants;
                        }
                    }
                }
            } catch (err) {}

            if (category && lockerItem) {
                if (!profile.items[lockerItem]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                switch (category) {
                    case "Character":
                    case "Backpack":
                    case "Pickaxe":
                    case "Glider":
                    case "SkyDiveContrail":
                    case "MusicPack":
                    case "LoadingScreen":
                        profile.items[lockerItem].attributes.locker_slots_data.slots[category].items = [itemToSlot || ""];
                        break;

                    case "Dance":
                        const danceIndex = slotIndex || 0;
                        if (Math.sign(danceIndex) === 1 || Math.sign(danceIndex) === 0) {
                            profile.items[lockerItem].attributes.locker_slots_data.slots.Dance.items[danceIndex] = itemToSlot || "";
                        }
                        break;

                    case "ItemWrap":
                        const wrapIndex = slotIndex || 0;
                        const sign = Math.sign(wrapIndex);

                        if (sign === 0 || sign === 1) {
                            profile.items[lockerItem].attributes.locker_slots_data.slots.ItemWrap.items[wrapIndex] = itemToSlot || "";
                        } else if (sign === -1) {
                            for (let i = 0; i < 7; i++) {
                                profile.items[lockerItem].attributes.locker_slots_data.slots.ItemWrap.items[i] = itemToSlot || "";
                            }
                        }
                        break;
                }

                await DatabaseManager.updateItemInProfile(accountId, profileId, lockerItem, {
                    'attributes.locker_slots_data': profile.items[lockerItem].attributes.locker_slots_data
                });

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: lockerItem,
                    attributeName: 'locker_slots_data',
                    attributeValue: profile.items[lockerItem].attributes.locker_slots_data
                });

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
            LoggerService.log('error', `SetCosmeticLockerSlot error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/PutModularCosmeticLoadout",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { loadoutType, presetId, loadoutData: loadoutDataStr } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const loadoutData = JSON.parse(loadoutDataStr);

            if (!profile.stats.attributes.loadout_presets) {
                profile.stats.attributes.loadout_presets = {};
                
                changes.push(MCPResponseBuilder.createStatChange('loadout_presets', {}));
            }

            if (!profile.stats.attributes.loadout_presets[loadoutType]) {
                const newLoadoutId = DatabaseManager.generateItemId();

                await DatabaseManager.addItemToProfile(accountId, profileId, newLoadoutId, {
                    templateId: loadoutType,
                    attributes: {},
                    quantity: 1
                });

                profile.items[newLoadoutId] = {
                    templateId: loadoutType,
                    attributes: {},
                    quantity: 1
                };

                changes.push(MCPResponseBuilder.createItemAdded(newLoadoutId, profile.items[newLoadoutId]));

                profile.stats.attributes.loadout_presets[loadoutType] = {
                    [presetId]: newLoadoutId
                };

                changes.push(MCPResponseBuilder.createStatChange('loadout_presets', profile.stats.attributes.loadout_presets));
            }

            try {
                const loadoutGuid = profile.stats.attributes.loadout_presets[loadoutType][presetId];
                
                await DatabaseManager.updateItemInProfile(accountId, profileId, loadoutGuid, {
                    attributes: loadoutData
                });

                profile.items[loadoutGuid].attributes = loadoutData;

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: loadoutGuid,
                    attributeName: 'slots',
                    attributeValue: profile.items[loadoutGuid].attributes.slots
                });
            } catch (err) {}

            for (const slot of loadoutData.slots) {
                if (slot.customization_info) {
                    for (const itemId in profile.items) {
                        const item = profile.items[itemId];
                        
                        if (item.templateId.toLowerCase() === slot.equipped_item.toLowerCase()) {
                            if (!item.attributes.variants) {
                                item.attributes.variants = [];
                            }

                            for (const customization of slot.customization_info) {
                                let found = false;
                                
                                for (const variant of item.attributes.variants) {
                                    if (customization.channel_tag === variant.channel) {
                                        variant.active = `${customization.variant_tag}.${customization.additional_data}`;
                                        found = true;
                                        break;
                                    }
                                }

                                if (!found) {
                                    item.attributes.variants.push({
                                        channel: customization.channel_tag,
                                        active: `${customization.variant_tag}.${customization.additional_data}`,
                                        owned: []
                                    });
                                }
                            }

                            await DatabaseManager.updateItemInProfile(accountId, profileId, itemId, {
                                'attributes.variants': item.attributes.variants
                            });

                            changes.push({
                                changeType: 'itemAttrChanged',
                                itemId: itemId,
                                attributeName: 'variants',
                                attributeValue: item.attributes.variants
                            });
                        }
                    }
                }
            }

            profile.rvn += 1;
            profile.commandRevision += 1;

            await DatabaseManager.saveProfile(accountId, profileId, profile);

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `PutModularCosmeticLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.get("/api/locker/v3/:deploymentId/account/:accountId/items",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const deploymentId = req.params.deploymentId;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.stats.attributes.loadout_presets) {
                profile.stats.attributes.loadout_presets = {};
                profile.rvn += 1;
                profile.commandRevision += 1;
                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            const response = {
                activeLoadouts: [],
                loadoutPresets: []
            };

            for (const cosmeticLoadout in profile.stats.attributes.loadout_presets) {
                for (const loadout in profile.stats.attributes.loadout_presets[cosmeticLoadout]) {
                    const loadoutId = profile.stats.attributes.loadout_presets[cosmeticLoadout][loadout];
                    const loadoutItem = profile.items[loadoutId];
                    const date = new Date().toISOString();

                    const loadoutToAdd = {
                        deploymentId: deploymentId,
                        accountId: accountId,
                        loadoutType: loadoutItem.templateId,
                        loadoutShuffleType: "DISABLED",
                        athenaItemId: loadoutId,
                        creationTime: date,
                        updatedTime: date,
                        loadoutSlots: []
                    };

                    const slots = loadoutItem.attributes.slots;
                    for (const slot of slots) {
                        const slotToAdd = {
                            slotTemplate: slot.slot_template,
                            equippedItemId: slot.equipped_item,
                            itemCustomizations: []
                        };

                        if (slot.customization_info) {
                            for (const customization of slot.customization_info) {
                                slotToAdd.itemCustomizations.push({
                                    channelTag: customization.channel_tag,
                                    variantTag: customization.variant_tag,
                                    additionalData: customization.additional_data
                                });
                            }
                        }

                        loadoutToAdd.loadoutSlots.push(slotToAdd);
                    }

                    response.activeLoadouts.push(loadoutToAdd);
                }
            }

            res.json(response);
        } catch (error) {
            LoggerService.log('error', `Get locker v3 items error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.put("/api/locker/v3/:deploymentId/loadout/:loadoutType/account/:accountId/active-loadout",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const deploymentId = req.params.deploymentId;
            const { loadoutType, athenaItemId, loadoutSlots, presetIndex } = req.body;
            const date = new Date().toISOString();

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const loadoutData = { slots: [] };

            for (const slot of loadoutSlots) {
                const slotToAdd = {};
                
                if (slot.slotTemplate) {
                    slotToAdd.slot_template = slot.slotTemplate;
                }
                if (slot.equippedItemId) {
                    slotToAdd.equipped_item = slot.equippedItemId;
                }

                if (slot.itemCustomizations) {
                    slotToAdd.customization_info = [];
                    
                    for (const customization of slot.itemCustomizations) {
                        const customizationToAdd = {};
                        
                        if (customization.channelTag) {
                            customizationToAdd.channel_tag = customization.channelTag;
                        }
                        if (customization.variantTag) {
                            customizationToAdd.variant_tag = customization.variantTag;
                        }
                        if (customization.additionalData) {
                            customizationToAdd.additional_data = customization.additionalData;
                        }
                        
                        slotToAdd.customization_info.push(customizationToAdd);
                    }
                }

                loadoutData.slots.push(slotToAdd);
            }

            if (!profile.stats.attributes.loadout_presets) {
                profile.stats.attributes.loadout_presets = {};
            }

            if (!profile.stats.attributes.loadout_presets[loadoutType]) {
                const newLoadoutId = DatabaseManager.generateItemId();

                await DatabaseManager.addItemToProfile(accountId, 'athena', newLoadoutId, {
                    templateId: loadoutType,
                    attributes: {},
                    quantity: 1
                });

                profile.items[newLoadoutId] = {
                    templateId: loadoutType,
                    attributes: {},
                    quantity: 1
                };

                profile.stats.attributes.loadout_presets[loadoutType] = {
                    [presetIndex]: newLoadoutId
                };
            }

            try {
                const loadoutGuid = profile.stats.attributes.loadout_presets[loadoutType][presetIndex];
                
                await DatabaseManager.updateItemInProfile(accountId, 'athena', loadoutGuid, {
                    attributes: loadoutData
                });

                profile.items[loadoutGuid].attributes = loadoutData;
            } catch (err) {}

            for (const slot of loadoutData.slots) {
                if (slot.customization_info) {
                    for (const itemId in profile.items) {
                        const item = profile.items[itemId];
                        
                        if (item.templateId.toLowerCase() === slot.equipped_item.toLowerCase()) {
                            if (!item.attributes.variants) {
                                item.attributes.variants = [];
                            }

                            for (const customization of slot.customization_info) {
                                let found = false;
                                
                                for (const variant of item.attributes.variants) {
                                    if (customization.channel_tag === variant.channel) {
                                        variant.active = `${customization.variant_tag}.${customization.additional_data}`;
                                        found = true;
                                        break;
                                    }
                                }

                                if (!found) {
                                    item.attributes.variants.push({
                                        channel: customization.channel_tag,
                                        active: `${customization.variant_tag}.${customization.additional_data}`,
                                        owned: []
                                    });
                                }
                            }

                            await DatabaseManager.updateItemInProfile(accountId, 'athena', itemId, {
                                'attributes.variants': item.attributes.variants
                            });
                        }
                    }
                }
            }

            profile.rvn += 1;
            profile.commandRevision += 1;

            await DatabaseManager.saveProfile(accountId, 'athena', profile);

            const response = {
                deploymentId: deploymentId,
                accountId: accountId,
                loadoutType: loadoutType,
                loadoutShuffleType: "DISABLED",
                athenaItemId: athenaItemId,
                creationTime: date,
                updatedTime: date,
                loadoutSlots: loadoutSlots
            };

            res.json(response);
        } catch (error) {
            LoggerService.log('error', `Set locker v3 active loadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.get("/api/locker/v4/:deploymentId/account/:accountId/items",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const deploymentId = req.params.deploymentId;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.stats.attributes.loadout_presets) {
                profile.stats.attributes.loadout_presets = {};
                profile.rvn += 1;
                profile.commandRevision += 1;
                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            const response = {
                activeLoadoutGroup: {
                    accountId: accountId,
                    athenaItemId: "lawinsathenaitemidlol",
                    creationTime: new Date().toISOString(),
                    deploymentId: deploymentId,
                    loadouts: {}
                },
                loadoutGroupPresets: [],
                loadoutPresets: []
            };

            for (const cosmeticLoadout in profile.stats.attributes.loadout_presets) {
                for (const loadout in profile.stats.attributes.loadout_presets[cosmeticLoadout]) {
                    const loadoutId = profile.stats.attributes.loadout_presets[cosmeticLoadout][loadout];
                    const loadoutItem = profile.items[loadoutId];
                    const date = new Date().toISOString();

                    const activeCosmeticLoadout = {
                        loadoutSlots: [],
                        shuffleType: "DISABLED"
                    };

                    const loadoutToAdd = {
                        deploymentId: deploymentId,
                        accountId: accountId,
                        loadoutType: loadoutItem.templateId,
                        loadoutShuffleType: "DISABLED",
                        athenaItemId: loadoutId,
                        creationTime: date,
                        updatedTime: date,
                        loadoutSlots: []
                    };

                    const slots = loadoutItem.attributes.slots;
                    for (const slot of slots) {
                        const slotToAdd = {
                            slotTemplate: slot.slot_template,
                            equippedItemId: slot.equipped_item,
                            itemCustomizations: []
                        };

                        if (slot.customization_info) {
                            for (const customization of slot.customization_info) {
                                const customizationToAdd = {
                                    channelTag: customization.channel_tag,
                                    variantTag: customization.variant_tag,
                                    additionalData: customization.additional_data
                                };
                                slotToAdd.itemCustomizations.push(customizationToAdd);
                            }
                        }

                        loadoutToAdd.loadoutSlots.push(slotToAdd);
                        activeCosmeticLoadout.loadoutSlots.push(slotToAdd);
                    }

                    response.loadoutPresets.push(loadoutToAdd);
                    response.activeLoadoutGroup.loadouts[loadoutItem.templateId] = activeCosmeticLoadout;
                }
            }

            res.json(response);
        } catch (error) {
            LoggerService.log('error', `Get locker v4 items error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.put("/api/locker/v4/:deploymentId/account/:accountId/active-loadout-group",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const deploymentId = req.params.deploymentId;
            const date = new Date().toISOString();

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.stats.attributes.loadout_presets) {
                profile.stats.attributes.loadout_presets = {};
            }

            for (const loadoutType in req.body.loadouts) {
                const loadoutData = { slots: [] };

                for (let slot of req.body.loadouts[loadoutType].loadoutSlots) {
                    const slotToAdd = {};
                    
                    if (slot.slotTemplate) {
                        slotToAdd.slot_template = slot.slotTemplate;
                    }
                    
                    if (slot.equippedItemId) {
                        slot.equippedItemId = slot.equippedItemId.split(':').slice(0, 2).join(':');
                        slotToAdd.equipped_item = slot.equippedItemId;
                    }

                    if (slot.itemCustomizations) {
                        slotToAdd.customization_info = [];
                        
                        for (let customization of slot.itemCustomizations) {
                            const customizationToAdd = {};
                            
                            if (customization.channelTag) {
                                customizationToAdd.channel_tag = customization.channelTag;
                            }
                            if (customization.variantTag) {
                                customizationToAdd.variant_tag = customization.variantTag;
                            }
                            if (customization.additionalData) {
                                customizationToAdd.additional_data = customization.additionalData;
                            }
                            
                            slotToAdd.customization_info.push(customizationToAdd);
                        }
                    }
                    
                    loadoutData.slots.push(slotToAdd);
                }

                if (!profile.stats.attributes.loadout_presets[loadoutType]) {
                    const newLoadoutId = DatabaseManager.generateItemId();

                    await DatabaseManager.addItemToProfile(accountId, 'athena', newLoadoutId, {
                        templateId: loadoutType,
                        attributes: {},
                        quantity: 1
                    });

                    profile.items[newLoadoutId] = {
                        templateId: loadoutType,
                        attributes: {},
                        quantity: 1
                    };

                    profile.stats.attributes.loadout_presets[loadoutType] = {
                        "0": newLoadoutId
                    };
                }

                try {
                    const loadoutGuid = profile.stats.attributes.loadout_presets[loadoutType]["0"];
                    
                    await DatabaseManager.updateItemInProfile(accountId, 'athena', loadoutGuid, {
                        attributes: loadoutData
                    });

                    profile.items[loadoutGuid].attributes = loadoutData;
                } catch (err) {}

                for (const slot of loadoutData.slots) {
                    if (slot.customization_info) {
                        for (const itemId in profile.items) {
                            const item = profile.items[itemId];
                            
                            if (item.templateId.toLowerCase() === slot.equipped_item.toLowerCase()) {
                                if (!item.attributes.variants) {
                                    item.attributes.variants = [];
                                }

                                for (const customization of slot.customization_info) {
                                    let found = false;
                                    
                                    for (const variant of item.attributes.variants) {
                                        if (customization.channel_tag === variant.channel) {
                                            variant.active = `${customization.variant_tag}.${customization.additional_data}`;
                                            found = true;
                                            break;
                                        }
                                    }

                                    if (!found) {
                                        item.attributes.variants.push({
                                            channel: customization.channel_tag,
                                            active: `${customization.variant_tag}.${customization.additional_data}`,
                                            owned: []
                                        });
                                    }
                                }

                                await DatabaseManager.updateItemInProfile(accountId, 'athena', itemId, {
                                    'attributes.variants': item.attributes.variants
                                });
                            }
                        }
                    }
                }
            }

            profile.rvn += 1;
            profile.commandRevision += 1;

            await DatabaseManager.saveProfile(accountId, 'athena', profile);

            const response = {
                deploymentId: deploymentId,
                accountId: accountId,
                athenaItemId: "lawinsathenaitemidlol",
                creationTime: date,
                updatedTime: date,
                loadouts: req.body.loadouts,
                shuffleType: "DISABLED"
            };

            res.json(response);
        } catch (error) {
            LoggerService.log('error', `Active loadout group error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/api/locker/v4/:deploymentId/account/:accountId/lock-in-immutable-item/:cosmeticItemId",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const itemGuid = req.params.cosmeticItemId.split(":")[2];

            if (!itemGuid) {
                const err = Errors.MCP.invalidPayload();
                return res.status(err.statusCode).json(err.toJSON());
            }

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.items[itemGuid]) {
                const err = Errors.MCP.itemNotFound();
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.items[itemGuid].attributes.variants) {
                profile.items[itemGuid].attributes.variants = [];
            }

            for (const [key, value] of Object.entries(req.body.variants)) {
                profile.items[itemGuid].attributes.variants.push({
                    channel: key,
                    active: value.variantTag,
                    owned: []
                });
            }

            profile.items[itemGuid].attributes.locked_in = true;

            await DatabaseManager.updateItemInProfile(accountId, 'athena', itemGuid, {
                'attributes.variants': profile.items[itemGuid].attributes.variants,
                'attributes.locked_in': true
            });

            profile.rvn += 1;
            profile.commandRevision += 1;

            await DatabaseManager.saveProfile(accountId, 'athena', profile);

            res.status(204).end();
        } catch (error) {
            LoggerService.log('error', `Lock in immutable item error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetActiveArchetype",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { archetypeGroup, archetype } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (archetypeGroup) {
                if (!profile.stats.attributes.loadout_archetype_values) {
                    profile.stats.attributes.loadout_archetype_values = {};
                }

                profile.stats.attributes.loadout_archetype_values[archetypeGroup] = archetype || "";

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.loadout_archetype_values': profile.stats.attributes.loadout_archetype_values
                });

                changes.push(MCPResponseBuilder.createStatChange(
                    'loadout_archetype_values',
                    profile.stats.attributes.loadout_archetype_values
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
            LoggerService.log('error', `SetActiveArchetype error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.patch("/api/locker/v4/:deploymentId/account/:accountId/companion-name",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const { cosmeticItemId, companionName } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (cosmeticItemId && companionName) {
                const itemGuid = cosmeticItemId.split(":")[2];

                if (!profile.items[itemGuid]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (!profile.items[itemGuid].attributes.variants) {
                    profile.items[itemGuid].attributes.variants = [];
                }

                profile.items[itemGuid].attributes.variants.push({
                    channel: "CustomName",
                    active: companionName,
                    owned: []
                });

                await DatabaseManager.updateItemInProfile(accountId, 'athena', itemGuid, {
                    'attributes.variants': profile.items[itemGuid].attributes.variants
                });

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            res.status(204).end();
        } catch (ero) {
            LoggerService.log('error', `Set companion name error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/SetHeroCosmeticVariants",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { outfitVariants, backblingVariants, heroItem } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (outfitVariants && backblingVariants && heroItem) {
                if (!profile.items[heroItem]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                await DatabaseManager.updateItemInProfile(accountId, profileId, heroItem, {
                    'attributes.outfitvariants': outfitVariants,
                    'attributes.backblingvariants': backblingVariants
                });

                profile.items[heroItem].attributes.outfitvariants = outfitVariants;
                profile.items[heroItem].attributes.backblingvariants = backblingVariants;

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: heroItem,
                    attributeName: 'outfitvariants',
                    attributeValue: outfitVariants
                });

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: heroItem,
                    attributeName: 'backblingvariants',
                    attributeValue: backblingVariants
                });

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
            LoggerService.log('error', `SetHeroCosmeticVariants error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/dedicated_server/:operation",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;

            const profile = await DatabaseManager.getProfile(accountId, profileId);

            MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
        } catch (error) {
            LoggerService.log('error', `Dedicated server operation error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

router.post("/fortnite/api/game/v2/profile/:accountId/client/*",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;

            const profile = await DatabaseManager.getProfile(accountId, profileId);

            MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
        } catch (error) {
            LoggerService.log('error', `QueryProfile error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);


module.exports = router;
