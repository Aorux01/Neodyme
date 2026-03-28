const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ItemShop {
    static getShopConfig() {
        try {
            const configPath = path.join(__dirname, '../../../config/shop.json');
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
            const battlepassPath = path.join(__dirname, `../../../content/athena/battlepasses/season-${season}.json`);
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

        const chapterNum = season >= 11 ? Math.floor((season - 11) / 4) + 2 : 1;
        const seasonInChapter = season >= 11 ? ((season - 11) % 4) + 1 : season;
        const seasonLabel = `Chapter ${chapterNum} - Season ${seasonInChapter}`;

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
                    { key: "bShowInItemShop",           value: "true"       },
                    { key: "SectionId",                 value: "Battlepass" },
                    { key: "TileSize",                  value: "DoubleWide" },
                    { key: "sectionPriority",           value: "1000"       },
                    { key: "ShouldShowBattlePassPurchase", value: "true"    },
                    { key: "Preroll",                   value: "False"      },
                    { key: "NewDisplayAssetPath",       value: `/Game/Catalog/NewDisplayAssets/DAv2_BR_Season${season}_BattlePass.DAv2_BR_Season${season}_BattlePass` }
                ],
                catalogGroup: "",
                catalogGroupPriority: 0,
                sortPriority: 1,
                title: "Battle Pass",
                shortDescription: seasonLabel,
                description: `Unlock over 100 rewards in the ${seasonLabel} Battle Pass!`,
                displayAssetPath: `/Game/Catalog/DisplayAssets/DA_BR_Season${season}_BattlePass.DA_BR_Season${season}_BattlePass`,
                itemGrants: []
            });
        }

        // Tier Offer (Individual Levels - 150 V-Bucks each)
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

        // Battle Bundle Offer (Battle Pass + 25 levels - 2800 V-Bucks, shown as 4700 → 2800)
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
                    saleType: "Strikethrough",
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
                    { key: "bShowInItemShop",             value: "false"      },
                    { key: "ShouldShowBattlePassPurchase", value: "true"      },
                    { key: "LevelsToGrant",               value: "25"         },
                    { key: "Preroll",                     value: "False"      },
                    { key: "BannerOverride",              value: "BattleBundle" },
                    { key: "NewDisplayAssetPath",         value: `/Game/Catalog/NewDisplayAssets/DAv2_BR_Season${season}_BattlePass.DAv2_BR_Season${season}_BattlePass` }
                ],
                catalogGroup: "",
                catalogGroupPriority: 0,
                sortPriority: 2,
                title: "Battle Bundle",
                shortDescription: "Battle Pass + 25 tiers!",
                description: `${seasonLabel} - Battle Pass with 25 bonus tiers! Get great rewards instantly!`,
                displayAssetPath: `/Game/Catalog/DisplayAssets/DA_BR_Season${season}_BattlePassWithLevels.DA_BR_Season${season}_BattlePassWithLevels`,
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
        let CatalogConfig;
        try {
            CatalogConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../data/shop.json'), 'utf8'));
        } catch {
            CatalogConfig = {};
        }
        const shopConfig = this.getShopConfig();

        // isChapter1 is driven exclusively by config/shop.json, not by the client version
        const useChapter1 = shopConfig.isChapter1 === true;

        // For Chapter 1 mode, always use fixed daily/featured categories
        const categories = useChapter1
            ? {
                daily:    { storefrontName: 'BRDailyStorefront',  tileSize: 'Small',  displayName: 'Daily'    },
                featured: { storefrontName: 'BRWeeklyStorefront', tileSize: 'Normal', displayName: 'Featured' }
              }
            : (shopConfig.shopCategories || {
                daily:    { storefrontName: 'BRDailyStorefront',  tileSize: 'Small',  displayName: 'Daily'    },
                featured: { storefrontName: 'BRWeeklyStorefront', tileSize: 'Normal', displayName: 'Featured' }
              });

        try {
            for (var value in CatalogConfig) {
                if (value === '//' || !Array.isArray(CatalogConfig[value].itemGrants)) continue;
                if (CatalogConfig[value].itemGrants.length === 0) continue;

                let storefrontName;
                let tileSize;
                let categoryKey;
                let matchedCategory = null;

                // Route item to the correct storefront
                if (CatalogConfig[value].meta?.category) {
                    const metaCategory = CatalogConfig[value].meta.category.toLowerCase();
                    for (const [key, catConfig] of Object.entries(categories)) {
                        if (metaCategory === key.toLowerCase() || metaCategory === catConfig.displayName?.toLowerCase()) {
                            categoryKey = key;
                            matchedCategory = catConfig;
                            break;
                        }
                    }
                }

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

                storefrontName = matchedCategory.storefrontName || 'BRDailyStorefront';
                tileSize = CatalogConfig[value].meta?.tileSize || matchedCategory.tileSize || 'Small';

                let storefrontIndex = catalog.storefronts.findIndex(sf => sf.name === storefrontName);
                if (storefrontIndex === -1) {
                    catalog.storefronts.push({ name: storefrontName, catalogEntries: [] });
                    storefrontIndex = catalog.storefronts.length - 1;
                }

                // Chapter 1 clients only render a grid when SectionId is "Featured".
                // Using "Daily" triggers a single-item carousel (1/5 arrow navigation).
                // BetterReload hardcodes "Featured" for all items in Ch1 mode.
                const sectionId = useChapter1
                    ? "Featured"
                    : (CatalogConfig[value].meta?.category
                        || categories[categoryKey]?.displayName
                        || (categoryKey === 'daily' ? 'Daily' : 'Featured'));

                // Ch1: minimal meta/metaInfo (SectionId + TileSize only), empty categories.
                // Ch2+: full meta with LayoutId, colors, dates etc.
                const entryMeta = useChapter1
                    ? { SectionId: sectionId, TileSize: tileSize }
                    : {
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
                    };

                const entryMetaInfo = useChapter1
                    ? [
                        { key: "SectionId", value: sectionId },
                        { key: "TileSize", value: tileSize }
                    ]
                    : [
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
                    ];

                const CatalogEntry = {
                    devName: "",
                    offerId: "",
                    fulfillmentIds: [],
                    dailyLimit: -1,
                    weeklyLimit: -1,
                    monthlyLimit: -1,
                    categories: [],
                    prices: [{
                        currencyType: "MtxCurrency",
                        currencySubType: "",
                        regularPrice: 0,
                        finalPrice: 0,
                        saleExpiration: "9999-12-02T01:12:00Z",
                        basePrice: 0
                    }],
                    meta: entryMeta,
                    matchFilter: "",
                    filterWeight: 0,
                    appStoreId: [],
                    requirements: [],
                    offerType: "StaticPrice",
                    giftInfo: {
                        bIsEnabled: true,
                        forcedGiftBoxTemplateId: "",
                        purchaseRequirements: [],
                        giftRecordIds: []
                    },
                    refundable: true,
                    metaInfo: entryMetaInfo,
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

                            CatalogEntry.requirements.push({
                                requirementType: "DenyOnItemOwnership",
                                requiredId: CatalogConfig[value].itemGrants[x],
                                minQuantity: 1
                            });
                            CatalogEntry.itemGrants.push({
                                templateId: CatalogConfig[value].itemGrants[x],
                                quantity: 1
                            });

                            // Ch2+: expose templateId in meta/metaInfo for display assets
                            if (!useChapter1) {
                                CatalogEntry.meta.templateId = CatalogConfig[value].itemGrants[x];
                                CatalogEntry.metaInfo.push({
                                    key: "templateId",
                                    value: CatalogConfig[value].itemGrants[x]
                                });
                            }
                        }
                    }
                }

                CatalogEntry.prices[0].basePrice = CatalogConfig[value].price;
                CatalogEntry.prices[0].regularPrice = CatalogConfig[value].price;
                CatalogEntry.prices[0].finalPrice = CatalogConfig[value].price;

                // Generate a unique offerId using SHA1(grants + price) - method from BetterReload
                // This prevents collisions and avoids exposing raw template IDs as offer IDs
                if (CatalogEntry.itemGrants.length !== 0) {
                    const offerKey = CatalogEntry.itemGrants.map(g => g.templateId).join('') + CatalogEntry.prices[0].finalPrice;
                    CatalogEntry.offerId = crypto.createHash('sha1').update(offerKey).digest('hex');

                    catalog.storefronts[storefrontIndex].catalogEntries.push(CatalogEntry);
                }
            }
        } catch (err) {
            console.error('[Shop] Error building catalog:', err.message);
        }

        if (shopConfig.includeBattlePass !== false && season >= 11) {
            this.addBattlePassOffers(catalog, season);
        }

        return catalog;
    }

    static async getRandomItemShop(season = 2) {
        const shopConfig = this.getShopConfig();
        const ShopManager = require('../../manager/shop-manager');

        // Auto-detect Chapter 1 from client version
        const useChapter1 = season <= 10;

        // Category definitions based on auto-detected mode
        const categories = useChapter1
            ? {
                daily:    { storefrontName: 'BRDailyStorefront',  tileSize: 'Small',  count: 4, displayName: 'Daily'    },
                featured: { storefrontName: 'BRWeeklyStorefront', tileSize: 'Normal', count: 2, displayName: 'Featured' }
              }
            : (() => {
                const cats = shopConfig.shopCategories || {
                    daily:    { storefrontName: 'BRDailyStorefront',  tileSize: 'Small',  count: 6, displayName: 'Daily'    },
                    featured: { storefrontName: 'BRWeeklyStorefront', tileSize: 'Normal', count: 8, displayName: 'Featured' }
                };
                // Ensure counts come from config or defaults
                return Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, {
                    storefrontName: v.storefrontName || (k === 'daily' ? 'BRDailyStorefront' : 'BRWeeklyStorefront'),
                    tileSize: v.tileSize || (k === 'daily' ? 'Small' : 'Normal'),
                    count: v.count || (k === 'daily' ? 6 : 8),
                    displayName: v.displayName || (k.charAt(0).toUpperCase() + k.slice(1))
                }]));
              })();

        // Get cosmetics - use cache if available, otherwise fetch
        let allCosmetics = ShopManager.cosmeticsCache;
        if (!allCosmetics || allCosmetics.length === 0) {
            try { allCosmetics = await ShopManager.fetchCosmetics(); } catch { allCosmetics = []; }
        }

        // Filter to items available in the client's era (backendValue <= season)
        const excludedItems = shopConfig.shopExcludedItems || [];
        const bpExcludedIds = ShopManager.getBattlepassAndWinterfestIds();
        const cosmetics = allCosmetics.filter(item => {
            const bv = item.introduction?.backendValue;
            if (!bv || bv > season) return false;
            if (excludedItems.includes(item.id)) return false;
            if (bpExcludedIds.has(item.id.toLowerCase())) return false;
            if (item.rarity?.displayValue?.toLowerCase() === 'common') return false;
            return true;
        });

        const seedStr = `${season}-${new Date().toISOString().slice(0, 10)}`;
        let rngState = 0;
        for (let i = 0; i < seedStr.length; i++) {
            rngState = Math.imul(31, rngState) + seedStr.charCodeAt(i) | 0;
        }
        const rng = () => {
            rngState ^= rngState << 13;
            rngState ^= rngState >> 17;
            rngState ^= rngState << 5;
            return (rngState >>> 0) / 0xFFFFFFFF;
        };
        const seededShuffle = (arr) => {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        };

        const catalog = JSON.parse(JSON.stringify(require("../../../content/catalog.json")));
        const usedIds = new Set();

        for (const [categoryKey, catConfig] of Object.entries(categories)) {
            const { storefrontName, tileSize, count } = catConfig;

            let storefrontIndex = catalog.storefronts.findIndex(sf => sf.name === storefrontName);
            if (storefrontIndex === -1) {
                catalog.storefronts.push({ name: storefrontName, catalogEntries: [] });
                storefrontIndex = catalog.storefronts.length - 1;
            }

            // Ensure type diversity: at least 1 outfit, emote, backpack, glider, pickaxe
            const buckets = { outfit: [], emote: [], backpack: [], glider: [], pickaxe: [], other: [] };
            for (const item of seededShuffle(cosmetics.filter(c => !usedIds.has(c.id)))) {
                const t = item.type?.value?.toLowerCase();
                if (buckets[t]) buckets[t].push(item);
                else buckets.other.push(item);
            }

            const picked = [];
            const minPer = { outfit: Math.min(2, count), emote: 1, backpack: 1, glider: 1, pickaxe: 1 };
            for (const [type, min] of Object.entries(minPer)) {
                for (let i = 0; i < min && buckets[type].length > 0 && picked.length < count; i++) {
                    picked.push(buckets[type].shift());
                }
            }
            // Fill remainder from all remaining shuffled
            const remaining = seededShuffle([
                ...buckets.outfit, ...buckets.emote, ...buckets.backpack,
                ...buckets.glider, ...buckets.pickaxe, ...buckets.other
            ]);
            for (const item of remaining) {
                if (picked.length >= count) break;
                if (!picked.some(p => p.id === item.id)) picked.push(item);
            }

            // Ch1: always "Featured" (grid requires it); Ch2+: use category displayName
            const sectionId = useChapter1
                ? "Featured"
                : (catConfig.displayName || (categoryKey === 'daily' ? 'Daily' : 'Featured'));
            const entryMeta = useChapter1
                ? { SectionId: sectionId, TileSize: tileSize }
                : { SectionId: sectionId, LayoutId: "Neodyme.99", TileSize: tileSize,
                    AnalyticOfferGroupId: `Neodyme/${categoryKey}`, FirstSeen: "2/2/2020",
                    inDate: "2018-04-30T00:00:00.000Z", outDate: "9999-12-31T23:59:59.999Z",
                    color1: "#50C878", color2: "#1B5E20", textBackgroundColor: "#0D3D0D" };
            const entryMetaInfo = useChapter1
                ? [{ key: "SectionId", value: sectionId }, { key: "TileSize", value: tileSize }]
                : [
                    { key: "SectionId", value: sectionId }, { key: "LayoutId", value: "Neodyme.99" },
                    { key: "TileSize", value: tileSize }, { key: "AnalyticOfferGroupId", value: `Neodyme/${categoryKey}` },
                    { key: "FirstSeen", value: "2/2/2020" }, { key: "inDate", value: "2018-04-30T00:00:00.000Z" },
                    { key: "outDate", value: "9999-12-31T23:59:59.999Z" },
                    { key: "color1", value: "#50C878" }, { key: "color2", value: "#1B5E20" },
                    { key: "textBackgroundColor", value: "#0D3D0D" }
                  ];

            for (const item of picked) {
                usedIds.add(item.id);
                const itemGrants = this.formatItemGrants(item);
                const price = this.calculatePrice(item);

                const entry = {
                    devName: "",
                    offerId: "",
                    fulfillmentIds: [],
                    dailyLimit: -1, weeklyLimit: -1, monthlyLimit: -1,
                    categories: [],
                    prices: [{
                        currencyType: "MtxCurrency", currencySubType: "",
                        regularPrice: price, finalPrice: price,
                        saleExpiration: "9999-12-02T01:12:00Z", basePrice: price
                    }],
                    meta: entryMeta,
                    matchFilter: "", filterWeight: 0, appStoreId: [],
                    requirements: itemGrants.map(tpl => ({ requirementType: "DenyOnItemOwnership", requiredId: tpl, minQuantity: 1 })),
                    offerType: "StaticPrice",
                    giftInfo: { bIsEnabled: true, forcedGiftBoxTemplateId: "", purchaseRequirements: [], giftRecordIds: [] },
                    refundable: true,
                    metaInfo: entryMetaInfo,
                    displayAssetPath: "",
                    itemGrants: itemGrants.map(tpl => ({ templateId: tpl, quantity: 1 })),
                    sortPriority: categoryKey === "daily" ? -1 : 0,
                    catalogGroupPriority: 0
                };

                const offerKey = itemGrants.join('') + price;
                entry.offerId = crypto.createHash('sha1').update(offerKey).digest('hex');
                entry.devName = entry.offerId;

                catalog.storefronts[storefrontIndex].catalogEntries.push(entry);
            }
        }

        if (shopConfig.includeBattlePass !== false && season >= 11) {
            this.addBattlePassOffers(catalog, season);
        }

        return catalog;
    }
}

module.exports = ItemShop;
