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

    static getItemShop() {
        const catalog = JSON.parse(JSON.stringify(require("../../../content/catalog.json")));
        const CatalogConfig = require("../../../data/shop.json");
        const shopConfig = this.getShopConfig();
        const categories = shopConfig.shopCategories || {};

        try {
            for (var value in CatalogConfig) {
                if (value === '//' || !Array.isArray(CatalogConfig[value].itemGrants)) continue;
                if (CatalogConfig[value].itemGrants.length === 0) continue;

                let matchedCategory = null;
                let categoryKey = null;

                for (const [key, catConfig] of Object.entries(categories)) {
                    if (value.toLowerCase().startsWith(key.toLowerCase())) {
                        matchedCategory = catConfig;
                        categoryKey = key;
                        break;
                    }
                }

                if (!matchedCategory) continue;

                const storefrontName = matchedCategory.storefrontName || 'BRDailyStorefront';
                const tileSize = matchedCategory.tileSize || CatalogConfig[value].meta?.tileSize || 'Small';

                const storefrontIndex = catalog.storefronts.findIndex(sf => sf.name === storefrontName);

                if (storefrontIndex === -1) {
                    catalog.storefronts.push({
                        name: storefrontName,
                        catalogEntries: []
                    });
                }

                const targetStorefrontIndex = storefrontIndex === -1 ? catalog.storefronts.length - 1 : storefrontIndex;

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
                    meta: {
                        NewDisplayAssetPath: "",
                        SectionId: matchedCategory.displayName || categoryKey,
                        LayoutId: "Neodyme.99",
                        TileSize: tileSize,
                        AnalyticOfferGroupId: `Neodyme/${categoryKey}`,
                        FirstSeen: "2/2/2020"
                    },
                    matchFilter: "",
                    filterWeight: 0,
                    appStoreId: [],
                    requirements: [],
                    offerType: "StaticPrice",
                    giftInfo: {
                        bIsEnabled: false,
                        forcedGiftBoxTemplateId: "",
                        purchaseRequirements: [],
                        giftRecordIds: []
                    },
                    refundable: true,
                    metaInfo: [
                        { key: "NewDisplayAssetPath", value: "=" },
                        { key: "SectionId", value: matchedCategory.displayName || categoryKey },
                        { key: "LayoutId", value: "Neodyme.99" },
                        { key: "TileSize", value: tileSize },
                        { key: "AnalyticOfferGroupId", value: `Neodyme/${categoryKey}` },
                        { key: "FirstSeen", value: "2/2/2020" }
                    ],
                    displayAssetPath: "",
                    itemGrants: [],
                    sortPriority: 0,
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
                        }
                    }
                }

                CatalogEntry.prices[0].basePrice = CatalogConfig[value].price;
                CatalogEntry.prices[0].regularPrice = CatalogConfig[value].price;
                CatalogEntry.prices[0].finalPrice = CatalogConfig[value].price;
                CatalogEntry.sortPriority = -1;

                if (CatalogEntry.itemGrants.length !== 0) {
                    catalog.storefronts[targetStorefrontIndex].catalogEntries.push(CatalogEntry);
                }
            }
        } catch (err) {
            console.error('[Shop] Error building catalog:', err.message);
        }

        return catalog;
    }
}

module.exports = ItemShop;
