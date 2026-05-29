const express = require('express');
const router = express.Router();
const ShopManager = require('../../src/manager/shop-manager');
const ShopImageGenerator = require('../../src/service/shop/shop-image-generator');
const LoggerService = require('../../src/service/logger/logger-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { expensiveRateLimit } = require('../../src/middleware/rate-limit-middleware');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { requireAdmin } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;

// Reduces category rotation timestamps to the most recent and the soonest upcoming.
const getRotationWindow = (state) => {
    const categories = Object.values(state.categories || {});
    const lastRotation = categories.reduce((latest, cat) =>
        cat.lastRotation && (!latest || cat.lastRotation > latest) ? cat.lastRotation : latest, null);
    const nextRotation = categories.reduce((soonest, cat) =>
        cat.nextRotation && (!soonest || cat.nextRotation < soonest) ? cat.nextRotation : soonest, null);
    return { lastRotation, nextRotation };
};

router.get('/neodyme/api/shop/image', async (req, res) => {
    try {
        const image = await ShopImageGenerator.generateShopImage();
        if (!image) {
            return WebResponse.notFound(res, 'No shop data available.');
        }
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.setHeader('Content-Disposition', 'inline; filename="shop.svg"');
        return res.send(image);
    } catch (error) {
        return WebResponse.serverError(res, 'shop image', error);
    }
});

router.get('/neodyme/api/shop/status', async (req, res) => {
    try {
        const state = await ShopManager.getShopState();
        return WebResponse.ok(res, getRotationWindow(state));
    } catch (error) {
        return WebResponse.serverError(res, 'shop status', error);
    }
});

router.get('/neodyme/api/shop/config', async (req, res) => {
    try {
        const shopConfig = ShopManager.getShopConfig();
        return WebResponse.ok(res, {
            shopCategories: shopConfig.shopCategories || { daily: {}, featured: {} }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'shop config', error);
    }
});

router.get('/neodyme/api/shop/items', async (req, res) => {
    try {
        const shopData = await ShopManager.getShopData();
        const items = Object.keys(shopData)
            .filter(key => !key.startsWith('//'))
            .map(key => {
                const item = shopData[key];
                const [type, id] = item.itemGrants?.[0]?.split(':') || ['Unknown', 'Unknown'];
                return {
                    key,
                    id,
                    type,
                    price: item.price,
                    category: key.startsWith('daily') ? 'daily' : 'featured'
                };
            });
        return WebResponse.ok(res, { items, count: items.length });
    } catch (error) {
        return WebResponse.serverError(res, 'shop items', error);
    }
});

router.post('/neodyme/api/shop/rotate', verifyToken, requireAdmin, expensiveRateLimit(), csrfProtection, async (req, res) => {
    try {
        await ShopManager.forceRotation();
        LoggerService.log('info', `Shop manually rotated by ${req.user.displayName}`);
        return WebResponse.ok(res, { message: 'Shop rotated successfully.' });
    } catch (error) {
        return WebResponse.serverError(res, 'shop rotate', error);
    }
});

router.get('/neodyme/api/shop', async (req, res) => {
    try {
        const shopData = await ShopManager.getShopData();
        const state = await ShopManager.getShopState();

        // Enrich items with image URLs from shop state (state[key] = imageUrl).
        const enrichedShop = {};
        for (const [key, val] of Object.entries(shopData)) {
            if (key.startsWith('//') || !val || typeof val !== 'object') {
                enrichedShop[key] = val;
                continue;
            }
            enrichedShop[key] = {
                ...val,
                meta: { ...(val.meta || {}), image: val.meta?.image || state[key] || null }
            };
        }

        const items = Object.keys(shopData).filter(key => !key.startsWith('//'));
        const { lastRotation, nextRotation } = getRotationWindow(state);

        return WebResponse.ok(res, {
            shop: enrichedShop,
            metadata: {
                totalItems: items.length,
                dailyCount: items.filter(key => key.startsWith('daily')).length,
                featuredCount: items.filter(key => key.startsWith('featured')).length,
                lastRotation,
                nextRotation
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'shop', error);
    }
});

module.exports = router;
