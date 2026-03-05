const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const ShopManager = require('../../src/manager/shop-manager');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const { expensiveRateLimit } = require('../../src/middleware/rate-limit-middleware');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const WebService = require('../../src/service/api/web-service');
const { ROLE_LEVELS, getUserRoleLevel } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;

router.get('*user/vbucks', verifyToken, csrfProtection, async (req, res) => {
    try {
        const accountId = req.user.accountId;

        const balance = await DatabaseManager.getVbucksBalance(accountId);

        res.json({
            success: true,
            balance: balance,
            currency: 'V-Bucks'
        });
    } catch (error) {
        LoggerService.log('error', `Get V-Bucks balance error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*purchase/vbucks', expensiveRateLimit(), verifyToken, csrfProtection, async (req, res) => {
    try {
        const { packageAmount, price, paymentMethod, creatorCode } = req.body;
        const accountId = req.user.accountId;

        if (!packageAmount || !price) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const validPackages = [1000, 2800, 5000, 13500];
        if (!validPackages.includes(packageAmount)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        let bonus = 0;
        switch(packageAmount) {
            case 1000: bonus = 0; break;
            case 2800: bonus = 300; break;
            case 5000: bonus = 800; break;
            case 13500: bonus = 1500; break;
        }

        const totalVbucks = packageAmount;

        await DatabaseManager.processVbucksPurchase(accountId, totalVbucks, price, paymentMethod);

        let creatorCommission = null;
        if (creatorCode) {
            const commissionResult = await CreatorCodeService.recordUsage(creatorCode, packageAmount);
            if (commissionResult.success && commissionResult.commission > 0) {
                await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                creatorCommission = {
                    code: creatorCode,
                    creatorName: commissionResult.creatorDisplayName,
                    amount: commissionResult.commission
                };
                LoggerService.log('info', `Creator code commission: ${commissionResult.creatorDisplayName} earned ${commissionResult.commission} V-Bucks from ${req.user.displayName}'s purchase`);
            }
        }

        LoggerService.log('info', `V-Bucks purchase: ${accountId} purchased ${totalVbucks} V-Bucks for $${price}`);

        res.json({
            success: true,
            message: 'Purchase successful',
            vbucksAdded: totalVbucks,
            baseAmount: packageAmount,
            bonusAmount: bonus,
            totalPaid: price,
            creatorSupported: creatorCommission
        });

    } catch (error) {
        LoggerService.log('error', `V-Bucks purchase error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*purchase/item', expensiveRateLimit(), verifyToken, csrfProtection, async (req, res) => {
    try {
        const { itemKey, creatorCode } = req.body;
        const accountId = req.user.accountId;

        if (!itemKey) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const shopData = await ShopManager.getShopData();
        const item = shopData[itemKey];

        if (!item) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const itemPrice = item.price || 0;

        const userBalance = await DatabaseManager.getVbucksBalance(accountId);
        if (userBalance < itemPrice) {
            return sendError(res, Errors.Economy.insufficientFunds());
        }

        const purchaseResult = await DatabaseManager.processItemPurchase(accountId, itemKey, item);

        if (!purchaseResult.success) {
            return sendError(res, Errors.Economy.purchaseFailed());
        }

        let creatorCommission = null;
        if (creatorCode) {
            const commissionResult = await CreatorCodeService.recordUsage(creatorCode, itemPrice);
            if (commissionResult.success && commissionResult.commission > 0) {
                await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                creatorCommission = {
                    code: creatorCode,
                    creatorName: commissionResult.creatorDisplayName,
                    amount: commissionResult.commission
                };
                LoggerService.log('info', `Creator code commission: ${commissionResult.creatorDisplayName} earned ${commissionResult.commission} V-Bucks from ${req.user.displayName}'s item purchase`);
            }
        }

        LoggerService.log('info', `Item purchase: ${accountId} purchased ${itemKey} for ${itemPrice} V-Bucks`);

        res.json({
            success: true,
            message: 'Item purchased successfully',
            item: itemKey,
            price: itemPrice,
            newBalance: purchaseResult.newBalance,
            purchaseId: purchaseResult.purchaseId,
            creatorSupported: creatorCommission
        });

    } catch (error) {
        LoggerService.log('error', `Item purchase error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*purchase/refund', expensiveRateLimit(), verifyToken, csrfProtection, async (req, res) => {
    try {
        const { purchaseId } = req.body;
        const accountId = req.user.accountId;

        if (!purchaseId) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const refundResult = await DatabaseManager.processPurchaseRefund(accountId, purchaseId);

        if (!refundResult.success) {
            return sendError(res, Errors.Economy.refundFailed());
        }

        LoggerService.log('info', `Purchase refund: ${accountId} refunded purchase ${purchaseId}`);

        res.json({
            success: true,
            message: 'Refund processed successfully',
            vbucksRefunded: refundResult.refundAmount,
            newBalance: refundResult.newBalance
        });

    } catch (error) {
        LoggerService.log('error', `Refund error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('*user/purchases', verifyToken, csrfProtection, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const purchases = await DatabaseManager.getUserPurchaseHistory(accountId);

        res.json({
            success: true,
            purchases: purchases
        });

    } catch (error) {
        LoggerService.log('error', `Get purchases error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('*users/search', verifyToken, async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.length < 2) {
            return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
        }

        const users = await DatabaseManager.searchUsers(q, parseInt(limit));

        res.json({
            success: true,
            users: users.filter(u => u.accountId !== req.user.accountId)
        });

    } catch (error) {
        LoggerService.log('error', `Search users error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('*user/settings', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { language, region, privacy } = req.body;

        const currentSettings = await DatabaseManager.getUserSettings(req.user.accountId);
        const newSettings = {
            language: language || currentSettings.language,
            region: region || currentSettings.region,
            privacy: privacy ? { ...currentSettings.privacy, ...privacy } : currentSettings.privacy
        };

        await DatabaseManager.saveUserSettings(req.user.accountId, newSettings);

        res.json({ success: true, message: 'Settings saved successfully', settings: newSettings });
    } catch (error) {
        LoggerService.log('error', `Save settings error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('*users/:accountId', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;

        const account = await DatabaseManager.getAccount(accountId);

        if (!account) {
            return sendError(res, Errors.Account.accountNotFound(accountId));
        }

        res.json({
            success: true,
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                email: `${account.displayName}@neodyme.local`,
                lastLogin: account.lastLogin,
                created: account.created
            }
        });

    } catch (error) {
        LoggerService.log('error', `Get user error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/user/role', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        const roleLevel = getUserRoleLevel(account);
        const roleName = DatabaseManager.getRoleName(roleLevel);

        const panels = {
            moderation: roleLevel === ROLE_LEVELS.MODERATOR || roleLevel >= ROLE_LEVELS.ADMIN,
            developer: roleLevel === ROLE_LEVELS.DEVELOPER || roleLevel >= ROLE_LEVELS.ADMIN,
            admin: roleLevel >= ROLE_LEVELS.ADMIN
        };

        res.json({
            success: true,
            role: roleName,
            roleLevel: roleLevel,
            panels
        });
    } catch (error) {
        LoggerService.log('error', `Get user role error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
