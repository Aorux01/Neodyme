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

        // Battle Pass Offer (950 V-Bucks) - Using BigBrotatoFN structure
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
