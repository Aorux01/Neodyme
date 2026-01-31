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

module.exports = router;