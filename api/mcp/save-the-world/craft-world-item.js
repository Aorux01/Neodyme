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

router.post("/fortnite/api/game/v2/profile/:accountId/client/CraftWorldItem",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'theater0';
            const queryRevision = req.query.rvn || -1;
            const { targetSchematicItemId, numTimesToCraft, targetSchematicTier } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const versionInfo = VersionService.getVersionInfo(req);
            let schematicProfileId = 'campaign';
            
            if (versionInfo.season >= 4 || versionInfo.build === 3.5 || versionInfo.build === 3.6) {
                schematicProfileId = 'campaign';
            } else if (versionInfo.season <= 3) {
                schematicProfileId = 'profile0';
            }

            const schematicProfile = await DatabaseManager.getProfile(accountId, schematicProfileId);

            const changes = [];
            const notifications = [];

            if (targetSchematicItemId) {
                if (!schematicProfile.items[targetSchematicItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                let item = JSON.parse(JSON.stringify(schematicProfile.items[targetSchematicItemId]));

                let itemType = 'Weapon:';
                let itemIdType = 'WID_';
                
                const itemCategory = item.templateId.split("_")[1].split("_")[0].toLowerCase();
                if (itemCategory === "wall" || itemCategory === "floor" || itemCategory === "ceiling") {
                    itemType = "Trap:";
                    itemIdType = "TID_";
                }

                if (item.templateId.toLowerCase().startsWith("schematic:sid_pistol_vacuumtube_auto_")) {
                    item.templateId = `Schematic:SID_Pistol_Auto_VacuumTube_${item.templateId.substring(37)}`;
                }

                if (item.templateId.toLowerCase().startsWith("schematic:sid_launcher_grenade_winter_")) {
                    item.templateId = `Schematic:SID_Launcher_WinterGrenade_${item.templateId.substring(38)}`;
                }

                item.templateId = item.templateId.replace(/schematic:/ig, itemType);
                item.templateId = item.templateId.replace(/sid_/ig, itemIdType);
                item.quantity = numTimesToCraft || 1;

                if (targetSchematicTier) {
                    switch (targetSchematicTier.toLowerCase()) {
                        case "i":
                            if (!item.templateId.toLowerCase().includes("t01")) {
                                item.attributes.level = 10;
                            }
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T01";
                            item.templateId = item.templateId.replace(/_crystal_/ig, "_Ore_");
                            break;

                        case "ii":
                            if (!item.templateId.toLowerCase().includes("t02")) {
                                item.attributes.level = 20;
                            }
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T02";
                            item.templateId = item.templateId.replace(/_crystal_/ig, "_Ore_");
                            break;

                        case "iii":
                            if (!item.templateId.toLowerCase().includes("t03")) {
                                item.attributes.level = 30;
                            }
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T03";
                            item.templateId = item.templateId.replace(/_crystal_/ig, "_Ore_");
                            break;

                        case "iv":
                            if (!item.templateId.toLowerCase().includes("t04")) {
                                item.attributes.level = 40;
                            }
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T04";
                            break;

                        case "v":
                            item.templateId = item.templateId.substring(0, item.templateId.length - 3) + "T05";
                            break;
                    }
                }

                item.attributes = {
                    clipSizeScale: 0,
                    loadedAmmo: 999,
                    level: item.attributes.level || 1,
                    alterationDefinitions: item.attributes.alterations || [],
                    baseClipSize: 999,
                    durability: 375,
                    itemSource: ""
                };

                const itemId = DatabaseManager.generateItemId();
                profile.items[itemId] = item;

                await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

                notifications.push({
                    type: "craftingResult",
                    primary: true,
                    itemsCrafted: [
                        {
                            itemType: item.templateId,
                            itemGuid: itemId,
                            itemProfile: profileId,
                            attributes: {
                                loadedAmmo: item.attributes.loadedAmmo,
                                level: item.attributes.level,
                                alterationDefinitions: item.attributes.alterationDefinitions,
                                durability: item.attributes.durability
                            },
                            quantity: item.quantity
                        }
                    ]
                });

                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.saveProfile(accountId, profileId, profile);
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
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `CraftWorldItem error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;