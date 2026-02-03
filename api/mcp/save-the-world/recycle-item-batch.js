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

module.exports = router;