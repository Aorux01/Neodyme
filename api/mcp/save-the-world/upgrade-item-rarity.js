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

router.post("/fortnite/api/game/v2/profile/:accountId/client/UpgradeItemRarity",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'campaign';
            const queryRevision = req.query.rvn || -1;
            const { targetItemId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const notifications = [];

            if (targetItemId) {
                if (!profile.items[targetItemId]) {
                    const err = Errors.MCP.itemNotFound();
                    return res.status(err.statusCode).json(err.toJSON());
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("_vr_")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/_vr_/ig, "_SR_");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("_r_")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/_r_/ig, "_VR_");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("_uc_")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/_uc_/ig, "_R_");
                }

                if (profile.items[targetItemId].templateId.toLowerCase().includes("_c_")) {
                    profile.items[targetItemId].templateId = profile.items[targetItemId].templateId.replace(/_c_/ig, "_UC_");
                }

                const newItemId = DatabaseManager.generateItemId();
                profile.items[newItemId] = profile.items[targetItemId];

                await DatabaseManager.addItemToProfile(accountId, profileId, newItemId, profile.items[newItemId]);

                changes.push(MCPResponseBuilder.createItemAdded(newItemId, profile.items[newItemId]));

                delete profile.items[targetItemId];

                await DatabaseManager.removeItemFromProfile(accountId, profileId, targetItemId);

                changes.push(MCPResponseBuilder.createItemRemoved(targetItemId));

                notifications.push([{
                    type: "upgradeItemRarityNotification",
                    primary: true,
                    itemsGranted: [
                        {
                            itemType: profile.items[newItemId].templateId,
                            itemGuid: newItemId,
                            itemProfile: profileId,
                            attributes: {
                                level: profile.items[newItemId].attributes.level,
                                alterations: profile.items[newItemId].attributes.alterations || []
                            },
                            quantity: 1
                        }
                    ]
                }]);

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
            LoggerService.log('error', `UpgradeItemRarity error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;