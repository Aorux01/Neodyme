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

router.post("/fortnite/api/game/v2/profile/:accountId/client/AssignWorkerToSquad",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { characterId, squadId, slotIndex } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];

            if (characterId) {
                for (const key in profile.items) {
                    if (profile.items[key].attributes && 
                        profile.items[key].attributes.squad_id && 
                        profile.items[key].attributes.squad_slot_idx !== undefined) {
                        
                        if (profile.items[key].attributes.squad_id !== "" && 
                            profile.items[key].attributes.squad_slot_idx !== -1) {
                            
                            if (profile.items[key].attributes.squad_id.toLowerCase() === squadId.toLowerCase() && 
                                profile.items[key].attributes.squad_slot_idx === slotIndex) {
                                
                                profile.items[key].attributes.squad_id = "";
                                profile.items[key].attributes.squad_slot_idx = 0;

                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                    'attributes.squad_id': "",
                                    'attributes.squad_slot_idx': 0
                                });

                                changes.push({
                                    changeType: "itemAttrChanged",
                                    itemId: key,
                                    attributeName: "squad_id",
                                    attributeValue: ""
                                });

                                changes.push({
                                    changeType: "itemAttrChanged",
                                    itemId: key,
                                    attributeName: "squad_slot_idx",
                                    attributeValue: 0
                                });
                            }
                        }
                    }
                }

                profile.items[characterId].attributes.squad_id = squadId || "";
                profile.items[characterId].attributes.squad_slot_idx = slotIndex || 0;

                await DatabaseManager.updateItemInProfile(accountId, profileId, characterId, {
                    'attributes.squad_id': squadId || "",
                    'attributes.squad_slot_idx': slotIndex || 0
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: characterId,
                    attributeName: "squad_id",
                    attributeValue: profile.items[characterId].attributes.squad_id
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: characterId,
                    attributeName: "squad_slot_idx",
                    attributeValue: profile.items[characterId].attributes.squad_slot_idx
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
            LoggerService.log('error', `AssignWorkerToSquad error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;