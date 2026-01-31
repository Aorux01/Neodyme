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

module.exports = router;