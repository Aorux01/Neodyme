const fs = require('fs');
const path = require('path');

class ItemShop {
    static getShopConfig() {
        try {
            const configPath = path.join(__dirname, '../../../config/Shop.json');
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch {
            return {
                shopCategories: {
                    daily: { storefrontName: 'BRDailyStorefront', tileSize: 'Small' },
                    featured: { storefrontName: 'BRWeeklyStorefront', tileSize: 'Normal' }
                }
            };
        }
    }

    static getShopState() {
        try {
            const shopStatePath = path.join(__dirname, '../../data/shop_state.json');
            if (fs.existsSync(shopStatePath)) {
                return JSON.parse(fs.readFileSync(shopStatePath, 'utf-8'));
            }
        } catch (error) {}
        return { categories: {} };
    }

    static calculateSeasonDates() {
        const now = new Date();
    
        // seasonBegin = 1 month ago
        const seasonBegin = new Date(now);
        seasonBegin.setMonth(seasonBegin.getMonth() - 1);
    
        // seasonEnd = 3 months from now (and we add 2 months each month)
        const seasonEnd = new Date(now);
        seasonEnd.setMonth(seasonEnd.getMonth() + 3);
    
        // seasonDisplayedEnd = same as seasonEnd but slightly earlier for display
        const seasonDisplayedEnd = new Date(seasonEnd);
        seasonDisplayedEnd.setHours(seasonDisplayedEnd.getHours() - 6);
    
        return {
            seasonBegin: seasonBegin.toISOString(),
            seasonEnd: seasonEnd.toISOString(),
            seasonDisplayedEnd: seasonDisplayedEnd.toISOString()
        };
    }
    
    static calculateStoreDates() {
        const shopState = this.getShopState();
        const shopConfig = this.getShopConfig();
        const categories = shopConfig.shopCategories || {};
    
        const now = new Date();
        const sectionStoreEnds = {};
        let dailyStoreEnd = new Date(now);
        let weeklyStoreEnd = new Date(now);
    
        // Default: tomorrow at midnight for daily, next week for weekly
        dailyStoreEnd.setDate(dailyStoreEnd.getDate() + 1);
        dailyStoreEnd.setHours(0, 0, 0, 0);
    
        weeklyStoreEnd.setDate(weeklyStoreEnd.getDate() + 7);
        weeklyStoreEnd.setHours(0, 0, 0, 0);
    
        for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
            const categoryState = shopState.categories?.[categoryKey];
            const displayName = categoryConfig.displayName || categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
    
            if (categoryState?.nextRotation) {
                sectionStoreEnds[displayName] = categoryState.nextRotation;
    
                // Update dailyStoreEnd and weeklyStoreEnd based on category type
                if (categoryConfig.rotationInterval === 'daily' || categoryKey.toLowerCase() === 'daily') {
                    dailyStoreEnd = new Date(categoryState.nextRotation);
                }
                if (categoryConfig.rotationInterval === 'weekly' || categoryKey.toLowerCase() === 'featured') {
                    weeklyStoreEnd = new Date(categoryState.nextRotation);
                }
            } else {
                // If no state, calculate based on rotation interval
                const rotationInterval = categoryConfig.rotationInterval || 'daily';
                const nextRotation = new Date(now);
    
                if (rotationInterval === 'daily') {
                    nextRotation.setDate(nextRotation.getDate() + 1);
                } else if (rotationInterval === 'weekly') {
                    nextRotation.setDate(nextRotation.getDate() + 7);
                } else if (rotationInterval === 'biweekly') {
                    nextRotation.setDate(nextRotation.getDate() + 14);
                } else if (rotationInterval === 'monthly') {
                    nextRotation.setMonth(nextRotation.getMonth() + 1);
                } else if (typeof rotationInterval === 'number') {
                    nextRotation.setTime(nextRotation.getTime() + rotationInterval * 60 * 60 * 1000);
                }
    
                // Apply rotation time from config
                const rotationTime = shopConfig.shopRotationTime || '00:00';
                const [hour, minute] = rotationTime.split(':').map(Number);
                nextRotation.setHours(hour, minute, 0, 0);
    
                sectionStoreEnds[displayName] = nextRotation.toISOString();
            }
        }
    
        // Ensure at least Featured and Daily exist
        if (!sectionStoreEnds['Featured']) {
            sectionStoreEnds['Featured'] = weeklyStoreEnd.toISOString();
        }
        if (!sectionStoreEnds['Daily']) {
            sectionStoreEnds['Daily'] = dailyStoreEnd.toISOString();
        }
    
        return {
            sectionStoreEnds,
            dailyStoreEnd: dailyStoreEnd.toISOString(),
            weeklyStoreEnd: weeklyStoreEnd.toISOString()
        };
    }

    static getBattlePassOffers(season) {
        try {
            const battlepassPath = path.join(__dirname, `../../../content/athena/battlepasses/Season${season}.json`);
            if (!fs.existsSync(battlepassPath)) return null;

            const battlepass = JSON.parse(fs.readFileSync(battlepassPath, 'utf8'));
            return {
                battlePassOfferId: battlepass.battlePassOfferId,
                battleBundleOfferId: battlepass.battleBundleOfferId,
                tierOfferId: battlepass.tierOfferId
            };
        } catch {
            return null;
        }
    }

    static addBattlePassOffers(catalog, season) {
        const offers = this.getBattlePassOffers(season);
        if (!offers) return;

        // Find or create the season storefront (e.g., BRSeason11)
        const storefrontName = `BRSeason${season}`;
        let seasonStorefrontIndex = catalog.storefronts.findIndex(sf => sf.name === storefrontName);

        if (seasonStorefrontIndex === -1) {
            // Create new storefront if it doesn't exist
            catalog.storefronts.push({
                name: storefrontName,
                catalogEntries: []
            });
            seasonStorefrontIndex = catalog.storefronts.length - 1;
        }

        // Battle Pass Offer (950 V-Bucks)
        if (offers.battlePassOfferId) {
            catalog.storefronts[seasonStorefrontIndex].catalogEntries.push({
                offerId: offers.battlePassOfferId,
                devName: `BR.Season${season}.BattlePass.01`,
                offerType: "StaticPrice",
                prices: [{
                    currencyType: "MtxCurrency",
                    currencySubType: "",
                    regularPrice: 950,
                    dynamicRegularPrice: -1,
                    finalPrice: 950,
                    saleExpiration: "9999-12-31T23:59:59.999Z",
                    basePrice: 950
                }],
                categories: [],
                dailyLimit: -1,
                weeklyLimit: -1,
                monthlyLimit: -1,
                refundable: false,
                appStoreId: ["", "", "", "", "", "", "", "", "", "", "", ""],
                requirements: [{
                    requirementType: "DenyOnFulfillment",
                    requiredId: offers.battlePassOfferId,
                    minQuantity: 1
                }],
                metaInfo: [
                    { key: "Preroll", value: "False" }
                ],
                catalogGroup: "",
                catalogGroupPriority: 0,
                sortPriority: 1,
                title: "Battle Pass",
                shortDescription: `Chapter ${season >= 11 ? Math.floor((season - 11) / 4) + 2 : 1} - Season ${season >= 11 ? ((season - 11) % 4) + 1 : season}`,
                description: "Battle Pass",
                displayAssetPath: `/Game/Catalog/DisplayAssets/DA_BR_Season${season}_BattlePass.DA_BR_Season${season}_Rare`,
                itemGrants: []
            });
        }

        // Tier Offer (Individual Levels)
        if (offers.tierOfferId) {
            catalog.storefronts[seasonStorefrontIndex].catalogEntries.push({
                offerId: offers.tierOfferId,
                devName: `BR.Season${season}.SingleTier.01`,
                offerType: "StaticPrice",
                prices: [{
                    currencyType: "MtxCurrency",
                    currencySubType: "",
                    regularPrice: 150,
                    dynamicRegularPrice: -1,
                    finalPrice: 150,
                    saleExpiration: "9999-12-31T23:59:59.999Z",
                    basePrice: 150
                }],
                categories: [],
                dailyLimit: -1,
                weeklyLimit: -1,
                monthlyLimit: -1,
                refundable: false,
                appStoreId: ["", "", "", "", "", "", "", "", "", "", "", ""],
                requirements: [],
                metaInfo: [
                    { key: "Preroll", value: "False" }
                ],
                catalogGroup: "",
                catalogGroupPriority: 0,
                sortPriority: 0,
                title: "Battle Pass Level",
                shortDescription: "",
                description: "Get great rewards now!",
                displayAssetPath: "",
                itemGrants: []
            });
        }

        // Battle Bundle Offer (25 Levels)
        if (offers.battleBundleOfferId) {
            catalog.storefronts[seasonStorefrontIndex].catalogEntries.push({
                offerId: offers.battleBundleOfferId,
                devName: `BR.Season${season}.BattleBundle.01`,
                offerType: "StaticPrice",
                prices: [{
                    currencyType: "MtxCurrency",
                    currencySubType: "",
                    regularPrice: 4700,
                    dynamicRegularPrice: -1,
                    finalPrice: 2800,
                    saleType: "PercentOff",
                    saleExpiration: "9999-12-31T23:59:59.999Z",
                    basePrice: 2800
                }],
                categories: [],
                dailyLimit: -1,
                weeklyLimit: -1,
                monthlyLimit: -1,
                refundable: false,
                appStoreId: ["", "", "", "", "", "", "", "", "", "", "", ""],
                requirements: [{
                    requirementType: "DenyOnFulfillment",
                    requiredId: offers.battlePassOfferId,
                    minQuantity: 1
                }],
                metaInfo: [
                    { key: "Preroll", value: "False" },
                    { key: "BannerOverride", value: "BattleBundle" }
                ],
                catalogGroup: "",
                catalogGroupPriority: 0,
                sortPriority: 2,
                title: "Battle Bundle",
                shortDescription: {
                    "en": "Battle Pass + 25 tiers!",
                    "fr": "Passe de combat + 25 paliers !",
                    "de": "Battle Pass + 25 Stufen!",
                    "es": "¡Pase de batalla y 25 niveles!",
                    "it": "Pass battaglia + 25 livelli!",
                    "pt-BR": "Passe de Batalha + 25 categorias!",
                    "ru": "Боевой пропуск + 25 уровней!",
                    "ja": "バトルパス+25ティア！",
                    "ko": "배틀패스 + 25티어!"
                },
                description: `Season ${season >= 11 ? Math.floor((season - 11) / 4) + 2 : 1} - Battle Pass with 25 bonus tiers! Get great rewards instantly!`,
                displayAssetPath: `/Game/Catalog/DisplayAssets/DA_BR_Season${season}_BattleBundle.DA_BR_Season${season}_BattleBundle`,
                itemGrants: []
            });
        }
    }

    static pickRandomItems(items, count, excludeItems = []) {
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

    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    static formatItemGrants(item) {
        const { id, type } = item;
        const typeValue = type?.value?.toLowerCase();

        let itemType;
        switch (typeValue) {
            case 'outfit':       itemType = 'AthenaCharacter';     break;
            case 'emote':        itemType = 'AthenaDance';          break;
            case 'backpack':     itemType = 'AthenaBackpack';       break;
            case 'glider':       itemType = 'AthenaGlider';         break;
            case 'pickaxe':      itemType = 'AthenaPickaxe';        break;
            case 'wrap':         itemType = 'AthenaItemWrap';       break;
            case 'loadingscreen': itemType = 'AthenaLoadingScreen'; break;
            case 'music':        itemType = 'AthenaMusicPack';      break;
            case 'emoji':        itemType = 'AthenaEmoji';          break;
            default:             itemType = `Athena${this.capitalize(typeValue)}`;
        }

        return [`${itemType}:${id}`];
    }

    static calculatePrice(item) {
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
                    outfit: 1500, pickaxe: 1200, backpack: 1200,
                    emote: 500, glider: 1200, wrap: 700,
                    loadingscreen: 500, music: 200, emoji: 200
                };
                return prices[type] || 5000;
            }

            if (series === 'lava series') {
                const prices = {
                    outfit: 2000, glider: 2000, backpack: 2000, pickaxe: 1200,
                    loadingscreen: 500, music: 200, emoji: 200
                };
                return prices[type] || 5000;
            }

            const premiumSeries = ['shadow series', 'frozen series', 'slurp series', 'dark series'];
            if (premiumSeries.includes(series)) {
                const prices = {
                    outfit: 1500, pickaxe: 1200, backpack: 1200, glider: 1200,
                    wrap: 700, loadingscreen: 500, music: 200, emoji: 200
                };
                return prices[type] || 5000;
            }
        }

        const pricingTable = {
            outfit:      { legendary: 2000, epic: 1500, rare: 1200, uncommon: 800 },
            pickaxe:     { epic: 1200, rare: 800, uncommon: 500 },
            backpack:    { legendary: 2000, epic: 1500, rare: 1200, uncommon: 200 },
            emote:       { legendary: 2000, epic: 800, rare: 500, uncommon: 200 },
            glider:      { legendary: 2000, epic: 1200, rare: 800, uncommon: 500 },
            wrap:        { legendary: 1200, epic: 700, rare: 500, uncommon: 300 },
            loadingscreen: { legendary: 500, epic: 500, rare: 500, uncommon: 200 },
            music:       { legendary: 500, epic: 500, rare: 200, uncommon: 200 }
        };

        if (pricingTable[type] && pricingTable[type][rarity]) {
            return pricingTable[type][rarity];
        }

        return 5000;
    }

    static capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    static getItemShop(season = 2) {
        const catalog = JSON.parse(JSON.stringify(require("../../../content/catalog.json")));
        const CatalogConfig = require("../../../data/shop.json");
        const shopConfig = this.getShopConfig();
        const categories = shopConfig.shopCategories || {};

        try {
            for (var value in CatalogConfig) {
                if (value === '//' || !Array.isArray(CatalogConfig[value].itemGrants)) continue;
                if (CatalogConfig[value].itemGrants.length === 0) continue;

                // Try to get category from meta.category first, fallback to prefix matching
                let categoryKey = null;
                let matchedCategory = null;

                if (CatalogConfig[value].meta?.category) {
                    // Use meta.category if available
                    const metaCategory = CatalogConfig[value].meta.category.toLowerCase();
                    for (const [key, catConfig] of Object.entries(categories)) {
                        if (metaCategory === key.toLowerCase() || metaCategory === catConfig.displayName?.toLowerCase()) {
                            categoryKey = key;
                            matchedCategory = catConfig;
                            break;
                        }
                    }
                }

                // Fallback to prefix matching if meta.category didn't match
                if (!matchedCategory) {
                    for (const [key, catConfig] of Object.entries(categories)) {
                        if (value.toLowerCase().startsWith(key.toLowerCase())) {
                            matchedCategory = catConfig;
                            categoryKey = key;
                            break;
                        }
                    }
                }

                if (!matchedCategory) continue;

                const storefrontName = matchedCategory.storefrontName || 'BRDailyStorefront';
                const tileSize = CatalogConfig[value].meta?.tileSize || matchedCategory.tileSize || 'Small';

                const storefrontIndex = catalog.storefronts.findIndex(sf => sf.name === storefrontName);

                if (storefrontIndex === -1) {
                    catalog.storefronts.push({
                        name: storefrontName,
                        catalogEntries: []
                    });
                }

                const targetStorefrontIndex = storefrontIndex === -1 ? catalog.storefronts.length - 1 : storefrontIndex;

                // Use meta.category or displayName as SectionId
                const sectionId = CatalogConfig[value].meta?.category || matchedCategory.displayName || (categoryKey === "daily" ? "Daily" : "Featured");

                const CatalogEntry = {
                    devName: "",
                    offerId: "",
                    fulfillmentIds: [],
                    dailyLimit: -1,
                    weeklyLimit: -1,
                    monthlyLimit: -1,
                    categories: [sectionId],  // Add categories array like Neonite
                    prices: [{
                        currencyType: "MtxCurrency",
                        currencySubType: "",
                        regularPrice: 0,
                        finalPrice: 0,
                        saleExpiration: "9999-12-02T01:12:00Z",
                        basePrice: 0
                    }],
                    meta: {
                        SectionId: sectionId,
                        LayoutId: "Neodyme.99",
                        TileSize: tileSize,
                        AnalyticOfferGroupId: `Neodyme/${categoryKey}`,
                        FirstSeen: "2/2/2020",
                        inDate: "2018-04-30T00:00:00.000Z",
                        outDate: "9999-12-31T23:59:59.999Z",
                        color1: "#50C878",
                        color2: "#1B5E20",
                        textBackgroundColor: "#0D3D0D"
                    },
                    matchFilter: "",
                    filterWeight: 0,
                    appStoreId: [],
                    requirements: [],
                    offerType: "StaticPrice",
                    giftInfo: {
                        bIsEnabled: true,  // Changed to true like Neonite
                        forcedGiftBoxTemplateId: "",
                        purchaseRequirements: [],
                        giftRecordIds: []
                    },
                    refundable: true,
                    metaInfo: [
                        { key: "SectionId", value: sectionId },
                        { key: "LayoutId", value: "Neodyme.99" },
                        { key: "TileSize", value: tileSize },
                        { key: "AnalyticOfferGroupId", value: `Neodyme/${categoryKey}` },
                        { key: "FirstSeen", value: "2/2/2020" },
                        { key: "inDate", value: "2018-04-30T00:00:00.000Z" },
                        { key: "outDate", value: "9999-12-31T23:59:59.999Z" },
                        { key: "color1", value: "#50C878" },
                        { key: "color2", value: "#1B5E20" },
                        { key: "textBackgroundColor", value: "#0D3D0D" }
                    ],
                    displayAssetPath: "",
                    itemGrants: [],
                    sortPriority: categoryKey === "daily" ? -1 : 0,
                    catalogGroupPriority: 0
                };

                CatalogEntry.requirements = [];
                CatalogEntry.itemGrants = [];

                for (var x in CatalogConfig[value].itemGrants) {
                    if (typeof CatalogConfig[value].itemGrants[x] === "string") {
                        if (CatalogConfig[value].itemGrants[x].length !== 0) {
                            CatalogEntry.devName = CatalogConfig[value].itemGrants[0];
                            CatalogEntry.offerId = CatalogConfig[value].itemGrants[0];

                            CatalogEntry.requirements.push({
                                requirementType: "DenyOnItemOwnership",
                                requiredId: CatalogConfig[value].itemGrants[x],
                                minQuantity: 1
                            });
                            CatalogEntry.itemGrants.push({
                                templateId: CatalogConfig[value].itemGrants[x],
                                quantity: 1
                            });

                            // Add templateId to meta and metaInfo
                            CatalogEntry.meta.templateId = CatalogConfig[value].itemGrants[x];
                            CatalogEntry.metaInfo.push({
                                key: "templateId",
                                value: CatalogConfig[value].itemGrants[x]
                            });
                        }
                    }
                }

                CatalogEntry.prices[0].basePrice = CatalogConfig[value].price;
                CatalogEntry.prices[0].regularPrice = CatalogConfig[value].price;
                CatalogEntry.prices[0].finalPrice = CatalogConfig[value].price;

                if (CatalogEntry.itemGrants.length !== 0) {
                    catalog.storefronts[targetStorefrontIndex].catalogEntries.push(CatalogEntry);
                }
            }
        } catch (err) {
            console.error('[Shop] Error building catalog:', err.message);
        }

        this.addBattlePassOffers(catalog, season);

        return catalog;
    }
}

module.exports = ItemShop;
