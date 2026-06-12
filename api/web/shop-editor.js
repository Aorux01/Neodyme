const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');
const LoggerService = require('../../src/service/logger/logger-service');
const AuditService = require('../../src/service/api/audit-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { requireDeveloper } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;
const dev      = [verifyToken, requireDeveloper];
const devWrite = [verifyToken, requireDeveloper, csrfProtection];

const SHOP_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'shop.json');
const SHOP_DATA_PATH   = path.join(__dirname, '..', '..', 'data',   'shop.json');
const FORTNITE_API_URL = 'https://fortnite-api.com/v2/cosmetics/br';

let cosmeticsCache = null;
let cosmeticsCacheAt = 0;
const COSMETICS_CACHE_MS = 60 * 60 * 1000; // 1h - same as ShopManager

const writeFileAtomic = (filePath, data) => {
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, data, 'utf8');
    fs.renameSync(tempPath, filePath);
};

const loadJson = (p, fallback) => {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (_) { return fallback; }
};

// type prefix used in itemGrants - same convention as ShopManager
const TYPE_PREFIX = {
    outfit:     'AthenaCharacter',
    backpack:   'AthenaBackpack',
    pickaxe:    'AthenaPickaxe',
    glider:     'AthenaGlider',
    emote:      'AthenaDance',
    wrap:       'AthenaItemWrap',
    contrail:   'AthenaSkyDiveContrail',
    music:      'AthenaMusicPack',
    loadingscreen: 'AthenaLoadingScreen',
    spray:      'AthenaDance',
    toy:        'AthenaDance',
    emoji:      'AthenaDance',
};

const prefixForType = (typeValue) => {
    const t = (typeValue || '').toLowerCase();
    return TYPE_PREFIX[t] || 'AthenaCharacter';
};

const fetchCosmetics = () => new Promise((resolve, reject) => {
    if (cosmeticsCache && (Date.now() - cosmeticsCacheAt) < COSMETICS_CACHE_MS) {
        return resolve(cosmeticsCache);
    }
    const req = https.get(FORTNITE_API_URL, { headers: { 'User-Agent': 'Neodyme-Shop-Editor' } }, (resp) => {
        if (resp.statusCode !== 200) {
            resp.resume();
            return reject(new Error(`fortnite-api responded ${resp.statusCode}`));
        }
        let raw = '';
        resp.setEncoding('utf8');
        resp.on('data', (c) => { raw += c; });
        resp.on('end', () => {
            try {
                const parsed = JSON.parse(raw);
                const items = parsed.data || [];
                cosmeticsCache = items;
                cosmeticsCacheAt = Date.now();
                resolve(items);
            } catch (err) { reject(err); }
        });
    });
    req.setTimeout(15000, () => { req.destroy(new Error('fortnite-api request timed out')); });
    req.on('error', reject);
});

const getShopLayout = () => {
    const config = loadJson(SHOP_CONFIG_PATH, { shopCategories: {} });
    const layout = [];
    for (const [catKey, cat] of Object.entries(config.shopCategories || {})) {
        const count = Math.max(0, parseInt(cat.count, 10) || 0);
        for (let i = 1; i <= count; i++) {
            layout.push({
                slot: `${catKey}${i}`,
                category: catKey,
                index: i,
                displayName: cat.displayName || catKey,
                tileSize: cat.tileSize || null,
            });
        }
    }
    return { layout, config };
};

router.get('/neodyme/api/dev/shop/layout', ...dev, async (req, res) => {
    try {
        const { layout, config } = getShopLayout();
        const shopData = loadJson(SHOP_DATA_PATH, {});
        const slots = layout.map(s => ({
            ...s,
            entry: shopData[s.slot] || null
        }));
        return WebResponse.ok(res, {
            slots,
            categories: config.shopCategories || {},
            randomShop: !!config.randomShop,
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get shop layout', error);
    }
});

// Cosmetics search (proxy w/ in-memory cache). Optional ?q= filter on name/id.
router.get('/neodyme/api/dev/shop/cosmetics', ...dev, async (req, res) => {
    try {
        const all = await fetchCosmetics();
        const q = (req.query.q || '').toString().trim().toLowerCase();
        const limit = Math.min(200, Math.max(10, parseInt(req.query.limit, 10) || 60));
        let filtered = all;
        if (q) {
            filtered = all.filter(it => {
                const id = (it.id || '').toLowerCase();
                const name = (it.name || '').toLowerCase();
                return id.includes(q) || name.includes(q);
            });
        }
        const trimmed = filtered.slice(0, limit).map(it => ({
            id: it.id,
            name: it.name,
            description: it.description || '',
            type: (it.type && (it.type.value || it.type.displayValue)) || '',
            rarity: (it.rarity && (it.rarity.value || it.rarity.displayValue)) || 'common',
            backendValue: it.introduction && it.introduction.backendValue || null,
            image: (it.images && (it.images.icon || it.images.smallIcon)) || null,
        }));
        return WebResponse.ok(res, { total: filtered.length, returned: trimmed.length, items: trimmed });
    } catch (error) {
        return WebResponse.serverError(res, 'fetch cosmetics', error);
    }
});

// Update one slot (manual hand-pick). Body: { itemGrants: ['Type:id'], price: number }
router.put('/neodyme/api/dev/shop/slot/:slot', ...devWrite, async (req, res) => {
    try {
        const { slot } = req.params;
        if (!/^[a-zA-Z0-9_-]+$/.test(slot)) return WebResponse.badRequest(res, 'Invalid slot name.');

        const { layout } = getShopLayout();
        if (!layout.find(s => s.slot === slot)) return WebResponse.notFound(res, 'Slot not in current shop layout.');

        const { itemGrants, price } = req.body || {};
        if (!Array.isArray(itemGrants) || itemGrants.length === 0) {
            return WebResponse.badRequest(res, 'itemGrants must be a non-empty array of "Type:id" strings.');
        }
        for (const grant of itemGrants) {
            if (typeof grant !== 'string' || !/^[A-Za-z]+:[A-Za-z0-9_-]+$/.test(grant)) {
                return WebResponse.badRequest(res, `Invalid itemGrant: "${grant}". Format: "AthenaCharacter:CID_xxx".`);
            }
        }
        const priceNum = parseInt(price, 10);
        if (!Number.isFinite(priceNum) || priceNum < 0) return WebResponse.badRequest(res, 'price must be a non-negative integer.');

        const shopData = loadJson(SHOP_DATA_PATH, {});
        const oldEntry = shopData[slot] || null;
        const newEntry = { itemGrants, price: priceNum };
        shopData[slot] = newEntry;
        writeFileAtomic(SHOP_DATA_PATH, JSON.stringify(shopData, null, 2));

        await AuditService.logShopSlotUpdate(req.user.accountId, req.user.displayName, slot, oldEntry, newEntry, req.ip);
        LoggerService.log('info', `Shop slot ${slot} set to ${itemGrants.join(',')} (${priceNum}) by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `Slot ${slot} updated.`, entry: newEntry });
    } catch (error) {
        return WebResponse.serverError(res, 'update shop slot', error);
    }
});

// Clear a slot (so the next rotation regenerates it).
router.delete('/neodyme/api/dev/shop/slot/:slot', ...devWrite, async (req, res) => {
    try {
        const { slot } = req.params;
        if (!/^[a-zA-Z0-9_-]+$/.test(slot)) return WebResponse.badRequest(res, 'Invalid slot name.');

        const shopData = loadJson(SHOP_DATA_PATH, {});
        if (!shopData[slot]) return WebResponse.notFound(res, 'Slot not set.');
        const oldEntry = shopData[slot];
        delete shopData[slot];
        writeFileAtomic(SHOP_DATA_PATH, JSON.stringify(shopData, null, 2));

        await AuditService.logShopSlotClear(req.user.accountId, req.user.displayName, slot, oldEntry, req.ip);
        LoggerService.log('info', `Shop slot ${slot} cleared by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `Slot ${slot} cleared.` });
    } catch (error) {
        return WebResponse.serverError(res, 'clear shop slot', error);
    }
});

// Random-pick a single cosmetic for one slot. We delegate the catalog fetch
// to the same source the rotation manager uses, then pick a random eligible
// item respecting basic excluded list.
router.post('/neodyme/api/dev/shop/randomize/:slot', ...devWrite, async (req, res) => {
    try {
        const { slot } = req.params;
        const { layout, config } = getShopLayout();
        if (!layout.find(s => s.slot === slot)) return WebResponse.notFound(res, 'Slot not in current shop layout.');

        const cosmetics = await fetchCosmetics();
        const excluded = new Set((config.shopExcludedItems || []).map(x => x.toLowerCase()));
        const eligible = cosmetics.filter(it => {
            if (!it.id) return false;
            if (excluded.has(it.id.toLowerCase())) return false;
            const r = (it.rarity && it.rarity.displayValue || '').toLowerCase();
            if (r === 'common') return false;
            return true;
        });
        if (eligible.length === 0) return WebResponse.serverError(res, 'No eligible cosmetic to pick.');

        const picked = eligible[Math.floor(Math.random() * eligible.length)];
        const typeValue = (picked.type && (picked.type.value || picked.type.displayValue)) || 'outfit';
        const prefix = prefixForType(typeValue);
        // Use a generic "fair" pricing scheme by rarity. Not authoritative,
        // but a reasonable default the staff can tweak afterward.
        const rarity = (picked.rarity && picked.rarity.displayValue || '').toLowerCase();
        const priceTable = { legendary: 2000, epic: 1500, rare: 1200, uncommon: 800, common: 200 };
        const price = priceTable[rarity] || 1500;

        const shopData = loadJson(SHOP_DATA_PATH, {});
        const oldEntry = shopData[slot] || null;
        const newEntry = { itemGrants: [`${prefix}:${picked.id}`], price };
        shopData[slot] = newEntry;
        writeFileAtomic(SHOP_DATA_PATH, JSON.stringify(shopData, null, 2));

        const pickedMeta = { id: picked.id, name: picked.name, type: typeValue, rarity, image: picked.images && picked.images.icon || null };
        await AuditService.logShopSlotRandomize(req.user.accountId, req.user.displayName, slot, pickedMeta, oldEntry, newEntry, req.ip);
        LoggerService.log('info', `Shop slot ${slot} randomized to ${picked.id} (${price}) by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `Slot ${slot} randomized.`, entry: newEntry, picked: pickedMeta });
    } catch (error) {
        return WebResponse.serverError(res, 'randomize shop slot', error);
    }
});

module.exports = router;
