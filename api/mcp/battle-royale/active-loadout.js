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

router.put("/api/locker/v3/:deploymentId/loadout/:loadoutType/account/:accountId/active-loadout",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const deploymentId = req.params.deploymentId;
            const { loadoutType, athenaItemId, loadoutSlots, presetIndex } = req.body;
            const date = new Date().toISOString();

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const loadoutData = { slots: [] };

            for (const slot of loadoutSlots) {
                const slotToAdd = {};
                
                if (slot.slotTemplate) {
                    slotToAdd.slot_template = slot.slotTemplate;
                }
                if (slot.equippedItemId) {
                    slotToAdd.equipped_item = slot.equippedItemId;
                }

                if (slot.itemCustomizations) {
                    slotToAdd.customization_info = [];
                    
                    for (const customization of slot.itemCustomizations) {
                        const customizationToAdd = {};
                        
                        if (customization.channelTag) {
                            customizationToAdd.channel_tag = customization.channelTag;
                        }
                        if (customization.variantTag) {
                            customizationToAdd.variant_tag = customization.variantTag;
                        }
                        if (customization.additionalData) {
                            customizationToAdd.additional_data = customization.additionalData;
                        }
                        
                        slotToAdd.customization_info.push(customizationToAdd);
                    }
                }

                loadoutData.slots.push(slotToAdd);
            }

            if (!profile.stats.attributes.loadout_presets) {
                profile.stats.attributes.loadout_presets = {};
            }

            if (!profile.stats.attributes.loadout_presets[loadoutType]) {
                const newLoadoutId = DatabaseManager.generateItemId();

                await DatabaseManager.addItemToProfile(accountId, 'athena', newLoadoutId, {
                    templateId: loadoutType,
                    attributes: {},
                    quantity: 1
                });

                profile.items[newLoadoutId] = {
                    templateId: loadoutType,
                    attributes: {},
                    quantity: 1
                };

                profile.stats.attributes.loadout_presets[loadoutType] = {
                    [presetIndex]: newLoadoutId
                };
            }

            try {
                const loadoutGuid = profile.stats.attributes.loadout_presets[loadoutType][presetIndex];
                
                await DatabaseManager.updateItemInProfile(accountId, 'athena', loadoutGuid, {
                    attributes: loadoutData
                });

                profile.items[loadoutGuid].attributes = loadoutData;
            } catch (err) {}

            for (const slot of loadoutData.slots) {
                if (slot.customization_info) {
                    for (const itemId in profile.items) {
                        const item = profile.items[itemId];
                        
                        if (item.templateId.toLowerCase() === slot.equipped_item.toLowerCase()) {
                            if (!item.attributes.variants) {
                                item.attributes.variants = [];
                            }

                            for (const customization of slot.customization_info) {
                                let found = false;
                                
                                for (const variant of item.attributes.variants) {
                                    if (customization.channel_tag === variant.channel) {
                                        variant.active = `${customization.variant_tag}.${customization.additional_data}`;
                                        found = true;
                                        break;
                                    }
                                }

                                if (!found) {
                                    item.attributes.variants.push({
                                        channel: customization.channel_tag,
                                        active: `${customization.variant_tag}.${customization.additional_data}`,
                                        owned: []
                                    });
                                }
                            }

                            await DatabaseManager.updateItemInProfile(accountId, 'athena', itemId, {
                                'attributes.variants': item.attributes.variants
                            });
                        }
                    }
                }
            }

            profile.rvn += 1;
            profile.commandRevision += 1;

            await DatabaseManager.saveProfile(accountId, 'athena', profile);

            const response = {
                deploymentId: deploymentId,
                accountId: accountId,
                loadoutType: loadoutType,
                loadoutShuffleType: "DISABLED",
                athenaItemId: athenaItemId,
                creationTime: date,
                updatedTime: date,
                loadoutSlots: loadoutSlots
            };

            res.json(response);
        } catch (error) {
            LoggerService.log('error', `Set locker v3 active loadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;