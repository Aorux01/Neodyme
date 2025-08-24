const express = require('express');
const router = express.Router();
const AuthService = require('../src/services/AuthService');
const AccountService = require('../src/services/AccountService');
const MCPService = require('../src/services/MCPService');
const { Errors, sendError } = require('../src/errors/errors');
const LoggerService = require('../src/utils/logger');
const TokenService = require('../src/services/TokenService');

const requireAuth = TokenService.createVerificationMiddleware();

router.post('/fortnite/api/game/v2/profile/:accountId/client/:operation', requireAuth, async (req, res) => {
        try {
            const { accountId, operation } = req.params;
            const { profileId } = req.query;

            if (req.user.accountId !== accountId) {
                throw Errors.Authentication.notYourAccount();
            }

            const mcpService = new MCPService(accountId);
            const profile = await mcpService.getProfile(profileId);

            if (!profile) {
                throw Errors.MCP.profileNotFound(accountId);
            }

            let changes = [];
            let notifications = [];
            let multiUpdate = [];

            switch (operation.toLowerCase()) {
                case 'queryprofile':
                    break;

                case 'clientquestlogin':
                    ({ changes, notifications } = await require('./mcp/mcp_quests').handleClientQuestLogin(req, profile, mcpService));
                    break;

                case 'markitemseen':
                    ({ changes } = await require('./mcp/mcp_items').handleMarkItemSeen(req, profile));
                    break;

                case 'setitemfavoritestatusbatch':
                    ({ changes } = await require('./mcp/mcp_items').handleSetItemFavoriteStatusBatch(req, profile));
                    break;

                case 'setitemfavoritestatus':
                    ({ changes } = await require('./mcp/mcp_items').handleSetItemFavoriteStatus(req, profile));
                    break;

                case 'equipbattleroyalecustomization':
                    ({ changes } = await require('./mcp/mcp_locker').handleEquipBattleRoyaleCustomization(req, profile));
                    break;

                case 'setbattleroyalebanner':
                    ({ changes } = await require('./mcp/mcp_locker').handleSetBattleRoyaleBanner(req, profile));
                    break;

                case 'setcosmeticlockerslot':
                    ({ changes } = await require('./mcp/mcp_locker').handleSetCosmeticLockerSlot(req, profile));
                    break;

                case 'setcosmeticlockerbanner':
                    ({ changes } = await require('./mcp/mcp_locker').handleSetCosmeticLockerBanner(req, profile));
                    break;

                case 'bulkequipbattleroyalecustomization':
                    ({ changes } = await require('./mcp/mcp_locker').handleBulkEquipBattleRoyaleCustomization(req, profile));
                    break;

                case 'purchasecatalogentry':
                    ({ changes, notifications, multiUpdate } = await require('./mcp/mcp_shop').handlePurchaseCatalogEntry(req, profile, mcpService));
                    break;

                case 'giftcatalogentry':
                    ({ changes, notifications } = await require('./mcp/mcp_gifts').handleGiftCatalogEntry(req, profile, mcpService));
                    break;

                case 'removegiftbox':
                    ({ changes } = await require('./mcp/mcp_gifts').handleRemoveGiftBox(req, profile));
                    break;

                case 'setreceivegiftsenabled':
                    ({ changes } = await require('./mcp/mcp_gifts').handleSetReceiveGiftsEnabled(req, profile));
                    break;

                case 'setaffiliatename':
                    ({ changes } = await require('./mcp/mcp_misc').handleSetAffiliateName(req, profile));
                    break;

                case 'sethomebasebanner':
                    ({ changes } = await require('./mcp/mcp_misc').handleSetHomebaseBanner(req, profile));
                    break;

                case 'sethomebasename':
                    ({ changes } = await require('./mcp/mcp_misc').handleSetHomebaseName(req, profile));
                    break;

                case 'setpartyassistquest':
                    ({ changes } = await require('./mcp/mcp_quests').handleSetPartyAssistQuest(req, profile));
                    break;

                case 'athenapinquest':
                    ({ changes } = await require('./mcp/mcp_quests').handleAthenaPinQuest(req, profile));
                    break;

                case 'fortrerolldailyquest':
                    ({ changes, notifications } = await require('./mcp/mcp_quests').handleFortRerollDailyQuest(req, profile));
                    break;

                case 'marknewquestnotificationsent':
                    ({ changes } = await require('./mcp/mcp_quests').handleMarkNewQuestNotificationSent(req, profile));
                    break;

                case 'unlockrewardnode':
                    ({ changes, notifications, multiUpdate } = await require('./mcp/mcp_events').handleUnlockRewardNode(req, profile, mcpService));
                    break;

                case 'setseasonpassautoclaim':
                    ({ changes } = await require('./mcp/mcp_misc').handleSetSeasonPassAutoClaim(req, profile));
                    break;

                case 'setitemarchivedstatusbatch':
                    ({ changes } = await require('./mcp/mcp_items').handleSetItemArchivedStatusBatch(req, profile));
                    break;

                case 'putmodularcosmeticloadout':
                    ({ changes } = await require('./mcp/mcp_locker').handlePutModularCosmeticLoadout(req, profile));
                    break;

                case 'setactivearchetype':
                    ({ changes } = await require('./mcp/mcp_locker').handleSetActiveArchetype(req, profile));
                    break;

                case 'setmtxplatform':
                    ({ changes } = await require('./mcp/mcp_misc').handleSetMtxPlatform(req, profile));
                    break;

                case 'incrementnamedcounterstat':
                    ({ changes } = await require('./mcp/mcp_misc').handleIncrementNamedCounterStat(req, profile));
                    break;

                case 'sethardcoremodifier':
                    ({ changes } = await require('./mcp/mcp_misc').handleSetHardcoreModifier(req, profile));
                    break;

                case 'refreshexpeditions':
                    ({ changes } = await require('./mcp/mcp_misc').handleRefreshExpeditions(req, profile));
                    break;

                case 'getmcptimeforlogin':
                    ({ changes } = await require('./mcp/mcp_misc').handleGetMcpTimeForLogin(req, profile));
                    break;

                case 'tryplayonplatform':
                    break;

                case 'setrecord':
                    ({ changes } = await require('./mcp/mcp_misc').handleSetRecord(req, profile));
                    break;

                case 'deletereward':
                    ({ changes } = await require('./mcp/mcp_misc').handleDeleteReward(req, profile));
                    break;

                case 'purchasehomebasenode':
                    ({ changes } = await require('./mcp/mcp_stw').handlePurchaseHomebaseNode(req, profile));
                    break;

                case 'refunditem':
                    ({ changes } = await require('./mcp/mcp_stw').handleRefundItem(req, profile));
                    break;

                case 'upgradeitem':
                    ({ changes } = await require('./mcp/mcp_stw').handleUpgradeItem(req, profile));
                    break;

                case 'upgradeitemrarity':
                    ({ changes, notifications } = await require('./mcp/mcp_stw').handleUpgradeItemRarity(req, profile));
                    break;

                case 'convertitem':
                    ({ changes, notifications } = await require('./mcp/mcp_stw').handleConvertItem(req, profile));
                    break;

                case 'craftworlditem':
                    ({ changes, notifications } = await require('./mcp/mcp_stw').handleCraftWorldItem(req, profile));
                    break;

                case 'refundmtxpurchase':
                    ({ changes, notifications, multiUpdate } = await require('./mcp/mcp_shop').handleRefundMtxPurchase(req, profile, mcpService));
                    break;
                
                case 'claimloginreward':
                    ({ changes, notifications } = await require('./mcp/mcp_stw').handleClaimLoginReward(req, profile));
                    break;
                
                case 'updatequestclientobjectives':
                    ({ changes } = await require('./mcp/mcp_quests').handleUpdateQuestClientObjectives(req, profile));
                    break;
                
                case 'assignteamperktoloadout':
                    ({ changes } = await require('./mcp/mcp_stw').handleAssignTeamPerkToLoadout(req, profile));
                    break;
                
                case 'assigngadgettoloadout':
                    ({ changes } = await require('./mcp/mcp_stw').handleAssignGadgetToLoadout(req, profile));
                    break;
                
                case 'assignworkertoSquad':
                    ({ changes } = await require('./mcp/mcp_stw').handleAssignWorkerToSquad(req, profile));
                    break;
                
                case 'assignworkertosquadbatch':
                    ({ changes } = await require('./mcp/mcp_stw').handleAssignWorkerToSquadBatch(req, profile));
                    break;
                
                case 'claimquestreward':
                    ({ changes, notifications, multiUpdate } = await require('./mcp/mcp_quests').handleClaimQuestReward(req, profile, mcpService));
                    break;
                
                case 'upgradeitembulk':
                    ({ changes } = await require('./mcp/mcp_stw').handleUpgradeItemBulk(req, profile));
                    break;
                
                case 'upgradeslotteditem':
                    ({ changes } = await require('./mcp/mcp_stw').handleUpgradeSlottedItem(req, profile));
                    break;
                
                case 'convertslotteditem':
                    ({ changes, notifications } = await require('./mcp/mcp_stw').handleConvertSlottedItem(req, profile));
                    break;
                
                case 'promoteitem':
                    ({ changes } = await require('./mcp/mcp_stw').handlePromoteItem(req, profile));
                    break;
                
                case 'transmogitem':
                    ({ changes, notifications } = await require('./mcp/mcp_stw').handleTransmogItem(req, profile));
                    break;
                
                case 'destroyworlditems':
                    ({ changes } = await require('./mcp/mcp_stw').handleDestroyWorldItems(req, profile));
                    break;
                
                case 'disassembleworlditems':
                    ({ changes } = await require('./mcp/mcp_stw').handleDisassembleWorldItems(req, profile));
                    break;
                
                case 'storagetransfer':
                    ({ changes, multiUpdate } = await require('./mcp/mcp_stw').handleStorageTransfer(req, profile, mcpService));
                    break;
                
                case 'modifyquickbar':
                    ({ changes } = await require('./mcp/mcp_stw').handleModifyQuickbar(req, profile));
                    break;
                
                case 'assignherotoloadout':
                    ({ changes } = await require('./mcp/mcp_stw').handleAssignHeroToLoadout(req, profile));
                    break;
                
                case 'clearheroloadout':
                    ({ changes } = await require('./mcp/mcp_stw').handleClearHeroLoadout(req, profile));
                    break;
                
                case 'recycleitemBatch':
                    ({ changes, notifications, multiUpdate } = await require('./mcp/mcp_stw').handleRecycleItemBatch(req, profile, mcpService));
                    break;
                
                case 'researchitemfromcollectionbook':
                    ({ changes } = await require('./mcp/mcp_stw').handleResearchItemFromCollectionBook(req, profile));
                    break;
                
                case 'slotitemincollectionbook':
                    ({ changes, notifications, multiUpdate } = await require('./mcp/mcp_stw').handleSlotItemInCollectionBook(req, profile, mcpService));
                    break;
                
                case 'unslotitemfromcollectionbook':
                    ({ changes, notifications, multiUpdate } = await require('./mcp/mcp_stw').handleUnslotItemFromCollectionBook(req, profile, mcpService));
                    break;
                
                case 'claimcollectionbookrewards':
                    ({ changes } = await require('./mcp/mcp_stw').handleClaimCollectionBookRewards(req, profile));
                    break;
                
                case 'respecalteration':
                    ({ changes } = await require('./mcp/mcp_stw').handleRespecAlteration(req, profile));
                    break;
                
                case 'upgradealteration':
                    ({ changes } = await require('./mcp/mcp_stw').handleUpgradeAlteration(req, profile));
                    break;
                
                case 'respecresearch':
                    ({ changes } = await require('./mcp/mcp_stw').handleRespecResearch(req, profile));
                    break;
                
                case 'respecupgrades':
                    ({ changes } = await require('./mcp/mcp_stw').handleRespecUpgrades(req, profile));
                    break;
                
                case 'purchaseresearchstatupgrade':
                    ({ changes } = await require('./mcp/mcp_stw').handlePurchaseResearchStatUpgrade(req, profile));
                    break;
                
                case 'purchaseorupgradehomebasenode':
                    ({ changes } = await require('./mcp/mcp_stw').handlePurchaseOrUpgradeHomebaseNode(req, profile));
                    break;
                
                case 'startexpedition':
                    ({ changes } = await require('./mcp/mcp_stw').handleStartExpedition(req, profile));
                    break;
                
                case 'abandonexpedition':
                    ({ changes } = await require('./mcp/mcp_stw').handleAbandonExpedition(req, profile));
                    break;
                
                case 'collectexpedition':
                    ({ changes, notifications, multiUpdate } = await require('./mcp/mcp_stw').handleCollectExpedition(req, profile, mcpService));
                    break;
                
                case 'setactiveheroloadout':
                    ({ changes } = await require('./mcp/mcp_stw').handleSetActiveHeroLoadout(req, profile));
                    break;
                
                case 'activateconsumable':
                    ({ changes } = await require('./mcp/mcp_stw').handleActivateConsumable(req, profile));
                    break;
                
                case 'unassignallsquads':
                    ({ changes } = await require('./mcp/mcp_stw').handleUnassignAllSquads(req, profile));
                    break;
                
                case 'opencardpack':
                    ({ changes, notifications } = await require('./mcp/mcp_stw').handleOpenCardPack(req, profile));
                    break;
                
                case 'populateprerolledoffers':
                    ({ changes } = await require('./mcp/mcp_stw').handlePopulatePrerolledOffers(req, profile));
                    break;
                
                case 'setherocosmevicvariants':
                    ({ changes } = await require('./mcp/mcp_stw').handleSetHeroCosmeticVariants(req, profile));
                    break;
                
                case 'setpinnedquests':
                    ({ changes } = await require('./mcp/mcp_quests').handleSetPinnedQuests(req, profile));
                    break;

                default:
                    LoggerService.log('warn', `MCP operation not implemented: ${operation}`);
                    break;
            }

            if (changes.length > 0) {
                mcpService.incrementRevision(profile);
                await mcpService.saveProfile(profileId, profile);
            }

            const response = mcpService.createMCPResponse(profile, req, changes, notifications);
            
            if (multiUpdate.length > 0) {
                response.multiUpdate = multiUpdate;
            }

            res.json(response);
        } catch (error) {
            LoggerService.log('error', `MCP operation failed: ${error.message}`);
            if (error.name === 'ApiError') {
                sendError(res, error);
            } else {
                sendError(res, Errors.Internal.serverError());
            }
        }
    }
);

router.post('/fortnite/api/game/v2/profile/:accountId/dedicated_server/:operation',
    async (req, res) => {
        try {
            const { accountId } = req.params;
            const { profileId } = req.query;

            const mcpService = new MCPService(accountId);
            const profile = await mcpService.getProfile(profileId);

            if (!profile) {
                throw Errors.MCP.profileNotFound(accountId);
            }

            const response = mcpService.createMCPResponse(profile, req, [], []);
            res.json(response);
        } catch (error) {
            LoggerService.log('error', `Dedicated server MCP operation failed: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

// Get BR Locker 4
router.get("/api/locker/v3/:deploymentId/account/:accountId/items", async (req, res) => {
    try {
        const mcpService = new MCPService(req.params.accountId);
        const profile = await mcpService.getProfile('athena');
        
        if (!profile.stats.attributes.loadout_presets) {
            profile.stats.attributes.loadout_presets = {};
            await mcpService.saveProfile('athena', profile);
        }

        const response = {
            "activeLoadouts": [],
            "loadoutPresets": []
        };

        for (const cosmeticLoadout in profile.stats.attributes.loadout_presets) {
            for (const loadout in profile.stats.attributes.loadout_presets[cosmeticLoadout]) {
                const loadoutID = profile.stats.attributes.loadout_presets[cosmeticLoadout][loadout];
                const loadoutItem = profile.items[loadoutID];
                const date = new Date().toISOString();

                const loadoutToAdd = {
                    "deploymentId": req.params.deploymentId,
                    "accountId": req.params.accountId,
                    "loadoutType": loadoutItem.templateId,
                    "loadoutShuffleType": "DISABLED",
                    "athenaItemId": loadoutID,
                    "creationTime": date,
                    "updatedTime": date,
                    "loadoutSlots": []
                };

                const slots = loadoutItem.attributes.slots;
                for (const slot in slots) {
                    const slotToAdd = {
                        "slotTemplate": slots[slot].slot_template,
                        "equippedItemId": slots[slot].equipped_item,
                        "itemCustomizations": []
                    };

                    for (const customization in slots[slot].customization_info) {
                        const custom = slots[slot].customization_info[customization];
                        const customizationToAdd = {
                            "channelTag": custom.channel_tag,
                            "variantTag": custom.variant_tag,
                            "additionalData": custom.additional_data
                        };
                        slotToAdd.itemCustomizations.push(customizationToAdd);
                    }
                    loadoutToAdd.loadoutSlots.push(slotToAdd);
                }
                response.activeLoadouts.push(loadoutToAdd);
            }
        }

        res.json(response);
    } catch (error) {
        LoggerService.log('error', `Locker v3 GET failed: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Set BR Locker 4
router.put("/api/locker/v3/:deploymentId/loadout/:loadoutType/account/:accountId/active-loadout", async (req, res) => {
    try {
        const mcpService = new MCPService(req.params.accountId);
        const profile = await mcpService.getProfile('athena');
        
        const date = new Date().toISOString();
        const response = {
            "deploymentId": req.params.deploymentId,
            "accountId": req.params.accountId,
            "loadoutType": req.body.loadoutType,
            "loadoutShuffleType": "DISABLED",
            "athenaItemId": req.body.athenaItemId,
            "creationTime": date,
            "updatedTime": date,
            "loadoutSlots": req.body.loadoutSlots
        };

        // Format the body data to Locker V3
        const loadoutData = { "slots": [] };
        
        for (const slot of req.body.loadoutSlots) {
            const slotToAdd = {};
            if (slot.slotTemplate) slotToAdd.slot_template = slot.slotTemplate;
            if (slot.equippedItemId) slotToAdd.equipped_item = slot.equippedItemId;

            for (const customization of slot.itemCustomizations) {
                const customizationToAdd = {};
                if (customization.channelTag) customizationToAdd.channel_tag = customization.channelTag;
                if (customization.variantTag) customizationToAdd.variant_tag = customization.variantTag;
                if (customization.additionalData) customizationToAdd.additional_data = customization.additionalData;
                
                if (!slotToAdd.customization_info) slotToAdd.customization_info = [];
                slotToAdd.customization_info.push(customizationToAdd);
            }
            loadoutData.slots.push(slotToAdd);
        }

        if (!profile.stats.attributes.loadout_presets) {
            profile.stats.attributes.loadout_presets = {};
        }

        if (!profile.stats.attributes.loadout_presets[req.body.loadoutType]) {
            const newLoadoutID = Functions.MakeID();
            profile.items[newLoadoutID] = {
                "templateId": req.body.loadoutType,
                "attributes": {},
                "quantity": 1
            };

            profile.stats.attributes.loadout_presets[req.body.loadoutType] = {
                [req.body.presetIndex]: newLoadoutID
            };
        }

        const loadoutGUID = profile.stats.attributes.loadout_presets[req.body.loadoutType][req.body.presetIndex];
        profile.items[loadoutGUID].attributes = loadoutData;

        await mcpService.saveProfile('athena', profile);
        res.json(response);
    } catch (error) {
        LoggerService.log('error', `Locker v3 PUT failed: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Get BR Locker 5 (v4)
router.get("/api/locker/v4/:deploymentId/account/:accountId/items", async (req, res) => {
    try {
        const mcpService = new MCPService(req.params.accountId);
        const profile = await mcpService.getProfile('athena');
        
        if (!profile.stats.attributes.loadout_presets) {
            profile.stats.attributes.loadout_presets = {};
            await mcpService.saveProfile('athena', profile);
        }

        const response = {
            "activeLoadoutGroup": {
                "accountId": req.params.accountId,
                "athenaItemId": "neodyme_athena_item_id",
                "creationTime": new Date().toISOString(),
                "deploymentId": req.params.deploymentId,
                "loadouts": {}
            },
            "loadoutGroupPresets": [],
            "loadoutPresets": []
        };

        for (const cosmeticLoadout in profile.stats.attributes.loadout_presets) {
            for (const loadout in profile.stats.attributes.loadout_presets[cosmeticLoadout]) {
                const loadoutID = profile.stats.attributes.loadout_presets[cosmeticLoadout][loadout];
                const loadoutItem = profile.items[loadoutID];
                const date = new Date().toISOString();

                const activeCosmeticLoadout = {
                    "loadoutSlots": [],
                    "shuffleType": "DISABLED"
                };

                const loadoutToAdd = {
                    "deploymentId": req.params.deploymentId,
                    "accountId": req.params.accountId,
                    "loadoutType": loadoutItem.templateId,
                    "loadoutShuffleType": "DISABLED",
                    "athenaItemId": loadoutID,
                    "creationTime": date,
                    "updatedTime": date,
                    "loadoutSlots": []
                };

                const slots = loadoutItem.attributes.slots;
                for (const slot in slots) {
                    const slotToAdd = {
                        "slotTemplate": slots[slot].slot_template,
                        "equippedItemId": slots[slot].equipped_item,
                        "itemCustomizations": []
                    };

                    for (const customization in slots[slot].customization_info) {
                        const custom = slots[slot].customization_info[customization];
                        const customizationToAdd = {
                            "channelTag": custom.channel_tag,
                            "variantTag": custom.variant_tag,
                            "additionalData": custom.additional_data
                        };
                        slotToAdd.itemCustomizations.push(customizationToAdd);
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
        LoggerService.log('error', `Locker v4 GET failed: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Set BR Locker 5 (v4)
router.put("/api/locker/v4/:deploymentId/account/:accountId/active-loadout-group", async (req, res) => {
    try {
        const mcpService = new MCPService(req.params.accountId);
        const profile = await mcpService.getProfile('athena');
        
        const date = new Date().toISOString();
        const response = {
            "deploymentId": req.params.deploymentId,
            "accountId": req.params.accountId,
            "athenaItemId": "neodyme_athena_item_id",
            "creationTime": date,
            "updatedTime": date,
            "loadouts": req.body.loadouts,
            "shuffleType": "DISABLED"
        };

        if (!profile.stats.attributes.loadout_presets) {
            profile.stats.attributes.loadout_presets = {};
        }

        for (const loadoutType in req.body.loadouts) {
            // Format the body data to Locker V3
            const loadoutData = { "slots": [] };
            
            for (const slot of req.body.loadouts[loadoutType].loadoutSlots) {
                const slotToAdd = {};
                if (slot.slotTemplate) slotToAdd.slot_template = slot.slotTemplate;
                if (slot.equippedItemId) slotToAdd.equipped_item = slot.equippedItemId;

                for (const customization of slot.itemCustomizations) {
                    const customizationToAdd = {};
                    if (customization.channelTag) customizationToAdd.channel_tag = customization.channelTag;
                    if (customization.variantTag) customizationToAdd.variant_tag = customization.variantTag;
                    if (customization.additionalData) customizationToAdd.additional_data = customization.additionalData;
                    
                    if (!slotToAdd.customization_info) slotToAdd.customization_info = [];
                    slotToAdd.customization_info.push(customizationToAdd);
                }
                loadoutData.slots.push(slotToAdd);
            }

            if (!profile.stats.attributes.loadout_presets[loadoutType]) {
                const newLoadoutID = Functions.MakeID();
                profile.items[newLoadoutID] = {
                    "templateId": loadoutType,
                    "attributes": {},
                    "quantity": 1
                };

                profile.stats.attributes.loadout_presets[loadoutType] = {
                    "0": newLoadoutID
                };
            }

            const loadoutGUID = profile.stats.attributes.loadout_presets[loadoutType]["0"];
            profile.items[loadoutGUID].attributes = loadoutData;
        }

        await mcpService.saveProfile('athena', profile);
        res.json(response);
    } catch (error) {
        LoggerService.log('error', `Locker v4 PUT failed: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;