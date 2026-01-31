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

router.post("/fortnite/api/game/v2/profile/:accountId/client/RefundMtxPurchase",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'common_core';
            const queryRevision = req.query.rvn || -1;
            const { purchaseId } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            const athenaProfile = await DatabaseManager.getProfile(accountId, 'athena');
            
            if (!profile || !athenaProfile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            const changes = [];
            const multiUpdate = [];
            const itemGuids = [];

            if (purchaseId) {
                multiUpdate.push({
                    profileRevision: athenaProfile.rvn || 0,
                    profileId: 'athena',
                    profileChangesBaseRevision: athenaProfile.rvn || 0,
                    profileChanges: [],
                    profileCommandRevision: athenaProfile.commandRevision || 0
                });

                profile.stats.attributes.mtx_purchase_history.refundsUsed += 1;
                profile.stats.attributes.mtx_purchase_history.refundCredits -= 1;

                for (const purchase of profile.stats.attributes.mtx_purchase_history.purchases) {
                    if (purchase.purchaseId === purchaseId) {
                        for (const lootItem of purchase.lootResult) {
                            itemGuids.push(lootItem.itemGuid);
                        }

                        purchase.refundDate = new Date().toISOString();

                        for (const key in profile.items) {
                            if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() || 
                                    profile.items[key].attributes.platform.toLowerCase() === "shared") {
                                    
                                    profile.items[key].quantity += purchase.totalMtxPaid;

                                    await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                        quantity: profile.items[key].quantity
                                    });

                                    changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                    break;
                                }
                            }
                        }
                    }
                }

                for (const itemGuid of itemGuids) {
                    try {
                        if (athenaProfile.items[itemGuid]) {
                            delete athenaProfile.items[itemGuid];

                            await DatabaseManager.removeItemFromProfile(accountId, 'athena', itemGuid);

                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(itemGuid));
                        }
                    } catch (err) {
                        LoggerService.log('warn', `Failed to remove item ${itemGuid}: ${err.message}`);
                    }
                }

                athenaProfile.rvn += 1;
                athenaProfile.commandRevision += 1;
                profile.rvn += 1;
                profile.commandRevision += 1;

                await DatabaseManager.updateProfileStats(accountId, profileId, {
                    'attributes.mtx_purchase_history': profile.stats.attributes.mtx_purchase_history
                });

                changes.push(MCPResponseBuilder.createStatChange('mtx_purchase_history', profile.stats.attributes.mtx_purchase_history));

                multiUpdate[0].profileRevision = athenaProfile.rvn;
                multiUpdate[0].profileCommandRevision = athenaProfile.commandRevision;

                await DatabaseManager.saveProfile(accountId, profileId, profile);
                await DatabaseManager.saveProfile(accountId, 'athena', athenaProfile);
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                res.json({
                    profileRevision: profile.rvn,
                    profileId: profileId,
                    profileChangesBaseRevision: profile.rvn - 1,
                    profileChanges: changes,
                    profileCommandRevision: profile.commandRevision,
                    serverTime: new Date().toISOString(),
                    multiUpdate: multiUpdate,
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `RefundMtxPurchase error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;