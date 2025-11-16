class ItemShop {
    static getItemShop() {
        const catalog = JSON.parse(JSON.stringify(require("../../../content/catalog.json")));
        const CatalogConfig = require("../../../data/shop.json");
    
        try {
            for (var value in CatalogConfig) {
                if (Array.isArray(CatalogConfig[value].itemGrants)) {
                    if (CatalogConfig[value].itemGrants.length != 0) {
                        const CatalogEntry = {"devName":"","offerId":"","fulfillmentIds":[],"dailyLimit":-1,"weeklyLimit":-1,"monthlyLimit":-1,"categories":[],"prices":[{"currencyType":"MtxCurrency","currencySubType":"","regularPrice":0,"finalPrice":0,"saleExpiration":"9999-12-02T01:12:00Z","basePrice":0}],"meta":{"NewDisplayAssetPath":"","SectionId":"Featured","LayoutId":"Neodyme.99","TileSize":"Small","AnalyticOfferGroupId":"Neodyme/Attitude8","FirstSeen":"2/2/2020"},"matchFilter":"","filterWeight":0,"appStoreId":[],"requirements":[],"offerType":"StaticPrice","giftInfo":{"bIsEnabled":false,"forcedGiftBoxTemplateId":"","purchaseRequirements":[],"giftRecordIds":[]},"refundable":true,"metaInfo":[{"key":"NewDisplayAssetPath","value":"="},{"key":"SectionId","value":"Featured"},{"key":"LayoutId","value":"Neodyme.99"},{"key":"TileSize","value":"Small"},{"key":"AnalyticOfferGroupId","value":"Neodyme/Attitude8"},{"key":"FirstSeen","value":"2/2/2020"}],"displayAssetPath":"","itemGrants":[],"sortPriority":0,"catalogGroupPriority":0};
    
                        if (value.toLowerCase().startsWith("daily")) {
                            catalog.storefronts.forEach((storefront, i) => {
                                if (storefront.name == "BRDailyStorefront") {
                                    CatalogEntry.requirements = [];
                                    CatalogEntry.itemGrants = [];
    
                                    for (var x in CatalogConfig[value].itemGrants) {
                                        if (typeof CatalogConfig[value].itemGrants[x] == "string") {
                                            if (CatalogConfig[value].itemGrants[x].length != 0) {
                                                CatalogEntry.devName = CatalogConfig[value].itemGrants[0]
                                                CatalogEntry.offerId = CatalogConfig[value].itemGrants[0]
    
                                                CatalogEntry.requirements.push({ "requirementType": "DenyOnItemOwnership", "requiredId": CatalogConfig[value].itemGrants[x], "minQuantity": 1 })
                                                CatalogEntry.itemGrants.push({ "templateId": CatalogConfig[value].itemGrants[x], "quantity": 1 });
                                            }
                                        }
                                    }
    
                                    CatalogEntry.prices[0].basePrice = CatalogConfig[value].price
                                    CatalogEntry.prices[0].regularPrice = CatalogConfig[value].price
                                    CatalogEntry.prices[0].finalPrice = CatalogConfig[value].price
    
                                    CatalogEntry.sortPriority = -1
    
                                    if (CatalogEntry.itemGrants.length != 0) {
                                        catalog.storefronts[i].catalogEntries.push(CatalogEntry);
                                    }
                                }
                            })
                        }
    
                        if (value.toLowerCase().startsWith("featured")) {
                            catalog.storefronts.forEach((storefront, i) => {
                                if (storefront.name == "BRWeeklyStorefront") {
                                    CatalogEntry.requirements = [];
                                    CatalogEntry.itemGrants = [];
    
                                    for (var x in CatalogConfig[value].itemGrants) {
                                        if (typeof CatalogConfig[value].itemGrants[x] == "string") {
                                            if (CatalogConfig[value].itemGrants[x].length != 0) {
                                                CatalogEntry.devName = CatalogConfig[value].itemGrants[0]
                                                CatalogEntry.offerId = CatalogConfig[value].itemGrants[0]
    
                                                CatalogEntry.requirements.push({ "requirementType": "DenyOnItemOwnership", "requiredId": CatalogConfig[value].itemGrants[x], "minQuantity": 1 })
                                                CatalogEntry.itemGrants.push({ "templateId": CatalogConfig[value].itemGrants[x], "quantity": 1 });
                                            }
                                        }
                                    }
    
                                    CatalogEntry.prices[0].basePrice = CatalogConfig[value].price
                                    CatalogEntry.prices[0].regularPrice = CatalogConfig[value].price
                                    CatalogEntry.prices[0].finalPrice = CatalogConfig[value].price
    
                                    CatalogEntry.meta.TileSize = "Normal"
                                    CatalogEntry.metaInfo[3].value = "Normal"
    
                                    if (CatalogEntry.itemGrants.length != 0) {
                                        catalog.storefronts[i].catalogEntries.push(CatalogEntry);
                                    }
                                }
                            })
                        }
                    }
                }
            }
        } catch (err) {}
    
        return catalog;
    }
}

module.exports = ItemShop;