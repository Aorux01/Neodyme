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

router.post("/fortnite/api/game/v2/profile/:accountId/client/PutModularCosmeticLoadout",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'athena';
            const queryRevision = req.query.rvn || -1;
            const { loadoutType, presetId, loadoutData: loadoutDataStr } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const loadoutData = JSON.parse(loadoutDataStr);

            if (!profile.stats.attributes.loadout_presets) {
                profile.stats.attributes.loadout_presets = {};
                
                changes.push(MCPResponseBuilder.createStatChange('loadout_presets', {}));
            }

            if (!profile.stats.attributes.loadout_presets[loadoutType]) {
                const newLoadoutId = DatabaseManager.generateItemId();

                await DatabaseManager.addItemToProfile(accountId, profileId, newLoadoutId, {
                    templateId: loadoutType,
                    attributes: {},
                    quantity: 1
                });

                profile.items[newLoadoutId] = {
                    templateId: loadoutType,
                    attributes: {},
                    quantity: 1
                };

                changes.push(MCPResponseBuilder.createItemAdded(newLoadoutId, profile.items[newLoadoutId]));

                profile.stats.attributes.loadout_presets[loadoutType] = {
                    [presetId]: newLoadoutId
                };

                changes.push(MCPResponseBuilder.createStatChange('loadout_presets', profile.stats.attributes.loadout_presets));
            }

            try {
                const loadoutGuid = profile.stats.attributes.loadout_presets[loadoutType][presetId];
                
                await DatabaseManager.updateItemInProfile(accountId, profileId, loadoutGuid, {
                    attributes: loadoutData
                });

                profile.items[loadoutGuid].attributes = loadoutData;

                changes.push({
                    changeType: 'itemAttrChanged',
                    itemId: loadoutGuid,
                    attributeName: 'slots',
                    attributeValue: profile.items[loadoutGuid].attributes.slots
                });
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

                            await DatabaseManager.updateItemInProfile(accountId, profileId, itemId, {
                                'attributes.variants': item.attributes.variants
                            });

                            changes.push({
                                changeType: 'itemAttrChanged',
                                itemId: itemId,
                                attributeName: 'variants',
                                attributeValue: item.attributes.variants
                            });
                        }
                    }
                }
            }

            profile.rvn += 1;
            profile.commandRevision += 1;

            await DatabaseManager.saveProfile(accountId, profileId, profile);

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                MCPResponseBuilder.sendResponse(res, profile, changes);
            }
        } catch (error) {
            LoggerService.log('error', `PutModularCosmeticLoadout error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;