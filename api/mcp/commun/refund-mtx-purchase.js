const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const LoggerService = require('../../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');

router.use(MCPMiddleware.validateProfileId);

function mapRefundError(message) {
    switch (message) {
        case 'No purchase history found':
        case 'Purchase not found':
            return Errors.custom(
                'errors.com.epicgames.modules.gamesubcatalog.invalid_purchase_info',
                message,
                [], 16027, 400
            );
        case 'Already refunded':
            return Errors.custom(
                'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed',
                'This purchase has already been refunded.',
                [], 19000, 400
            );
        case 'No refund credits available':
            return Errors.custom(
                'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed',
                'You have no refund tokens remaining.',
                [], 19000, 400
            );
        default:
            return Errors.Internal.serverError();
    }
}

router.post('/fortnite/api/game/v2/profile/:accountId/client/RefundMtxPurchase',
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'common_core';
            const queryRevision = req.query.rvn || -1;
            const { purchaseId } = req.body;

            if (!purchaseId) {
                // No purchaseId - just return current profile state
                const profile = await DatabaseManager.getProfile(accountId, profileId);
                if (!profile) return res.status(404).json(Errors.MCP.profileNotFound(accountId).toJSON());
                return MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            }

            const result = await DatabaseManager.processPurchaseRefund(accountId, purchaseId);

            if (!result.success) {
                return sendError(res, mapRefundError(result.message));
            }

            const changes = [];
            const multiUpdate = [];

            // V-Bucks restored
            if (result.vbucksKey) {
                changes.push(MCPResponseBuilder.createItemQuantityChanged(result.vbucksKey, result.vbucksNewBalance));
            }

            // Cosmetics removed from athena
            if (result.removedItemGuids.length > 0) {
                multiUpdate.push({
                    profileRevision: result.athenaRvn,
                    profileId: 'athena',
                    profileChangesBaseRevision: result.athenaRvn - 1,
                    profileChanges: result.removedItemGuids.map(guid => MCPResponseBuilder.createItemRemoved(guid)),
                    profileCommandRevision: result.athenaCommandRevision
                });
            }

            // Purchase history updated
            changes.push(MCPResponseBuilder.createStatChange('mtx_purchase_history', result.updatedPurchaseHistory));

            res.json({
                profileRevision: result.commonCoreRvn,
                profileId: profileId,
                profileChangesBaseRevision: result.commonCoreRvn - 1,
                profileChanges: changes,
                profileCommandRevision: result.commonCoreCommandRevision,
                serverTime: new Date().toISOString(),
                multiUpdate,
                responseVersion: 1
            });
        } catch (error) {
            LoggerService.log('error', `RefundMtxPurchase error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
);

module.exports = router;
