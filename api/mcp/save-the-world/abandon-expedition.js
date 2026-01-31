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

router.post("/fortnite/api/game/v2/profile/:accountId/client/AbandonExpedition",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { expeditionId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            
            
            const expeditionDataPath = path.join(__dirname, '../../../content/campaign/ExpeditionData.json');
            
            let expeditionData;
            try {
                const data = await fs.readFile(expeditionDataPath, 'utf-8');
                expeditionData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load ExpeditionData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const date = new Date().toISOString();

            if (expeditionId) {
                const squadId = profile.items[expeditionId].attributes.expedition_squad_id;
                
                for (const itemKey in profile.items) {
                    if (profile.items[itemKey].attributes.squad_id) {
                        if (profile.items[itemKey].attributes.squad_id === squadId) {
                            profile.items[itemKey].attributes.squad_id = "";
                            profile.items[itemKey].attributes.squad_slot_idx = -1;

                            await DatabaseManager.updateItemInProfile(accountId, profileId, itemKey, {
                                'attributes.squad_id': "",
                                'attributes.squad_slot_idx': -1
                            });

                            changes.push({
                                changeType: "itemAttrChanged",
                                itemId: itemKey,
                                attributeName: "squad_id",
                                attributeValue: ""
                            });

                            changes.push({
                                changeType: "itemAttrChanged",
                                itemId: itemKey,
                                attributeName: "squad_slot_idx",
                                attributeValue: -1
                            });
                        }
                    }
                }

                delete profile.items[expeditionId].attributes.expedition_squad_id;
                delete profile.items[expeditionId].attributes.expedition_start_time;
                delete profile.items[expeditionId].attributes.expedition_end_time;

                await DatabaseManager.updateItemInProfile(accountId, profileId, expeditionId, {
                    'attributes.expedition_squad_id': null,
                    'attributes.expedition_start_time': null,
                    'attributes.expedition_end_time': null
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_squad_id",
                    attributeValue: ""
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_start_time",
                    attributeValue: null
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: expeditionId,
                    attributeName: "expedition_end_time",
                    attributeValue: null
                });

                const expirationEndTime = new Date(profile.items[expeditionId].attributes.expedition_expiration_end_time).toISOString();
                if (date > expirationEndTime) {
                    const slot = profile.items[expeditionId].attributes.expedition_slot_id;
                    delete profile.items[expeditionId];

                    await DatabaseManager.removeItemFromProfile(accountId, profileId, expeditionId);

                    changes.push(MCPResponseBuilder.createItemRemoved(expeditionId));

                    let expeditionsToChoose = expeditionData.slots[slot];
                    if (expeditionsToChoose.rare && Math.random() < 0.05) {
                        expeditionsToChoose = expeditionsToChoose.rare;
                    } else {
                        expeditionsToChoose = expeditionsToChoose.normal;
                    }

                    const randomNumber = Math.floor(Math.random() * expeditionsToChoose.length);
                    const itemId = DatabaseManager.generateItemId();
                    const templateId = expeditionsToChoose[randomNumber];

                    const endDate = new Date(date);
                    endDate.setMinutes(endDate.getMinutes() + expeditionData.attributes[templateId].expiration_duration_minutes);
                    const endDateISO = endDate.toISOString();

                    const item = {
                        templateId: templateId,
                        attributes: {
                            expedition_expiration_end_time: endDateISO,
                            expedition_criteria: [],
                            level: 1,
                            expedition_max_target_power: expeditionData.attributes[templateId].expedition_max_target_power,
                            expedition_min_target_power: expeditionData.attributes[templateId].expedition_min_target_power,
                            expedition_slot_id: slot,
                            expedition_expiration_start_time: date
                        },
                        quantity: 1
                    };

                    for (let x = 0; x < 3; x++) {
                        if (Math.random() < 0.2) {
                            const criteriaIndex = Math.floor(Math.random() * expeditionData.criteria.length);
                            item.attributes.expedition_criteria.push(expeditionData.criteria[criteriaIndex]);
                        }
                    }

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
            LoggerService.log('error', `AbandonExpedition error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;