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

module.exports = router;