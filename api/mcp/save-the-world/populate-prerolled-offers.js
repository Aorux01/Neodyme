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

            
            
            const cardPackDataPath = path.join(__dirname, '../../../content/campaign/CardPackData.json');
            
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

module.exports = router;