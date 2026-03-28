const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const DatabaseManager = require('../../../src/manager/database-manager');
const ConfigManager = require('../../../src/manager/config-manager');
const LoggerService = require('../../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');

router.use(MCPMiddleware.validateProfileId);

router.post(
    '/fortnite/api/game/v2/profile/:accountId/client/PurchaseMultipleCatalogEntries',
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const { purchaseInfoList } = req.body;
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'common_core';
            const queryRevision = parseInt(req.query.rvn) || -1;

            if (!Array.isArray(purchaseInfoList) || purchaseInfoList.length === 0) {
                return sendError(res, Errors.custom(
                    'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed',
                    'purchaseInfoList is missing or empty.',
                    [], 16000, 400
                ));
            }

            const port = ConfigManager.get('port');
            const baseUrl = `http://127.0.0.1:${port}`;

            // Forward the original auth header so the sub-request passes authentication
            const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';

            const allChanges = [];
            const allMultiUpdates = [];
            const allNotifications = [];
            let lastRevision = queryRevision;
            let lastProfile = null;

            for (const purchaseInfo of purchaseInfoList) {
                const {
                    offerId,
                    purchaseQuantity = 1,
                    currency = '',
                    currencySubType = '',
                    expectedTotalPrice = 0,
                    gameContext = ''
                } = purchaseInfo;

                if (!offerId) {
                    LoggerService.log('warn', `PurchaseMultipleCatalogEntries: skipping entry with missing offerId`);
                    continue;
                }

                let subRes;
                try {
                    const fetchUrl = `${baseUrl}/fortnite/api/game/v2/profile/${accountId}/client/PurchaseCatalogEntry?profileId=${profileId}&rvn=${lastRevision}`;

                    const response = await fetch(fetchUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': authHeader,
                            'User-Agent': req.headers['user-agent'] || '',
                            // Carry over correlation id if present
                            ...(req.headers['x-epic-correlation-id'] ? { 'X-Epic-Correlation-ID': req.headers['x-epic-correlation-id'] } : {})
                        },
                        body: JSON.stringify({
                            offerId,
                            purchaseQuantity,
                            currency,
                            currencySubType,
                            expectedTotalPrice,
                            gameContext
                        })
                    });

                    subRes = await response.json();

                    if (!response.ok) {
                        // Propagate the first error that blocks the batch
                        return res.status(response.status).json(subRes);
                    }
                } catch (fetchErr) {
                    LoggerService.log('error', `PurchaseMultipleCatalogEntries: sub-request failed for offerId "${offerId}": ${fetchErr.message}`);
                    return sendError(res, Errors.Internal.serverError());
                }

                // Merge results from this purchase into the aggregate
                if (Array.isArray(subRes.profileChanges)) {
                    allChanges.push(...subRes.profileChanges);
                }
                if (Array.isArray(subRes.multiUpdate)) {
                    for (const update of subRes.multiUpdate) {
                        const existing = allMultiUpdates.find(u => u.profileId === update.profileId);
                        if (existing) {
                            existing.profileChanges.push(...(update.profileChanges || []));
                            existing.profileRevision = update.profileRevision;
                            existing.profileCommandRevision = update.profileCommandRevision;
                        } else {
                            allMultiUpdates.push({ ...update, profileChanges: [...(update.profileChanges || [])] });
                        }
                    }
                }
                if (Array.isArray(subRes.notifications)) {
                    allNotifications.push(...subRes.notifications);
                }

                lastRevision = subRes.profileRevision ?? lastRevision;
                lastProfile = subRes;
            }

            // Build final aggregated response using the last profile revision
            const profile = await DatabaseManager.getProfile(accountId, profileId);

            res.json({
                profileRevision: profile?.rvn ?? lastRevision,
                profileId: profileId,
                profileChangesBaseRevision: queryRevision,
                profileChanges: allChanges,
                notifications: allNotifications,
                profileCommandRevision: profile?.commandRevision ?? (lastProfile?.profileCommandRevision ?? 0),
                serverTime: new Date().toISOString(),
                multiUpdate: allMultiUpdates,
                responseVersion: 1
            });
        } catch (error) {
            LoggerService.log('error', `PurchaseMultipleCatalogEntries error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

module.exports = router;
