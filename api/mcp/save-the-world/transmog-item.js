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

            
            
            const transformItemDataPath = path.join(__dirname, '../../../content/campaign/transform-item-ids.json');
            const cardPackDataPath = path.join(__dirname, '../../../content/campaign/card-pack-data.json');
            
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

module.exports = router;