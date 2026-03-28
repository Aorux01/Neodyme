const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('./config-manager');
const ItemShop = require('../service/api/shop-service');

class ShopManager {
    constructor() {
        this.fortniteApiUrl = 'https://fortnite-api.com/v2/cosmetics/br';
        this.shopDataPath = path.join(__dirname, '../../data/shop.json');
        this.shopStatePath = path.join(__dirname, '../../data/shop_state.json');
        this.shopConfigPath = path.join(__dirname, '../../config/shop.json');
        this.rotationTimeouts = {};
        this.isInitialized = false;
        this.config = null;
        this.cosmeticsCache = null;
        this.cosmeticsCacheTime = null;
    }

    async initialize() {
        try {
            if (this.isInitialized) {
                LoggerService.log('warn', 'ShopManager already initialized');
                return;
            }

            await this.loadConfigs();
            await this.ensureDataDirectory();

            const categories = this.getCategories();
            for (const categoryKey of Object.keys(categories)) {
                const needsRotation = await this.checkIfCategoryRotationNeeded(categoryKey);
                if (needsRotation) {
                    LoggerService.log('info', `[Shop] Category "${categoryKey}" needs rotation, generating...`);
                    await this.rotateCategoryShop(categoryKey);
                }
            }

            this.scheduleAllRotations();
            this.isInitialized = true;

            LoggerService.log('success', 'ShopManager initialized successfully');
        } catch (error) {
            LoggerService.log('error', 'Failed to initialize ShopManager:', { error: error.message });
            throw error;
        }
    }

    async loadConfigs() {
        try {
            const shopConfigData = await fs.readFile(this.shopConfigPath, 'utf-8');
            this.config = JSON.parse(shopConfigData);
        } catch (error) {
            LoggerService.log('error', 'Failed to load shop configs:', { error: error.message });
            throw error;
        }
    }

    getCategories() {
        // Chapter 1 mode always uses fixed daily+weekly categories regardless of shopCategories config
        if (this.config.isChapter1 === true) {
            return {
                daily:    { count: 6, displayName: 'Daily',    storefrontName: 'BRDailyStorefront',  tileSize: 'Small',   rotationInterval: 'daily'  },
                featured: { count: 2, displayName: 'Featured', storefrontName: 'BRWeeklyStorefront', tileSize: 'Normal',  rotationInterval: 'weekly' }
            };
        }

        if (this.config.shopCategories) {
            return this.config.shopCategories;
        }

        return {
            daily:    { count: this.config.shopDailyItemsCount    || 6, displayName: 'Daily',    storefrontName: 'BRDailyStorefront',  tileSize: 'Small',  rotationInterval: 'daily'  },
            featured: { count: this.config.shopFeaturedItemsCount || 8, displayName: 'Featured', storefrontName: 'BRWeeklyStorefront', tileSize: 'Normal', rotationInterval: 'weekly' }
        };
    }

    getShopConfig() {
        return {
            shopCategories: this.getCategories(),
            shopRotationTime: this.config?.shopRotationTime || '00:00',
            shopMaxSeason: this.config?.shopMaxSeason ?? 0
        };
    }

    async ensureDataDirectory() {
        const dataDir = path.join(__dirname, '../../data');

        try {
            await fs.access(dataDir);
        } catch {
            await fs.mkdir(dataDir, { recursive: true });
        }

        try {
            await fs.access(this.shopDataPath);
        } catch {
            await fs.writeFile(this.shopDataPath, JSON.stringify({ "//": "BR Item Shop Config" }, null, 2));
        }

        try {
            await fs.access(this.shopStatePath);
        } catch {
            const defaultState = {
                lastFullRotation: null,
                categories: {}
            };
            await fs.writeFile(this.shopStatePath, JSON.stringify(defaultState, null, 2));
        }
    }

    getRotationIntervalMs(interval) {
        if (typeof interval === 'number') {
            return interval * 60 * 60 * 1000; // hours to ms
        }

        switch (interval) {
            case 'daily':
                return 24 * 60 * 60 * 1000; // 24 hours
            case 'weekly':
                return 7 * 24 * 60 * 60 * 1000; // 7 days
            case 'biweekly':
                return 14 * 24 * 60 * 60 * 1000; // 14 days
            case 'monthly':
                return 30 * 24 * 60 * 60 * 1000; // 30 days
            default:
                return 24 * 60 * 60 * 1000; // default to daily
        }
    }

    async checkIfCategoryRotationNeeded(categoryKey) {
        try {
            const state = await this.getShopState();
            const categoryState = state.categories?.[categoryKey];

            if (!categoryState || !categoryState.lastRotation) {
                return true;
            }

            const category = this.getCategories()[categoryKey];
            const interval = category?.rotationInterval || 'daily';
            const intervalMs = this.getRotationIntervalMs(interval);

            const lastRotation = new Date(categoryState.lastRotation);
            const nextRotation = new Date(lastRotation.getTime() + intervalMs);
            const now = new Date();

            // Also check if it's past the rotation time today
            const rotateTime = this.config.shopRotationTime || '00:00';
            const [hour, minute] = rotateTime.split(':').map(Number);

            const todayRotationTime = new Date(now);
            todayRotationTime.setHours(hour, minute, 0, 0);

            return now >= nextRotation || (now >= todayRotationTime && lastRotation < todayRotationTime);
        } catch (error) {
            LoggerService.log('error', `Error checking rotation for ${categoryKey}:`, { error: error.message });
            return true;
        }
    }

    async checkIfRotationNeeded() {
        const categories = this.getCategories();
        for (const categoryKey of Object.keys(categories)) {
            if (await this.checkIfCategoryRotationNeeded(categoryKey)) {
                return true;
            }
        }
        return false;
    }

    calculateNextRotationTime(categoryKey, fromDate = new Date()) {
        const category = this.getCategories()[categoryKey];
        const interval = category?.rotationInterval || 'daily';
        const intervalMs = this.getRotationIntervalMs(interval);

        const rotateTime = this.config.shopRotationTime || '00:00';
        const [hour, minute] = rotateTime.split(':').map(Number);

        const nextRotation = new Date(fromDate);
        nextRotation.setHours(hour, minute, 0, 0);

        // Add the interval
        if (interval === 'daily') {
            if (nextRotation <= fromDate) {
                nextRotation.setDate(nextRotation.getDate() + 1);
            }
        } else if (interval === 'weekly') {
            // Rotate on the same day of the week
            nextRotation.setTime(fromDate.getTime() + intervalMs);
            nextRotation.setHours(hour, minute, 0, 0);
        } else if (typeof interval === 'number') {
            // Custom hours interval
            nextRotation.setTime(fromDate.getTime() + intervalMs);
        } else {
            // Other intervals (biweekly, monthly)
            nextRotation.setTime(fromDate.getTime() + intervalMs);
            nextRotation.setHours(hour, minute, 0, 0);
        }

        return nextRotation;
    }

    getBattlepassAndWinterfestIds() {
        const excludedIds = new Set();
        const fs = require('fs');

        // Extract item IDs from all battlepass files
        const bpDir = path.join(__dirname, '../../content/athena/battlepasses');
        try {
            if (fs.existsSync(bpDir)) {
                const files = fs.readdirSync(bpDir);
                for (const file of files) {
                    if (!file.endsWith('.json')) continue;
                    try {
                        const data = JSON.parse(fs.readFileSync(path.join(bpDir, file), 'utf-8'));
                        const allRewards = [...(data.paidRewards || []), ...(data.freeRewards || [])];
                        for (const rewardObj of allRewards) {
                            for (const templateId of Object.keys(rewardObj)) {
                                const parts = templateId.split(':');
                                if (parts.length === 2) {
                                    excludedIds.add(parts[1].toLowerCase());
                                }
                            }
                        }
                    } catch {}
                }
            }
        } catch {}

        // Extract item IDs from winterfest rewards
        const winterfestPath = path.join(__dirname, '../../content/athena/winterfest-rewards.json');
        try {
            if (fs.existsSync(winterfestPath)) {
                const data = JSON.parse(fs.readFileSync(winterfestPath, 'utf-8'));
                for (const season of Object.values(data)) {
                    if (typeof season !== 'object') continue;
                    for (const nodeItems of Object.values(season)) {
                        if (!Array.isArray(nodeItems)) continue;
                        for (const templateId of nodeItems) {
                            const parts = templateId.split(':');
                            if (parts.length === 2) {
                                excludedIds.add(parts[1].toLowerCase());
                            }
                        }
                    }
                }
            }
        } catch {}

        return excludedIds;
    }

    async fetchCosmetics() {
        // Use cache if available and less than 1 hour old
        if (this.cosmeticsCache && this.cosmeticsCacheTime) {
            const cacheAge = Date.now() - this.cosmeticsCacheTime;
            if (cacheAge < 60 * 60 * 1000) {
                return this.cosmeticsCache;
            }
        }

        try {
            const response = await axios.get(this.fortniteApiUrl);
            const cosmetics = response.data.data || [];
            const excludedItems = this.config.shopExcludedItems || [];

            // Build battlepass + winterfest exclusion set (item IDs in lowercase)
            const bpExcludedIds = this.getBattlepassAndWinterfestIds();

            // Determine the maximum backendValue allowed (inclusive). 0 = no limit.
            // backendValue is a monotonically increasing integer from fortnite-api.com:
            //   1=C1S1, 2=C1S2, ..., 10=C1SX, 11=C2S1, ..., 31=C5S4(REMIX), 32=C5S5
            let maxSeason;
            const customVersion = ConfigManager.get('customVersion');
            if (customVersion === true || customVersion === 'true') {
                maxSeason = this.config.shopMaxSeason ?? 0;
            } else {
                // When locked to a specific build, derive the limit from the major version.
                // e.g. fnVersion "7.40" -> major 7 -> backendValue 7 (C1S7)
                const fnVersion = ConfigManager.get('fnVersion') || '3.60';
                maxSeason = parseInt(fnVersion.toString().split('.')[0], 10) || 0;
            }

            LoggerService.log('info', `[Shop] Fetching cosmetics (shopMaxSeason=${maxSeason || 'unlimited'}, bpExcluded=${bpExcludedIds.size})`);

            const filteredCosmetics = cosmetics.filter(item => {
                const { id, introduction, rarity } = item;
                const backendValue = introduction?.backendValue;
                const itemRarity = rarity?.displayValue?.toLowerCase();

                if (!backendValue) return false;
                if (excludedItems.includes(id)) return false;
                if (bpExcludedIds.has(id.toLowerCase())) return false;
                if (itemRarity === 'common') return false;
                if (maxSeason > 0 && backendValue > maxSeason) return false;

                return true;
            });

            // Cache the results
            this.cosmeticsCache = filteredCosmetics;
            this.cosmeticsCacheTime = Date.now();

            return filteredCosmetics;
        } catch (error) {
            LoggerService.log('error', 'Failed to fetch cosmetics from API:', { error: error.message });
            throw error;
        }
    }

    async rotateCategoryShop(categoryKey) {
        try {
            const categories = this.getCategories();
            const category = categories[categoryKey];

            if (!category) {
                throw new Error(`Category "${categoryKey}" not found in config`);
            }

            LoggerService.log('info', `[Shop] Rotating category "${categoryKey}"...`);

            const cosmetics = await this.fetchCosmetics();
            if (cosmetics.length === 0) {
                throw new Error('No cosmetics available for rotation');
            }

            // Load current shop data
            let shopConfig;
            try {
                const shopData = await fs.readFile(this.shopDataPath, 'utf-8');
                shopConfig = JSON.parse(shopData);
            } catch {
                shopConfig = { "//": "BR Item Shop Config" };
            }

            // Remove old items from this category
            const keysToRemove = Object.keys(shopConfig).filter(key =>
                key.startsWith(categoryKey) && key !== '//'
            );
            keysToRemove.forEach(key => delete shopConfig[key]);

            // Get items already in shop (other categories) to avoid duplicates
            const existingItemIds = [];
            for (const [key, value] of Object.entries(shopConfig)) {
                if (key !== '//' && value.itemGrants) {
                    value.itemGrants.forEach(grant => {
                        const itemId = grant.split(':')[1];
                        if (itemId) existingItemIds.push(itemId);
                    });
                }
            }

            const count = category.count || 6;
            const items = ItemShop.pickRandomItems(cosmetics, count, existingItemIds);

            // Add new items
            const categoryItems = [];
            items.forEach((item, index) => {
                const key = `${categoryKey}${index + 1}`;
                shopConfig[key] = {
                    itemGrants: ItemShop.formatItemGrants(item),
                    price: ItemShop.calculatePrice(item),
                    meta: {
                        name: item.name || 'Unknown',
                        description: item.description || '',
                        rarity: item.rarity?.displayValue || 'Unknown',
                        type: item.type?.displayValue || 'Unknown',
                        image: item.images?.icon || item.images?.smallIcon || null,
                        category: category.displayName || categoryKey,
                        tileSize: category.tileSize || 'Small'
                    }
                };
                categoryItems.push({
                    key,
                    image: item.images?.icon || item.images?.smallIcon || null
                });
            });

            await fs.writeFile(this.shopDataPath, JSON.stringify(shopConfig, null, 2), 'utf-8');

            const state = await this.getShopState();
            const now = new Date();

            if (!state.categories) {
                state.categories = {};
            }

            state.categories[categoryKey] = {
                lastRotation: now.toISOString(),
                nextRotation: this.calculateNextRotationTime(categoryKey, now).toISOString(),
                items: categoryItems.map(i => i.key)
            };

            categoryItems.forEach(item => {
                state[item.key] = item.image;
            });

            await fs.writeFile(this.shopStatePath, JSON.stringify(state, null, 2), 'utf-8');

            try { require('../service/shop/shop-image-generator').invalidateCache(); } catch {}

            LoggerService.log('success', `[Shop] Category "${categoryKey}" rotated successfully (${items.length} items)`);

        } catch (error) {
            LoggerService.log('error', `[Shop] Category "${categoryKey}" rotation failed:`, { error: error.message });
            throw error;
        }
    }

    async rotateShop() {
        // Rotate all categories
        try {
            LoggerService.log('info', '[Shop] Starting full shop rotation...');

            const categories = this.getCategories();
            for (const categoryKey of Object.keys(categories)) {
                await this.rotateCategoryShop(categoryKey);
            }

            LoggerService.log('success', '[Shop] Full shop rotation completed');
        } catch (error) {
            LoggerService.log('error', '[Shop] Full rotation failed:', { error: error.message });
            throw error;
        }
    }

    scheduleAllRotations() {
        // Clear existing timeouts
        Object.values(this.rotationTimeouts).forEach(timeout => clearTimeout(timeout));
        this.rotationTimeouts = {};

        const categories = this.getCategories();

        for (const categoryKey of Object.keys(categories)) {
            this.scheduleCategoryRotation(categoryKey);
        }
    }

    scheduleCategoryRotation(categoryKey) {
        if (this.rotationTimeouts[categoryKey]) {
            clearTimeout(this.rotationTimeouts[categoryKey]);
        }

        const nextRotation = this.calculateNextRotationTime(categoryKey);
        const now = new Date();
        const delay = Math.max(0, nextRotation.getTime() - now.getTime());

        const category = this.getCategories()[categoryKey];
        LoggerService.log('info', `[Shop] Next "${categoryKey}" rotation: ${nextRotation.toLocaleString()} (interval: ${category?.rotationInterval || 'daily'})`);

        this.rotationTimeouts[categoryKey] = setTimeout(async () => {
            try {
                await this.rotateCategoryShop(categoryKey);
                this.scheduleCategoryRotation(categoryKey);
            } catch (error) {
                LoggerService.log('error', `[Shop] Scheduled rotation for "${categoryKey}" failed:`, { error: error.message });
                // Retry in 1 hour
                setTimeout(() => this.scheduleCategoryRotation(categoryKey), 60 * 60 * 1000);
            }
        }, delay);
    }

    async getShopData() {
        try {
            const data = await fs.readFile(this.shopDataPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            LoggerService.log('error', 'Failed to read shop data:', { error: error.message });
            return { "//": "BR Item Shop Config" };
        }
    }

    async getShopState() {
        try {
            const data = await fs.readFile(this.shopStatePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return {
                lastFullRotation: null,
                categories: {}
            };
        }
    }

    async forceRotation(categoryKey = null) {
        // Reload config from disk and clear cosmetics cache so the new
        // shopChapterLimit / shopSeasonLimit values are picked up immediately.
        await this.loadConfigs();
        this.cosmeticsCache = null;
        this.cosmeticsCacheTime = null;

        if (categoryKey) {
            LoggerService.log('info', `[Shop] Manual rotation triggered for category "${categoryKey}"`);
            await this.rotateCategoryShop(categoryKey);
            this.scheduleCategoryRotation(categoryKey);
        } else {
            LoggerService.log('info', '[Shop] Manual full rotation triggered');
            await this.rotateShop();
            this.scheduleAllRotations();
        }
    }

    async fetchCosmeticsByDate(dateStr) {
        try {
            const response = await axios.get(this.fortniteApiUrl);
            const cosmetics = response.data.data || [];
            const excludedItems = this.config.shopExcludedItems || [];
            const target = dateStr.trim().substring(0, 10);

            const filtered = cosmetics.filter(item => {
                if (!item.added) return false;
                if (item.added.substring(0, 10) !== target) return false;
                if (excludedItems.includes(item.id)) return false;
                return item.rarity?.displayValue?.toLowerCase() !== 'common';
            });

            LoggerService.log('info', `[Shop] Found ${filtered.length} cosmetics added on ${target}`);
            return filtered;
        } catch (error) {
            LoggerService.log('error', `[Shop] Failed to fetch cosmetics by date: ${error.message}`);
            return [];
        }
    }

    async rotateToDate(dateStr, categoryKey = null) {
        const categories = this.getCategories();

        if (categoryKey && !categories[categoryKey]) {
            throw new Error(`Category "${categoryKey}" not found`);
        }

        const dateItems = await this.fetchCosmeticsByDate(dateStr);
        if (dateItems.length === 0) {
            throw new Error(`No cosmetics found for date: ${dateStr}`);
        }

        let shopConfig;
        try {
            const shopData = await fs.readFile(this.shopDataPath, 'utf-8');
            shopConfig = JSON.parse(shopData);
        } catch {
            shopConfig = { "//": "BR Item Shop Config" };
        }

        const state = await this.getShopState();
        if (!state.categories) state.categories = {};

        const shuffled = ItemShop.shuffleArray([...dateItems]);
        const categoriesToRotate = categoryKey
            ? { [categoryKey]: categories[categoryKey] }
            : categories;

        let offset = 0;
        for (const [catKey, category] of Object.entries(categoriesToRotate)) {
            const keysToRemove = Object.keys(shopConfig).filter(k => k.startsWith(catKey) && k !== '//');
            keysToRemove.forEach(k => delete shopConfig[k]);

            const count = category.count || 6;
            const items = shuffled.slice(offset, offset + count);
            offset += count;

            const categoryItems = [];
            items.forEach((item, index) => {
                const key = `${catKey}${index + 1}`;
                shopConfig[key] = {
                    itemGrants: ItemShop.formatItemGrants(item),
                    price: ItemShop.calculatePrice(item),
                    meta: {
                        name: item.name || 'Unknown',
                        description: item.description || '',
                        rarity: item.rarity?.displayValue || 'Unknown',
                        type: item.type?.displayValue || 'Unknown',
                        image: item.images?.icon || item.images?.smallIcon || null,
                        category: category.displayName || catKey,
                        tileSize: category.tileSize || 'Small'
                    }
                };
                categoryItems.push({ key, image: item.images?.icon || item.images?.smallIcon || null });
            });

            const now = new Date();
            state.categories[catKey] = {
                lastRotation: now.toISOString(),
                nextRotation: this.calculateNextRotationTime(catKey, now).toISOString(),
                items: categoryItems.map(i => i.key)
            };
            categoryItems.forEach(item => { state[item.key] = item.image; });
        }

        await fs.writeFile(this.shopDataPath, JSON.stringify(shopConfig, null, 2), 'utf-8');
        await fs.writeFile(this.shopStatePath, JSON.stringify(state, null, 2), 'utf-8');

        // Invalidate generated image cache
        try {
            require('../service/shop/shop-image-generator').invalidateCache();
        } catch {}

        LoggerService.log('success', `[Shop] Date rotation to ${dateStr} completed (${Object.keys(shopConfig).filter(k => k !== '//').length} items)`);
    }

    async cleanup() {
        Object.values(this.rotationTimeouts).forEach(timeout => clearTimeout(timeout));
        this.rotationTimeouts = {};
        this.isInitialized = false;
        this.cosmeticsCache = null;
        this.cosmeticsCacheTime = null;
        LoggerService.log('info', 'ShopManager cleaned up');
    }

}

module.exports = new ShopManager();
