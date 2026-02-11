const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('./config-manager')

class ShopManager {
    constructor() {
        this.fortniteApiUrl = 'https://fortnite-api.com/v2/cosmetics/br';
        this.shopDataPath = path.join(__dirname, '../../data/shop.json');
        this.shopStatePath = path.join(__dirname, '../../data/shop_state.json');
        this.shopConfigPath = path.join(__dirname, '../../config/Shop.json');
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
            for (const [categoryKey, category] of Object.entries(categories)) {
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
        if (this.config.shopCategories) {
            return this.config.shopCategories;
        }

        return {
            daily: { count: this.config.shopDailyItemsCount || 6, displayName: 'Daily', storefrontName: 'BRDailyStorefront', tileSize: 'Small', rotationInterval: 'daily' },
            featured: { count: this.config.shopFeaturedItemsCount || 8, displayName: 'Featured', storefrontName: 'BRWeeklyStorefront', tileSize: 'Normal', rotationInterval: 'weekly' }
        };
    }

    getShopConfig() {
        return {
            shopCategories: this.getCategories(),
            shopRotationTime: this.config?.shopRotationTime || '00:00',
            shopChapterLimit: this.config?.shopChapterLimit || 5,
            shopSeasonLimit: this.config?.shopSeasonLimit || 'REMIX'
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
        // Legacy method for compatibility
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

            let chapterLimit, seasonLimit;

            if (ConfigManager.get('customVersion')) {
                chapterLimit = this.config.shopChapterLimit || 5;
                seasonLimit = this.config.shopSeasonLimit || 'REMIX';
            } else {
                const fnVersion = ConfigManager.get('fnVersion') || '3.60';
                const versionString = fnVersion.toString();
                const versionParts = versionString.split('.');
                const season = parseInt(versionParts[0], 10);

                if (season >= 11 && season <= 18) {
                    chapterLimit = 2;
                } else if (season >= 19 && season <= 22) {
                    chapterLimit = 3;
                } else if (season >= 23 && season <= 27) {
                    chapterLimit = 4;
                } else if (season >= 28 && season <= 32) {
                    chapterLimit = 5;
                } else {
                    chapterLimit = 1;
                }

                const chapterSeasons = {
                    1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    2: [11, 12, 13, 14, 15, 16, 17, 18],
                    3: [19, 20, 21, 22],
                    4: [23, 24, 25, 26, 27],
                    5: [28, 29, 30, 31, 32]
                };

                const seasonIndex = chapterSeasons[chapterLimit].indexOf(season);
                seasonLimit = (seasonIndex + 1).toString();
            }

            const filteredCosmetics = cosmetics.filter(item => {
                const { id, introduction, rarity } = item;
                const chapter = introduction?.chapter ? parseInt(introduction.chapter, 10) : null;
                const season = introduction?.season ? introduction.season.toString() : null;
                const itemRarity = rarity?.displayValue?.toLowerCase();

                if (!chapter || !season) return false;
                if (excludedItems.includes(id)) return false;
                if (itemRarity === 'common') return false;

                if (seasonLimit === 'OG' || seasonLimit === 'REMIX') {
                    return chapter >= 1 && chapter <= chapterLimit;
                }

                if (chapter < 1 || chapter > chapterLimit) {
                    return false;
                }

                if (chapter === chapterLimit) {
                    if (season === 'X') return true;

                    const seasonUpper = season.toUpperCase();
                    if (seasonUpper === seasonLimit.toUpperCase()) return true;

                    const currentSeason = parseInt(season, 10);
                    const maxSeason = parseInt(seasonLimit, 10);

                    if (!isNaN(currentSeason) && !isNaN(maxSeason)) {
                        return currentSeason <= maxSeason;
                    }
                }

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

    pickRandomItems(items, count, excludeItems = []) {
        const availableItems = items.filter(item => !excludeItems.includes(item.id));

        const typeBuckets = {
            outfit: [],
            emote: [],
            backpack: [],
            glider: [],
            pickaxe: [],
            loadingscreen: [],
            emoji: [],
            wrap: [],
            music: []
        };

        availableItems.forEach(item => {
            const type = item.type?.value?.toLowerCase();
            if (typeBuckets.hasOwnProperty(type)) {
                typeBuckets[type].push(item);
            }
        });

        const selectedItems = [];
        const minDistribution = {
            outfit: Math.min(2, count),
            emote: Math.min(1, count),
            backpack: Math.min(1, count),
            glider: Math.min(1, count),
            pickaxe: Math.min(1, count)
        };

        for (const [type, minCount] of Object.entries(minDistribution)) {
            const bucket = typeBuckets[type];
            if (bucket.length > 0) {
                const shuffled = this.shuffleArray([...bucket]);
                selectedItems.push(...shuffled.slice(0, Math.min(minCount, shuffled.length)));
            }
        }

        const remainingCount = count - selectedItems.length;
        if (remainingCount > 0) {
            const remainingItems = availableItems.filter(item => !selectedItems.includes(item));
            const shuffled = this.shuffleArray(remainingItems);
            selectedItems.push(...shuffled.slice(0, remainingCount));
        }

        return selectedItems.slice(0, count);
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    formatItemGrants(item) {
        const { id, type } = item;
        const typeValue = type?.value?.toLowerCase();

        let itemType;
        switch (typeValue) {
            case 'outfit':
                itemType = 'AthenaCharacter';
                break;
            case 'emote':
                itemType = 'AthenaDance';
                break;
            case 'backpack':
                itemType = 'AthenaBackpack';
                break;
            case 'glider':
                itemType = 'AthenaGlider';
                break;
            case 'pickaxe':
                itemType = 'AthenaPickaxe';
                break;
            case 'wrap':
                itemType = 'AthenaItemWrap';
                break;
            case 'loadingscreen':
                itemType = 'AthenaLoadingScreen';
                break;
            case 'music':
                itemType = 'AthenaMusicPack';
                break;
            case 'emoji':
                itemType = 'AthenaEmoji';
                break;
            default:
                itemType = `Athena${this.capitalize(typeValue)}`;
        }

        return [`${itemType}:${id}`];
    }

    calculatePrice(item) {
        const rarity = item.rarity?.displayValue?.toLowerCase();
        const type = item.type?.value?.toLowerCase();
        const series = item.series?.value?.toLowerCase();

        if (series) {
            const specialSeries = [
                'gaming legends series',
                'marvel series',
                'star wars series',
                'dc series',
                'icon series'
            ];

            if (specialSeries.includes(series)) {
                const prices = {
                    outfit: 1500,
                    pickaxe: 1200,
                    backpack: 1200,
                    emote: 500,
                    glider: 1200,
                    wrap: 700,
                    loadingscreen: 500,
                    music: 200,
                    emoji: 200
                };
                return prices[type] || 5000;
            }

            if (series === 'lava series') {
                const prices = {
                    outfit: 2000,
                    glider: 2000,
                    backpack: 2000,
                    pickaxe: 1200,
                    loadingscreen: 500,
                    music: 200,
                    emoji: 200
                };
                return prices[type] || 5000;
            }

            const premiumSeries = ['shadow series', 'frozen series', 'slurp series', 'dark series'];
            if (premiumSeries.includes(series)) {
                const prices = {
                    outfit: 1500,
                    pickaxe: 1200,
                    backpack: 1200,
                    glider: 1200,
                    wrap: 700,
                    loadingscreen: 500,
                    music: 200,
                    emoji: 200
                };
                return prices[type] || 5000;
            }
        }

        const pricingTable = {
            outfit: { legendary: 2000, epic: 1500, rare: 1200, uncommon: 800 },
            pickaxe: { epic: 1200, rare: 800, uncommon: 500 },
            backpack: { legendary: 2000, epic: 1500, rare: 1200, uncommon: 200 },
            emote: { legendary: 2000, epic: 800, rare: 500, uncommon: 200 },
            glider: { legendary: 2000, epic: 1200, rare: 800, uncommon: 500 },
            wrap: { legendary: 1200, epic: 700, rare: 500, uncommon: 300 },
            loadingscreen: { legendary: 500, epic: 500, rare: 500, uncommon: 200 },
            music: { legendary: 500, epic: 500, rare: 200, uncommon: 200 }
        };

        if (pricingTable[type] && pricingTable[type][rarity]) {
            return pricingTable[type][rarity];
        }

        return 5000;
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

            // Pick new items for this category
            const count = category.count || 6;
            const items = this.pickRandomItems(cosmetics, count, existingItemIds);

            // Add new items
            const categoryItems = [];
            items.forEach((item, index) => {
                const key = `${categoryKey}${index + 1}`;
                shopConfig[key] = {
                    itemGrants: this.formatItemGrants(item),
                    price: this.calculatePrice(item),
                    meta: {
                        name: item.name || 'Unknown',
                        description: item.description || '',
                        rarity: item.rarity?.displayValue || 'Unknown',
                        type: item.type?.displayValue || 'Unknown',
                        image: item.images?.smallIcon || item.images?.icon || null,
                        category: category.displayName || categoryKey,
                        tileSize: category.tileSize || 'Small'
                    }
                };
                categoryItems.push({
                    key,
                    image: item.images?.smallIcon || item.images?.icon || null
                });
            });

            // Save shop data
            await fs.writeFile(this.shopDataPath, JSON.stringify(shopConfig, null, 2), 'utf-8');

            // Update shop state
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

            // Add image URLs to state
            categoryItems.forEach(item => {
                state[item.key] = item.image;
            });

            await fs.writeFile(this.shopStatePath, JSON.stringify(state, null, 2), 'utf-8');

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

        for (const [categoryKey, category] of Object.entries(categories)) {
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

    scheduleNextRotation() {
        // Legacy method - now schedules all categories
        this.scheduleAllRotations();
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

    async cleanup() {
        Object.values(this.rotationTimeouts).forEach(timeout => clearTimeout(timeout));
        this.rotationTimeouts = {};
        this.isInitialized = false;
        this.cosmeticsCache = null;
        this.cosmeticsCacheTime = null;
        LoggerService.log('info', 'ShopManager cleaned up');
    }

    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

module.exports = new ShopManager();
