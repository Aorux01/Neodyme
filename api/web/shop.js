const express = require('express');
const router = express.Router();
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const ShopManager = require('../../src/manager/shop-manager');
const { expensiveRateLimit } = require('../../src/middleware/rate-limit-middleware');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const ShopImageGenerator = require('../../src/service/shop/shop-image-generator');

router.get('/*shop/image', async (req, res) => {
    try {
        const image = await ShopImageGenerator.generateShopImage();
        if (!image) {
            return res.status(404).json({ success: false, message: 'No shop data available' });
        }

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.setHeader('Content-Disposition', 'inline; filename="shop.svg"');
        res.send(image);
    } catch (error) {
        LoggerService.log('error', 'Shop image generation error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/*shop', async (req, res) => {
    try {
        const shopData = await ShopManager.getShopData();
        const state = await ShopManager.getShopState();

        // Enrich items with image URLs from shop_state.json (state[key] = imageUrl)
        const enrichedShop = {};
        for (const [key, val] of Object.entries(shopData)) {
            if (key.startsWith('//') || !val || typeof val !== 'object') {
                enrichedShop[key] = val;
                continue;
            }
            const stateImage = state[key];
            enrichedShop[key] = {
                ...val,
                meta: {
                    ...(val.meta || {}),
                    image: val.meta?.image || stateImage || null
                }
            };
        }

        const items = Object.keys(shopData).filter(key => !key.startsWith('//'));
        const dailyItems = items.filter(key => key.startsWith('daily'));
        const featuredItems = items.filter(key => key.startsWith('featured'));

        // Calculate lastRotation/nextRotation from categories
        const categoryStates = Object.values(state.categories || {});
        const lastRotation = categoryStates.reduce((latest, cat) => {
            if (!cat.lastRotation) return latest;
            return !latest || cat.lastRotation > latest ? cat.lastRotation : latest;
        }, null);
        const nextRotation = categoryStates.reduce((earliest, cat) => {
            if (!cat.nextRotation) return earliest;
            return !earliest || cat.nextRotation < earliest ? cat.nextRotation : earliest;
        }, null);

        res.json({
            success: true,
            shop: enrichedShop,
            metadata: {
                totalItems: items.length,
                dailyCount: dailyItems.length,
                featuredCount: featuredItems.length,
                lastRotation,
                nextRotation
            }
        });
    } catch (error) {
        LoggerService.log('error', 'Shop API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/*shop/status', async (req, res) => {
    try {
        const state = await ShopManager.getShopState();
        const categoryStates = Object.values(state.categories || {});
        const lastRotation = categoryStates.reduce((latest, cat) => {
            if (!cat.lastRotation) return latest;
            return !latest || cat.lastRotation > latest ? cat.lastRotation : latest;
        }, null);
        const nextRotation = categoryStates.reduce((earliest, cat) => {
            if (!cat.nextRotation) return earliest;
            return !earliest || cat.nextRotation < earliest ? cat.nextRotation : earliest;
        }, null);
        res.json({
            success: true,
            lastRotation,
            nextRotation
        });
    } catch (error) {
        LoggerService.log('error', 'Shop status API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/*shop/config', async (req, res) => {
    try {
        const shopConfig = ShopManager.getShopConfig();
        res.json({
            success: true,
            shopCategories: shopConfig.shopCategories || { daily: {}, featured: {} }
        });
    } catch (error) {
        LoggerService.log('error', 'Shop config API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/*shop/items', async (req, res) => {
    try {
        const shopData = await ShopManager.getShopData();

        const items = Object.keys(shopData)
            .filter(key => !key.startsWith('//'))
            .map(key => {
                const item = shopData[key];
                const [type, id] = item.itemGrants[0]?.split(':') || ['Unknown', 'Unknown'];
                return {
                    key: key,
                    id: id,
                    type: type,
                    price: item.price,
                    category: key.startsWith('daily') ? 'daily' : 'featured'
                };
            });

        res.json({ success: true, items, count: items.length });
    } catch (error) {
        LoggerService.log('error', 'Shop items API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/*shop/rotate', expensiveRateLimit(), csrfProtection, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return sendError(res, Errors.Authentication.invalidHeader());
        }

        await ShopManager.forceRotation();
        LoggerService.log('info', 'Shop manually rotated via API');

        res.json({ success: true, message: 'Shop rotated successfully' });
    } catch (error) {
        LoggerService.log('error', 'Shop rotation API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
