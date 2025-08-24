const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { Errors } = require('../errors/errors');
const { LoggerService } = require('../utils/logger');

class ShopService {
    constructor() {
        this.catalogPath = path.join(process.cwd(), 'static-content', 'catalog.json');
        this.keychainPath = path.join(process.cwd(), 'static-content', 'keychain.json');
        this.currentShop = null;
        this.shopRotationInterval = null;
        this.loadShop();
    }

    async loadShop() {
        try {
            const catalogData = await fs.readFile(this.catalogPath, 'utf8');
            this.currentShop = JSON.parse(catalogData);
        } catch (error) {
            LoggerService.log('error', `Failed to load shop catalog: ${error}`);
            this.currentShop = this.generateDefaultShop();
        }
    }

    generateDefaultShop() {
        const expiration = new Date();
        expiration.setHours(expiration.getHours() + 24);

        return {
            refreshIntervalHrs: 24,
            dailyPurchaseHrs: 24,
            expiration: expiration.toISOString(),
            storefronts: [
                {
                    name: "BRDailyStorefront",
                    catalogEntries: this.generateDailyItems()
                },
                {
                    name: "BRWeeklyStorefront",
                    catalogEntries: this.generateWeeklyItems()
                },
                {
                    name: "BRSeason",
                    catalogEntries: []
                }
            ]
        };
    }

    generateDailyItems() {
        const dailyItems = [
            { id: "CID_001_Athena_Commando_F_Default", name: "Recruit", price: 800, rarity: "Uncommon" },
            { id: "CID_002_Athena_Commando_F_Default", name: "Ramirez", price: 800, rarity: "Uncommon" },
            { id: "CID_003_Athena_Commando_F_Default", name: "Banshee", price: 800, rarity: "Uncommon" },
            { id: "CID_004_Athena_Commando_F_Default", name: "Wildcat", price: 800, rarity: "Uncommon" },
            { id: "Pickaxe_ID_001_Default", name: "Default Pickaxe", price: 500, rarity: "Common" },
            { id: "Glider_ID_001_Default", name: "Default Glider", price: 500, rarity: "Common" }
        ];

        return dailyItems.map(item => this.createCatalogEntry(item));
    }

    generateWeeklyItems() {
        const weeklyItems = [
            { id: "CID_029_Athena_Commando_F_Halloween", name: "Skull Trooper", price: 1500, rarity: "Rare" },
            { id: "CID_030_Athena_Commando_M_Halloween", name: "Ghoul Trooper", price: 1500, rarity: "Rare" },
            { id: "CID_032_Athena_Commando_M_Medieval", name: "Blue Squire", price: 1200, rarity: "Rare" },
            { id: "CID_033_Athena_Commando_F_Medieval", name: "Royale Knight", price: 1200, rarity: "Rare" },
            { id: "CID_035_Athena_Commando_M_Medieval", name: "Black Knight", price: 2000, rarity: "Legendary" },
            { id: "BID_001_Blue", name: "Blue Shield", price: 1200, rarity: "Rare" },
            { id: "Pickaxe_ID_011_Medieval", name: "Axecalibur", price: 1200, rarity: "Rare" },
            { id: "Glider_ID_003_Medieval", name: "Sir Glider the Brave", price: 800, rarity: "Uncommon" }
        ];

        return weeklyItems.map(item => this.createCatalogEntry(item));
    }

    createCatalogEntry(item) {
        const offerId = `v2:/${crypto.randomBytes(16).toString('hex')}`;
        
        return {
            devName: `[VIRTUAL]${item.id}`,
            offerId: offerId,
            fulfillmentIds: [],
            dailyLimit: -1,
            weeklyLimit: -1,
            monthlyLimit: -1,
            categories: [],
            prices: [
                {
                    currencyType: "MtxCurrency",
                    currencySubType: "",
                    regularPrice: item.price,
                    dynamicRegularPrice: item.price,
                    finalPrice: item.price,
                    saleExpiration: "9999-12-31T23:59:59.999Z",
                    basePrice: item.price
                }
            ],
            meta: {
                NewDisplayAssetPath: `/Game/Catalog/NewDisplayAssets/${item.id}.${item.id}`,
                SectionId: "Featured",
                LayoutId: "Normal",
                TileSize: "Normal",
                AnalyticOfferGroupId: item.id,
                DisplayAssetPath: ""
            },
            matchFilter: "",
            filterWeight: 0,
            appStoreId: [],
            requirements: [
                {
                    requirementType: "DenyOnItemOwnership",
                    requiredId: item.id,
                    minQuantity: 1
                }
            ],
            offerType: "StaticPrice",
            giftInfo: {
                bIsEnabled: true,
                forcedGiftBoxTemplateId: "",
                purchaseRequirements: [],
                giftRecordIds: []
            },
            refundable: true,
            metaInfo: [
                {
                    key: "NewDisplayAssetPath",
                    value: `/Game/Catalog/NewDisplayAssets/${item.id}.${item.id}`
                },
                {
                    key: "SectionId",
                    value: "Featured"
                },
                {
                    key: "TileSize",
                    value: "Normal"
                }
            ],
            displayAssetPath: "",
            itemGrants: [
                {
                    templateId: item.id,
                    quantity: 1
                }
            ],
            additionalGrants: [],
            sortPriority: 0,
            catalogGroupPriority: 0
        };
    }

    async getItemShop(version) {
        await this.loadShop(); // Reload to get latest changes

        // Version-specific modifications
        if (version && version.build >= 30.10) {
            // Replace "Normal" with "Size_1_x_2" for newer versions
            let shopStr = JSON.stringify(this.currentShop);
            shopStr = shopStr.replace(/"Normal"/g, '"Size_1_x_2"');
            return JSON.parse(shopStr);
        }

        if (version && version.build >= 30.20) {
            // Update card pack paths for newer versions
            let shopStr = JSON.stringify(this.currentShop);
            shopStr = shopStr.replace(/Game\/Items\/CardPacks\//g, 'SaveTheWorld/Items/CardPacks/');
            return JSON.parse(shopStr);
        }

        return this.currentShop;
    }

    async getKeychain() {
        try {
            const keychainData = await fs.readFile(this.keychainPath, 'utf8');
            return JSON.parse(keychainData);
        } catch (error) {
            // Return random
            return [
                "B3E6E91B4E839977C8C8E394B1C96B21",
                "74C92E7B4EB02D1E0FA67AFBF17168BF",
                "C2658FACD2304A3E89BB962FE4055E8C"
            ];
        }
    }

    async purchaseItem(accountId, offerId, expectedTotalPrice, profileService) {
        await this.loadShop();

        // Find the offer
        let catalogEntry = null;
        for (const storefront of this.currentShop.storefronts) {
            catalogEntry = storefront.catalogEntries.find(entry => entry.offerId === offerId);
            if (catalogEntry) break;
        }

        if (!catalogEntry) {
            throw Errors.GameCatalog.itemNotFound(offerId);
        }

        // Verify price
        const price = catalogEntry.prices[0];
        if (price.finalPrice !== expectedTotalPrice) {
            throw Errors.GameCatalog.priceMismatch(expectedTotalPrice, price.finalPrice);
        }

        // Check if player owns the item
        const profile = await profileService.getProfile(accountId, 'athena');
        const itemGrant = catalogEntry.itemGrants[0];
        
        if (profile.items) {
            const ownsItem = Object.values(profile.items).some(
                item => item.templateId === itemGrant.templateId
            );
            if (ownsItem) {
                throw Errors.Storefront.alreadyOwned();
            }
        }

        // Check currency
        const commonCore = await profileService.getProfile(accountId, 'common_core');
        let vbucksItem = null;
        let vbucksAmount = 0;

        if (commonCore.items) {
            for (const [id, item] of Object.entries(commonCore.items)) {
                if (item.templateId === "Currency:MtxPurchased") {
                    vbucksItem = { id, item };
                    vbucksAmount = item.quantity || 0;
                    break;
                }
            }
        }

        if (vbucksAmount < price.finalPrice) {
            throw Errors.Storefront.currencyInsufficient();
        }

        // Deduct currency
        await profileService.updateItemQuantity(
            accountId, 
            'common_core', 
            vbucksItem.id, 
            vbucksAmount - price.finalPrice
        );

        // Grant items
        const grantResults = [];
        for (const grant of catalogEntry.itemGrants) {
            const result = await profileService.grantItem(
                accountId,
                'athena',
                grant.templateId,
                grant.quantity
            );
            grantResults.push(result);
        }

        // Grant additional items if any
        for (const grant of catalogEntry.additionalGrants) {
            const result = await profileService.grantItem(
                accountId,
                'athena',
                grant.templateId,
                grant.quantity
            );
            grantResults.push(result);
        }

        return {
            purchaseId: crypto.randomBytes(16).toString('hex'),
            offerId,
            purchasedItems: grantResults,
            totalPrice: price.finalPrice,
            currency: "MtxCurrency"
        };
    }

    async refreshShop() {
        this.currentShop = this.generateDefaultShop();
        await fs.writeFile(this.catalogPath, JSON.stringify(this.currentShop, null, 2));
        LoggerService.log('info', `Shop refreshed at ${new Date().toISOString()}`);
    }

    startShopRotation(intervalHours = 24) {
        // Clear existing interval if any
        if (this.shopRotationInterval) {
            clearInterval(this.shopRotationInterval);
        }

        // Set up rotation
        this.shopRotationInterval = setInterval(() => {
            this.refreshShop();
        }, intervalHours * 60 * 60 * 1000);

        LoggerService.log('info', `Shop rotation started: every ${intervalHours} hours`);
    }

    stopShopRotation() {
        if (this.shopRotationInterval) {
            clearInterval(this.shopRotationInterval);
            this.shopRotationInterval = null;
            LoggerService.log('info', `Shop rotation stopped`);
        }
    }

    async addItemToShop(storefront, item) {
        await this.loadShop();
        
        const targetStorefront = this.currentShop.storefronts.find(sf => sf.name === storefront);
        if (!targetStorefront) {
            throw new Error(`Storefront ${storefront} not found`);
        }

        targetStorefront.catalogEntries.push(this.createCatalogEntry(item));
        await fs.writeFile(this.catalogPath, JSON.stringify(this.currentShop, null, 2));
    }

    async removeItemFromShop(offerId) {
        await this.loadShop();
        
        for (const storefront of this.currentShop.storefronts) {
            const index = storefront.catalogEntries.findIndex(entry => entry.offerId === offerId);
            if (index !== -1) {
                storefront.catalogEntries.splice(index, 1);
                await fs.writeFile(this.catalogPath, JSON.stringify(this.currentShop, null, 2));
                return true;
            }
        }
        
        return false;
    }

    async updateItemPrice(offerId, newPrice) {
        await this.loadShop();
        
        for (const storefront of this.currentShop.storefronts) {
            const entry = storefront.catalogEntries.find(e => e.offerId === offerId);
            if (entry) {
                entry.prices[0].regularPrice = newPrice;
                entry.prices[0].dynamicRegularPrice = newPrice;
                entry.prices[0].finalPrice = newPrice;
                entry.prices[0].basePrice = newPrice;
                
                await fs.writeFile(this.catalogPath, JSON.stringify(this.currentShop, null, 2));
                return true;
            }
        }
        
        return false;
    }
}

// Export singleton instance
const shopService = new ShopService();
module.exports = shopService;