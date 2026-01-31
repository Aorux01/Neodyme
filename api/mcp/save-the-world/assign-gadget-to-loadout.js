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

module.exports = router;