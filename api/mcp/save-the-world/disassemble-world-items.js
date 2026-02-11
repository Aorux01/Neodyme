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

module.exports = router;