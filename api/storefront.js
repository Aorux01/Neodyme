const express = require('express');
const router = express.Router();
const ShopService = require('../src/services/ShopService');
const VersionService = require('../src/services/VersionService');
const AuthService = require('../src/services/AuthService');
const { Errors, sendError } = require('../src/errors/errors');
const chalk = require('chalk');
const { LoggerService } = require('../src/utils/logger');
const TokenService = require('../src/services/TokenService');

const requireAuth = TokenService.createVerificationMiddleware();
const c = chalk;

// Get item shop catalog
router.get('/fortnite/api/storefront/v2/catalog', requireAuth, async (req, res) => {
    try {
        const userAgent = req.headers['user-agent'] || '';
        
        // Check for specific version blocks
        if (userAgent.includes('2870186')) {
            return res.status(404).end();
        }

        const versionInfo = VersionService.getVersionInfo(req);
        const catalog = await ShopService.getItemShop(versionInfo);
        
        res.json(catalog);
    } catch (error) {
        LoggerService.log('error', `Error getting item shop: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Get keychain
router.get('/fortnite/api/storefront/v2/keychain', requireAuth, async (req, res) => {
    try {
        const keychain = await ShopService.getKeychain();
        res.json(keychain);
    } catch (error) {
        LoggerService.log('error', `Error getting keychain: ${error}`);
        res.json([]);
    }
});

// Get bulk offers (empty for now)
router.get('/catalog/api/shared/bulk/offers', requireAuth, (req, res) => {
    res.json({});
});

// Purchase catalog entry
router.post('/fortnite/api/game/v2/profile/:accountId/client/PurchaseCatalogEntry', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const { offerId, purchaseQuantity, expectedTotalPrice, currency } = req.body;

        if (!offerId || !expectedTotalPrice) {
            throw Errors.Basic.badRequest();
        }

        if (currency && currency !== "MtxCurrency") {
            throw Errors.GameCatalog.invalidParameter();
        }

        const ProfileService = require('../src/services/ProfileService');
        const result = await ShopService.purchaseItem(
            req.params.accountId,
            offerId,
            expectedTotalPrice,
            ProfileService
        );

        // Format response as MCP command
        const profileId = req.query.profileId || 'common_core';
        const rvn = parseInt(req.query.rvn || -1);
        
        const profile = await ProfileService.getProfile(req.params.accountId, profileId, rvn);

        res.json({
            profileRevision: profile.rvn,
            profileId: profileId,
            profileChangesBaseRevision: profile.rvn - 1,
            profileChanges: [
                {
                    changeType: "statModified",
                    name: "mtx_purchase_history",
                    value: {
                        purchases: [{
                            purchaseId: result.purchaseId,
                            offerId: result.offerId,
                            purchaseDate: new Date().toISOString(),
                            totalPrice: result.totalPrice,
                            lootResult: result.purchasedItems.map(item => ({
                                itemType: item.item.templateId,
                                itemGuid: item.itemId,
                                quantity: item.item.quantity
                            }))
                        }]
                    }
                }
            ],
            notifications: [
                {
                    type: "CatalogPurchase",
                    primary: true,
                    lootResult: {
                        items: result.purchasedItems.map(item => ({
                            itemType: item.item.templateId,
                            itemGuid: item.itemId,
                            itemProfile: "athena",
                            quantity: item.item.quantity
                        }))
                    }
                }
            ],
            profileCommandRevision: profile.commandRevision,
            serverTime: new Date().toISOString(),
            responseVersion: 1
        });
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            LoggerService.log('error', `Purchase error: ${error}`);
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Gift catalog entry
router.post('/fortnite/api/game/v2/profile/:accountId/client/GiftCatalogEntry', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const { offerId, receiverAccountIds, giftWrapTemplateId, personalMessage } = req.body;

        if (!offerId || !receiverAccountIds || receiverAccountIds.length === 0) {
            throw Errors.Basic.badRequest();
        }

        // For now, return a basic success response
        res.json({
            profileRevision: 1,
            profileId: "common_core",
            profileChangesBaseRevision: 1,
            profileChanges: [],
            notifications: [
                {
                    type: "GiftSent",
                    primary: true,
                    giftData: {
                        offerId: offerId,
                        receiverAccountIds: receiverAccountIds
                    }
                }
            ],
            profileCommandRevision: 1,
            serverTime: new Date().toISOString(),
            responseVersion: 1
        });
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Admin endpoints (protected)
router.post('/api/admin/shop/refresh', requireAuth, async (req, res) => {
    try {
        // Check if user is admin (implement your own admin check)
        await ShopService.refreshShop();
        res.json({ success: true, message: 'Shop refreshed successfully' });
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/admin/shop/item', requireAuth, async (req, res) => {
    try {
        const { storefront, item } = req.body;
        await ShopService.addItemToShop(storefront, item);
        res.json({ success: true });
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/admin/shop/item/:offerId', requireAuth, async (req, res) => {
    try {
        const success = await ShopService.removeItemFromShop(req.params.offerId);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Offer not found' });
        }
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
});

router.patch('/api/admin/shop/item/:offerId/price', requireAuth, async (req, res) => {
    try {
        const { price } = req.body;
        const success = await ShopService.updateItemPrice(req.params.offerId, price);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Offer not found' });
        }
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;