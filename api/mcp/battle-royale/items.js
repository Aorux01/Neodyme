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

router.get("/api/locker/v4/:deploymentId/account/:accountId/items",
    MCPMiddleware.validateAccountOwnership,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const deploymentId = req.params.deploymentId;

            const profile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            if (!profile.stats.attributes.loadout_presets) {
                profile.stats.attributes.loadout_presets = {};
                profile.rvn += 1;
                profile.commandRevision += 1;
                await DatabaseManager.saveProfile(accountId, 'athena', profile);
            }

            const response = {
                activeLoadoutGroup: {
                    accountId: accountId,
                    athenaItemId: "lawinsathenaitemidlol",
                    creationTime: new Date().toISOString(),
                    deploymentId: deploymentId,
                    loadouts: {}
                },
                loadoutGroupPresets: [],
                loadoutPresets: []
            };

            for (const cosmeticLoadout in profile.stats.attributes.loadout_presets) {
                for (const loadout in profile.stats.attributes.loadout_presets[cosmeticLoadout]) {
                    const loadoutId = profile.stats.attributes.loadout_presets[cosmeticLoadout][loadout];
                    const loadoutItem = profile.items[loadoutId];
                    const date = new Date().toISOString();

                    const activeCosmeticLoadout = {
                        loadoutSlots: [],
                        shuffleType: "DISABLED"
                    };

                    const loadoutToAdd = {
                        deploymentId: deploymentId,
                        accountId: accountId,
                        loadoutType: loadoutItem.templateId,
                        loadoutShuffleType: "DISABLED",
                        athenaItemId: loadoutId,
                        creationTime: date,
                        updatedTime: date,
                        loadoutSlots: []
                    };

                    const slots = loadoutItem.attributes.slots;
                    for (const slot of slots) {
                        const slotToAdd = {
                            slotTemplate: slot.slot_template,
                            equippedItemId: slot.equipped_item,
                            itemCustomizations: []
                        };

                        if (slot.customization_info) {
                            for (const customization of slot.customization_info) {
                                const customizationToAdd = {
                                    channelTag: customization.channel_tag,
                                    variantTag: customization.variant_tag,
                                    additionalData: customization.additional_data
                                };
                                slotToAdd.itemCustomizations.push(customizationToAdd);
                            }
                        }

                        loadoutToAdd.loadoutSlots.push(slotToAdd);
                        activeCosmeticLoadout.loadoutSlots.push(slotToAdd);
                    }

                    response.loadoutPresets.push(loadoutToAdd);
                    response.activeLoadoutGroup.loadouts[loadoutItem.templateId] = activeCosmeticLoadout;
                }
            }

            res.json(response);
        } catch (error) {
            LoggerService.log('error', `Get locker v4 items error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;