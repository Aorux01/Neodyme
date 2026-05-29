const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const ShopManager = require('../../src/manager/shop-manager');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const LoggerService = require('../../src/service/logger/logger-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { expensiveRateLimit } = require('../../src/middleware/rate-limit-middleware');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { ROLE_LEVELS, getUserRoleLevel } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;

const VBUCKS_PACKAGES = [1000, 2800, 5000, 13500];

// Records a creator-code commission for a purchase, crediting the creator.
// Returns a summary for the response, or null when no (valid) code was supplied.
const applyCreatorCommission = async (creatorCode, amount, buyerName) => {
    if (!creatorCode) return null;

    const result = await CreatorCodeService.recordUsage(creatorCode, amount);
    if (!result.success || !(result.commission > 0)) return null;

    await DatabaseManager.addVbucks(result.creatorAccountId, result.commission);
    LoggerService.log('info', `Creator code commission: ${result.creatorDisplayName} earned ${result.commission} V-Bucks from ${buyerName}'s purchase`);

    return { code: creatorCode, creatorName: result.creatorDisplayName, amount: result.commission };
};

router.get('/neodyme/api/user/role', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        const roleLevel = getUserRoleLevel(account);

        return WebResponse.ok(res, {
            role: DatabaseManager.getRoleName(roleLevel),
            roleLevel,
            panels: {
                moderation: roleLevel >= ROLE_LEVELS.MODERATOR,
                developer: roleLevel >= ROLE_LEVELS.DEVELOPER,
                admin: roleLevel >= ROLE_LEVELS.ADMIN
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get user role', error);
    }
});

router.get('/neodyme/api/user/vbucks', verifyToken, async (req, res) => {
    try {
        const balance = await DatabaseManager.getVbucksBalance(req.user.accountId);
        return WebResponse.ok(res, { balance, currency: 'V-Bucks' });
    } catch (error) {
        return WebResponse.serverError(res, 'get vbucks balance', error);
    }
});

router.get('/neodyme/api/user/purchases', verifyToken, async (req, res) => {
    try {
        const purchases = await DatabaseManager.getUserPurchaseHistory(req.user.accountId);
        return WebResponse.ok(res, { purchases });
    } catch (error) {
        return WebResponse.serverError(res, 'get purchases', error);
    }
});

router.put('/neodyme/api/user/settings', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { language, region, privacy } = req.body;
        const current = await DatabaseManager.getUserSettings(req.user.accountId);

        const settings = {
            language: language || current.language,
            region: region || current.region,
            privacy: privacy ? { ...current.privacy, ...privacy } : current.privacy
        };

        await DatabaseManager.saveUserSettings(req.user.accountId, settings);
        return WebResponse.ok(res, { message: 'Settings saved successfully.', settings });
    } catch (error) {
        return WebResponse.serverError(res, 'save settings', error);
    }
});

router.get('/neodyme/api/users/search', verifyToken, async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        if (!q || q.length < 2) {
            return WebResponse.badRequest(res, 'Search query must be at least 2 characters.');
        }

        const users = await DatabaseManager.searchUsers(q, parseInt(limit, 10));
        return WebResponse.ok(res, { users: users.filter(u => u.accountId !== req.user.accountId) });
    } catch (error) {
        return WebResponse.serverError(res, 'search users', error);
    }
});

router.get('/neodyme/api/users/:accountId', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.params.accountId);
        if (!account) {
            return WebResponse.notFound(res, 'Account not found.');
        }

        return WebResponse.ok(res, {
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                lastLogin: account.lastLogin,
                created: account.created
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get user', error);
    }
});

router.post('/neodyme/api/purchase/vbucks', expensiveRateLimit(), verifyToken, csrfProtection, async (req, res) => {
    try {
        const { packageAmount, price, paymentMethod, creatorCode } = req.body;

        if (!packageAmount || !price || !VBUCKS_PACKAGES.includes(packageAmount)) {
            return WebResponse.badRequest(res, 'Invalid V-Bucks package.');
        }

        await DatabaseManager.processVbucksPurchase(req.user.accountId, packageAmount, price, paymentMethod);
        const commission = await applyCreatorCommission(creatorCode, packageAmount, req.user.displayName);

        LoggerService.log('info', `V-Bucks purchase: ${req.user.accountId} purchased ${packageAmount} V-Bucks for $${price}`);
        return WebResponse.ok(res, {
            message: 'Purchase successful.',
            vbucksAdded: packageAmount,
            totalPaid: price,
            creatorSupported: commission
        });
    } catch (error) {
        return WebResponse.serverError(res, 'vbucks purchase', error);
    }
});

router.post('/neodyme/api/purchase/item', expensiveRateLimit(), verifyToken, csrfProtection, async (req, res) => {
    try {
        const { itemKey, creatorCode } = req.body;
        if (!itemKey) {
            return WebResponse.badRequest(res, 'Item key is required.');
        }

        const shopData = await ShopManager.getShopData();
        const item = shopData[itemKey];
        if (!item) {
            return WebResponse.badRequest(res, 'Item not found in the current shop.');
        }

        const itemPrice = item.price || 0;
        const balance = await DatabaseManager.getVbucksBalance(req.user.accountId);
        if (balance < itemPrice) {
            return WebResponse.conflict(res, 'Insufficient V-Bucks.');
        }

        const purchase = await DatabaseManager.processItemPurchase(req.user.accountId, itemKey, item);
        if (!purchase.success) {
            return WebResponse.serverError(res, 'item purchase', new Error('processItemPurchase failed'));
        }

        const commission = await applyCreatorCommission(creatorCode, itemPrice, req.user.displayName);

        LoggerService.log('info', `Item purchase: ${req.user.accountId} purchased ${itemKey} for ${itemPrice} V-Bucks`);
        return WebResponse.ok(res, {
            message: 'Item purchased successfully.',
            item: itemKey,
            price: itemPrice,
            newBalance: purchase.newBalance,
            purchaseId: purchase.purchaseId,
            creatorSupported: commission
        });
    } catch (error) {
        return WebResponse.serverError(res, 'item purchase', error);
    }
});

router.post('/neodyme/api/purchase/refund', expensiveRateLimit(), verifyToken, csrfProtection, async (req, res) => {
    try {
        const { purchaseId } = req.body;
        if (!purchaseId) {
            return WebResponse.badRequest(res, 'Purchase id is required.');
        }

        const refund = await DatabaseManager.processPurchaseRefund(req.user.accountId, purchaseId);
        if (!refund.success) {
            return WebResponse.conflict(res, refund.message || 'Refund could not be processed.');
        }

        LoggerService.log('info', `Purchase refund: ${req.user.accountId} refunded purchase ${purchaseId}`);
        return WebResponse.ok(res, {
            message: 'Refund processed successfully.',
            vbucksRefunded: refund.refundAmount,
            newBalance: refund.newBalance
        });
    } catch (error) {
        return WebResponse.serverError(res, 'refund', error);
    }
});

module.exports = router;
