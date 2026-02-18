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

router.post("/fortnite/api/game/v2/profile/:accountId/client/CollectExpedition",
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

            
            
            const expeditionDataPath = path.join(__dirname, '../../../content/campaign/expedition-data.json');
            
            let expeditionData;
            try {
                const data = await fs.readFile(expeditionDataPath, 'utf-8');
                expeditionData = JSON.parse(data);
            } catch (error) {
                LoggerService.log('error', 'Failed to load ExpeditionData');
                return sendError(res, Errors.Internal.serverError());;
            }

            const changes = [];
            const multiUpdate = [];
            const notifications = [];
            const otherProfiles = [];
            const date = new Date().toISOString();

            if (expeditionId) {
                notifications.push({
                    type: "expeditionResult",
                    primary: true,
                    client_request_id: "",
                    bExpeditionSucceeded: false
                });

                if (Math.random() < profile.items[expeditionId].attributes.expedition_success_chance) {
                    notifications[0].bExpeditionSucceeded = true;
                    notifications[0].expeditionRewards = [];

                    for (let i = 0; i < expeditionData.rewards.length; i++) {
                        const randomNumber = Math.floor(Math.random() * expeditionData.rewards[i].length);
                        const itemId = DatabaseManager.generateItemId();
                        const templateId = expeditionData.rewards[i][randomNumber].templateId;
                        const itemProfile = expeditionData.rewards[i][randomNumber].itemProfile;

                        const minQ = expeditionData.rewards[i][randomNumber].minQuantity;
                        const maxQ = expeditionData.rewards[i][randomNumber].maxQuantity;
                        const quantity = Math.floor(Math.random() * (maxQ - minQ + 1)) + minQ;

                        const item = {
                            templateId: templateId,
                            attributes: {
                                loadedAmmo: 0,
                                inventory_overflow_date: false,
                                level: 0,
                                alterationDefinitions: [],
                                durability: 1,
                                itemSource: ""
                            },
                            quantity: quantity
                        };

                        notifications[0].expeditionRewards.push({
                            itemType: templateId,
                            itemGuid: itemId,
                            itemProfile: itemProfile,
                            quantity: quantity
                        });

                        if (itemProfile === profileId) {
                            profile.items[itemId] = item;

                            await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                            changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                        } else {
                            let k = -1;
                            for (let x = 0; x < multiUpdate.length; x++) {
                                if (multiUpdate[x].profileId === itemProfile) {
                                    k = x;
                                }
                            }

                            if (k === -1) {
                                const otherProfile = await DatabaseManager.getProfile(accountId, itemProfile);
                                otherProfiles.push(otherProfile);
                                k = multiUpdate.length;
                                multiUpdate.push({
                                    profileRevision: otherProfile.rvn || 0,
                                    profileId: otherProfile.profileId,
                                    profileChangesBaseRevision: otherProfile.rvn || 0,
                                    profileChanges: [],
                                    profileCommandRevision: otherProfile.commandRevision || 0
                                });
                            }

                            otherProfiles[k].items[itemId] = item;

                            await DatabaseManager.addItemToProfile(accountId, itemProfile, itemId, item);

                            multiUpdate[k].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));
                        }
                    }
                }

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
                const newExpeditionId = DatabaseManager.generateItemId();
                const templateId = expeditionsToChoose[randomNumber];

                const endDate = new Date(date);
                endDate.setMinutes(endDate.getMinutes() + expeditionData.attributes[templateId].expiration_duration_minutes);
                const endDateISO = endDate.toISOString();

                const newExpedition = {
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
                        newExpedition.attributes.expedition_criteria.push(expeditionData.criteria[criteriaIndex]);
                    }
                }

                profile.items[newExpeditionId] = newExpedition;

                await DatabaseManager.addItemToProfile(accountId, profileId, newExpeditionId, newExpedition);

                changes.push(MCPResponseBuilder.createItemAdded(newExpeditionId, newExpedition));

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);

                for (let i = 0; i < otherProfiles.length; i++) {
                    otherProfiles[i].rvn += 1;
                    otherProfiles[i].commandRevision += 1;

                    multiUpdate[i].profileRevision = otherProfiles[i].rvn;
                    multiUpdate[i].profileCommandRevision = otherProfiles[i].commandRevision;

                    await DatabaseManager.saveProfile(accountId, otherProfiles[i].profileId, otherProfiles[i]);
                }
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
            LoggerService.log('error', `CollectExpedition error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;