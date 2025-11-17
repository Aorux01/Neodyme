const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const LoggerService = require('../service/logger/LoggerService');
const ConfigManager = require('./ConfigManager')

class ShopManager {
    constructor() {
        this.fortniteApiUrl = 'https://fortnite-api.com/v2/cosmetics/br';
        this.shopDataPath = path.join(__dirname, '../../data/shop.json');
        this.shopStatePath = path.join(__dirname, '../../data/shop_state.json');
        this.shopConfigPath = path.join(__dirname, '../../config/Shop.json');
        this.rotationTimeout = null;
        this.isInitialized = false;
        this.config = null;
    }

    async initialize() {
        try {
            if (this.isInitialized) {
                LoggerService.log('warn', 'ShopManager already initialized');
                return;
            }

            await this.loadConfigs();
            await this.ensureDataDirectory();

            const needsRotation = await this.checkIfRotationNeeded();
            
            if (needsRotation) {
                LoggerService.log('info', 'Shop rotation needed, generating new shop...');
                await this.rotateShop();
            } else {
                LoggerService.log('info', 'Shop is up to date');
            }

            this.scheduleNextRotation();
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
            await fs.writeFile(this.shopStatePath, JSON.stringify({
                lastRotation: null,
                nextRotation: null
            }, null, 2));
        }
    }

    async checkIfRotationNeeded() {
        try {
            const stateData = await fs.readFile(this.shopStatePath, 'utf-8');
            const state = JSON.parse(stateData);

            if (!state.lastRotation) {
                return true;
            }

            const lastRotation = new Date(state.lastRotation);
            const nextRotation = this.calculateNextRotationTime(lastRotation);
            const now = new Date();

            return now >= nextRotation;
        } catch (error) {
            LoggerService.log('error', 'Error checking rotation state:', { error: error.message });
            return true;
        }
    }

    calculateNextRotationTime(fromDate = new Date()) {
        const rotateTime = this.config.shopRotationTime || '00:00';
        const [hour, minute] = rotateTime.split(':').map(Number);

        const nextRotation = new Date(fromDate);
        nextRotation.setHours(hour, minute, 0, 0);

        if (nextRotation <= fromDate) {
            nextRotation.setDate(nextRotation.getDate() + 1);
        }

        return nextRotation;
    }

    async fetchCosmetics() {
        try {
            const response = await axios.get(this.fortniteApiUrl);
            const cosmetics = response.data.data || [];
            const excludedItems = this.config.shopExcludedItems || [];
            
            let chapterLimit, seasonLimit;
            
            if (ConfigManager.get('customVersion')) {
                chapterLimit = 5;
                seasonLimit = 'REMIX';
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
    
            return cosmetics.filter(item => {
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
        } catch (error) {
            LoggerService.log('error', 'Failed to fetch cosmetics from API:', { error: error.message });
            throw error;
        }
    }

    pickRandomItems(items, count) {
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

        items.forEach(item => {
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
            const remainingItems = items.filter(item => !selectedItems.includes(item));
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

    async rotateShop() {
        try {
            LoggerService.log('info', 'Starting shop rotation...');

            const cosmetics = await this.fetchCosmetics();
            if (cosmetics.length === 0) {
                throw new Error('No cosmetics available for rotation');
            }

            const dailyCount = this.config.shopDailyItemsCount;
            const featuredCount = this.config.shopFeaturedItemsCount;

            const dailyItems = this.pickRandomItems(cosmetics, dailyCount);
            const featuredItems = this.pickRandomItems(cosmetics, featuredCount);

            const shopConfig = { "//": "BR Item Shop Config" };

            dailyItems.forEach((item, index) => {
                shopConfig[`daily${index + 1}`] = {
                    itemGrants: this.formatItemGrants(item),
                    price: this.calculatePrice(item)
                };
            });

            featuredItems.forEach((item, index) => {
                shopConfig[`featured${index + 1}`] = {
                    itemGrants: this.formatItemGrants(item),
                    price: this.calculatePrice(item)
                };
            });

            await fs.writeFile(this.shopDataPath, JSON.stringify(shopConfig, null, 2), 'utf-8');

            const now = new Date();
            const nextRotation = this.calculateNextRotationTime(now);
            
            await fs.writeFile(this.shopStatePath, JSON.stringify({
                lastRotation: now.toISOString(),
                nextRotation: nextRotation.toISOString()
            }, null, 2), 'utf-8');

            LoggerService.log('success', 'Shop rotated successfully');

        } catch (error) {
            LoggerService.log('error', 'Shop rotation failed:', { error: error.message });
            throw error;
        }
    }

    scheduleNextRotation() {
        if (this.rotationTimeout) {
            clearTimeout(this.rotationTimeout);
        }

        const nextRotation = this.calculateNextRotationTime();
        const now = new Date();
        const delay = nextRotation.getTime() - now.getTime();

        LoggerService.log('info', `Next shop rotation scheduled for: ${nextRotation.toLocaleString()}`);

        this.rotationTimeout = setTimeout(async () => {
            await this.rotateShop();
            this.scheduleNextRotation();
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
                lastRotation: null,
                nextRotation: null
            };
        }
    }

    async forceRotation() {
        LoggerService.log('info', 'Manual shop rotation triggered');
        await this.rotateShop();
        this.scheduleNextRotation();
    }

    async cleanup() {
        if (this.rotationTimeout) {
            clearTimeout(this.rotationTimeout);
            this.rotationTimeout = null;
        }
        this.isInitialized = false;
        LoggerService.log('info', 'ShopManager cleaned up');
    }

    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

module.exports = new ShopManager();