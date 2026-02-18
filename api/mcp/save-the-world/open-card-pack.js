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

            
            
            const cardPackDataPath = path.join(__dirname, '../../../content/campaign/card-pack-data.json');
            
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

module.exports = router;