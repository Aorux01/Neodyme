const express = require('express');
const router = express.Router();
const MCPMiddleware = require('../../../src/middleware/mcp-middleware');
const MCPResponseBuilder = require('../../../src/utils/mcp-response-builder');
const DatabaseManager = require('../../../src/manager/database-manager');
const VersionService = require('../../../src/service/api/version-service');
const LoggerService = require('../../../src/service/logger/logger-service');
const FunctionsService = require('../../../src/service/api/functions-service');
const ConfigManager = require('../../../src/manager/config-manager');
const ShopService = require("../../../src/service/api/shop-service");
const EXPService = require('../../../src/service/api/experience-service');
const { Errors, sendError } = require('../../../src/service/error/errors-system');
const CreatorCodeService = require('../../../src/service/api/creator-code-service');
const fs = require('fs').promises;
const path = require('path');

router.use(MCPMiddleware.validateProfileId);

router.post("/fortnite/api/game/v2/profile/:accountId/client/PurchaseCatalogEntry",
    MCPMiddleware.validateAccountOwnership,
    MCPMiddleware.attachProfileInfo,
    async (req, res) => {
        try {
            await EXPService.loadConfig();

            const accountId = req.params.accountId;
            const profileId = req.query.profileId || 'profile0';
            const queryRevision = req.query.rvn || -1;
            const { offerId, purchaseQuantity, currencySubType } = req.body;

            const profile = await DatabaseManager.getProfile(accountId, profileId);
            
            if (!profile) {
                const err = Errors.MCP.profileNotFound(accountId);
                return res.status(err.statusCode).json(err.toJSON());
            }

            let campaign = await DatabaseManager.getProfile(accountId, 'campaign');
            let athena = await DatabaseManager.getProfile(accountId, 'athena');
            // Share the same object reference so mutations (rvn, items) stay in sync with profile
            let commonCore = profileId === 'common_core' ? profile : await DatabaseManager.getProfile(accountId, 'common_core');

            const changes = [];
            const multiUpdate = [];
            const notifications = [];
            let purchasedLlama = false;
            let athenaModified = false;
            let itemExists = false;

            const versionInfo = VersionService.getVersionInfo(req);
            const shopConfig = ShopService.getShopConfig();
            const catalog = shopConfig.randomShop
                ? await ShopService.getRandomItemShop(versionInfo.season)
                : ShopService.getItemShop(versionInfo.season);
            const affiliateCode = commonCore?.stats?.attributes?.mtx_affiliate || null;

            // Validate that offerId exists in the catalog
            if (offerId) {
                let offerFound = false;
                for (const storefront of catalog.storefronts) {
                    if (storefront.catalogEntries.some(e => e.offerId === offerId)) {
                        offerFound = true;
                        break;
                    }
                }
                if (!offerFound) {
                    return sendError(res, Errors.custom(
                        'errors.com.epicgames.fortnite.id_invalid',
                        `Offer ID (id: '${offerId}') not found`,
                        [offerId], 16027, 400
                    ));
                }

                // Pre-validate V-Bucks balance (using common_core as source of truth)
                for (const storefront of catalog.storefronts) {
                    for (const entry of storefront.catalogEntries) {
                        if (entry.offerId === offerId && entry.prices?.[0]?.currencyType?.toLowerCase() === 'mtxcurrency') {
                            const totalPrice = entry.prices[0].finalPrice * (purchaseQuantity || 1);
                            for (const key in commonCore.items) {
                                const item = commonCore.items[key];
                                if (item.templateId?.toLowerCase().startsWith('currency:mtx')) {
                                    const platform = item.attributes?.platform?.toLowerCase();
                                    const currentPlatform = commonCore.stats?.attributes?.current_mtx_platform?.toLowerCase();
                                    if (platform === currentPlatform || platform === 'shared') {
                                        if (item.quantity < totalPrice) {
                                            return sendError(res, Errors.custom(
                                                'errors.com.epicgames.currency.mtx.insufficient',
                                                `You cannot afford this item (${totalPrice}), you only have ${item.quantity}.`,
                                                [`${totalPrice}`, `${item.quantity}`], 1040, 400
                                            ));
                                        }
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }

            // Handle Battle Pass purchases (works for all profileIds)
            if (offerId && !purchasedLlama) {
                for (const storefront of catalog.storefronts) {
                    if (storefront.name.startsWith("BRSeason")) {
                        if (!Number.isNaN(Number(storefront.name.split("BRSeason")[1]))) {
                            const offer = storefront.catalogEntries.find(i => i.offerId === offerId);

                            if (offer) {
                                // Initialize multi-update for athena profile
                                if (multiUpdate.length === 0) {
                                    multiUpdate.push({
                                        profileRevision: athena.rvn || 0,
                                        profileId: "athena",
                                        profileChangesBaseRevision: athena.rvn || 0,
                                        profileChanges: [],
                                        profileCommandRevision: athena.commandRevision || 0
                                    });
                                }

                                const seasonName = storefront.name.split("BR")[1];

                                let battlePass;
                                try {
                                    const battlePassPath = path.join(__dirname, `../../../content/athena/battlepasses/${seasonName.replace(/^Season(\d+)$/, 'season-$1')}.json`);
                                    const data = await fs.readFile(battlePassPath, 'utf-8');
                                    battlePass = JSON.parse(data);
                                } catch (error) {
                                    LoggerService.log('error', `Battle pass not found for ${seasonName}`);
                                    break;
                                }

                                if (battlePass) {
                                    let seasonData = await DatabaseManager.getAthenaProfile(accountId, 'season-data');
                                    if (!seasonData) seasonData = {};

                                    if (!seasonData[seasonName]) {
                                        seasonData[seasonName] = {
                                            battlePassPurchased: false,
                                            battlePassTier: 1,
                                            battlePassXPBoost: 0,
                                            battlePassXPFriendBoost: 0
                                        };
                                    }

                                    // Battle Pass purchase (950 V-Bucks)
                                    if (battlePass.battlePassOfferId === offer.offerId || battlePass.battleBundleOfferId === offer.offerId) {
                                        // Prevent double purchase
                                        if (seasonData[seasonName].battlePassPurchased) {
                                            return sendError(res, Errors.custom(
                                                'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed',
                                                'Battle Pass already purchased for this season.',
                                                19000, 400
                                            ));
                                        }

                                        const lootList = [];
                                        let endingTier = seasonData[seasonName].battlePassTier;
                                        seasonData[seasonName].battlePassPurchased = true;

                                        // Battle Bundle gives +25 tiers
                                        if (battlePass.battleBundleOfferId === offer.offerId) {
                                            seasonData[seasonName].battlePassTier += 25;
                                            if (seasonData[seasonName].battlePassTier > 100) {
                                                seasonData[seasonName].battlePassTier = 100;
                                            }
                                            endingTier = seasonData[seasonName].battlePassTier;
                                        }

                                        if (!athena.stats) athena.stats = {};
                                        if (!athena.stats.attributes) athena.stats.attributes = {};

                                        athena.stats.attributes.book_purchased = seasonData[seasonName].battlePassPurchased;
                                        athena.stats.attributes.book_level = seasonData[seasonName].battlePassTier;
                                        athena.stats.attributes.season_match_boost = seasonData[seasonName].battlePassXPBoost;
                                        athena.stats.attributes.season_friend_match_boost = seasonData[seasonName].battlePassXPFriendBoost;

                                        // Add NoBattleBundle token to common_core to mark pass as purchased
                                        const seasonNum = Number(seasonName.replace('Season', ''));
                                        const nbbTokenKey = `Token:Athena_S${seasonNum}_NoBattleBundleOption_Token`;
                                        if (!commonCore.items[nbbTokenKey]) {
                                            const nbbTokenData = {
                                                templateId: `Token:athena_s${seasonNum}_nobattlebundleoption_token`,
                                                attributes: { max_level_bonus: 0, level: 1, item_seen: true, xp: 0, favorite: false },
                                                quantity: 1
                                            };
                                            commonCore.items[nbbTokenKey] = nbbTokenData;
                                            await DatabaseManager.addItemToProfile(accountId, 'common_core', nbbTokenKey, nbbTokenData);
                                            changes.push(MCPResponseBuilder.createItemAdded(nbbTokenKey, nbbTokenData));
                                        }

                                        // Grant rewards for all tiers
                                        for (let i = 0; i < endingTier; i++) {
                                            const freeTier = battlePass.freeRewards[i] || {};
                                            const paidTier = battlePass.paidRewards[i] || {};

                                            for (const item in freeTier) {
                                                const tpl = item.toLowerCase();
                                                if (tpl === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += freeTier[item];
                                                    multiUpdate[0].profileChanges.push({ changeType: "statModified", name: "season_match_boost", value: seasonData[seasonName].battlePassXPBoost });
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                    continue;
                                                }
                                                if (tpl === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += freeTier[item];
                                                    multiUpdate[0].profileChanges.push({ changeType: "statModified", name: "season_friend_match_boost", value: seasonData[seasonName].battlePassXPFriendBoost });
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                    continue;
                                                }
                                                if (tpl.startsWith("homebasebanner")) {
                                                    const alreadyInProfile = Object.values(commonCore.items).some(e => e.templateId.toLowerCase() === tpl);
                                                    if (!alreadyInProfile) {
                                                        const itemId = DatabaseManager.generateItemId(item);
                                                        const profileItem = { templateId: item, attributes: { item_seen: false }, quantity: 1 };
                                                        commonCore.items[itemId] = profileItem;
                                                        await DatabaseManager.addItemToProfile(accountId, 'common_core', itemId, profileItem);
                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, profileItem));
                                                    }
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                    continue;
                                                }
                                                if (tpl.startsWith("currency:mtx")) {
                                                    for (const key in commonCore.items) {
                                                        if (commonCore.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (commonCore.items[key].attributes?.platform?.toLowerCase() === commonCore.stats?.attributes?.current_mtx_platform?.toLowerCase() ||
                                                                commonCore.items[key].attributes?.platform?.toLowerCase() === "shared") {
                                                                commonCore.items[key].quantity += freeTier[item];
                                                                await DatabaseManager.updateItemInProfile(accountId, 'common_core', key, { quantity: commonCore.items[key].quantity });
                                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, commonCore.items[key].quantity));
                                                                break;
                                                            }
                                                        }
                                                    }
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                    continue;
                                                }
                                                const alreadyOwned = Object.values(athena.items).some(e => e.templateId.toLowerCase() === tpl);
                                                if (!alreadyOwned) {
                                                    const itemId = DatabaseManager.generateItemId(item);
                                                    const athenaItem = { templateId: item, attributes: { max_level_bonus: 0, level: 1, item_seen: false, xp: 0, variants: [], favorite: false }, quantity: freeTier[item] };
                                                    athena.items[itemId] = athenaItem;
                                                    await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);
                                                    multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    lootList.push({ itemType: item, itemGuid: itemId, quantity: freeTier[item] });
                                                } else {
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                }
                                            }

                                            for (const item in paidTier) {
                                                const tpl = item.toLowerCase();
                                                if (tpl === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += paidTier[item];
                                                    multiUpdate[0].profileChanges.push({ changeType: "statModified", name: "season_match_boost", value: seasonData[seasonName].battlePassXPBoost });
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: paidTier[item] });
                                                    continue;
                                                }
                                                if (tpl === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += paidTier[item];
                                                    multiUpdate[0].profileChanges.push({ changeType: "statModified", name: "season_friend_match_boost", value: seasonData[seasonName].battlePassXPFriendBoost });
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: paidTier[item] });
                                                    continue;
                                                }
                                                const alreadyOwned = Object.values(athena.items).some(e => e.templateId.toLowerCase() === tpl);
                                                if (!alreadyOwned) {
                                                    const itemId = DatabaseManager.generateItemId(item);
                                                    const athenaItem = { templateId: item, attributes: { max_level_bonus: 0, level: 1, item_seen: false, xp: 0, variants: [], favorite: false }, quantity: paidTier[item] };
                                                    athena.items[itemId] = athenaItem;
                                                    await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);
                                                    multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    lootList.push({ itemType: item, itemGuid: itemId, quantity: paidTier[item] });
                                                } else {
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: paidTier[item] });
                                                }
                                            }
                                        }

                                        // Add gift box
                                        const giftBoxId = DatabaseManager.generateItemId();
                                        const seasonNumber = Number(seasonName.split("Season")[1]);
                                        const giftBox = {
                                            templateId: seasonNumber > 4 ? "GiftBox:gb_battlepasspurchased" : "GiftBox:gb_battlepass",
                                            attributes: {
                                                max_level_bonus: 0,
                                                fromAccountId: "",
                                                lootList: lootList
                                            },
                                            quantity: 1
                                        };

                                        if (seasonNumber > 2) {
                                            if (profile.profileId === 'common_core') {
                                                commonCore.items[giftBoxId] = giftBox;
                                                await DatabaseManager.addItemToProfile(accountId, 'common_core', giftBoxId, giftBox);
                                                changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));
                                            } else {
                                                profile.items[giftBoxId] = giftBox;
                                                await DatabaseManager.addItemToProfile(accountId, profileId, giftBoxId, giftBox);
                                                changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));
                                            }
                                        }

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "season_num",
                                            value: versionInfo.season
                                        });

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_purchased",
                                            value: seasonData[seasonName].battlePassPurchased
                                        });

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_level",
                                            value: seasonData[seasonName].battlePassTier
                                        });

                                        // Deduct V-Bucks
                                        if (offer.prices && offer.prices[0] && offer.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                            for (const key in commonCore.items) {
                                                if (commonCore.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                    if (commonCore.items[key].attributes.platform.toLowerCase() === commonCore.stats.attributes.current_mtx_platform.toLowerCase() ||
                                                        commonCore.items[key].attributes.platform.toLowerCase() === "shared") {

                                                        const price = offer.prices[0].finalPrice;
                                                        commonCore.items[key].quantity -= price;

                                                        await DatabaseManager.updateItemInProfile(accountId, 'common_core', key, {
                                                            quantity: commonCore.items[key].quantity
                                                        });

                                                        changes.push(MCPResponseBuilder.createItemQuantityChanged(key, commonCore.items[key].quantity));

                                                        commonCore.rvn += 1;
                                                        commonCore.commandRevision += 1;

                                                        if (affiliateCode) {
                                                            const commissionResult = await CreatorCodeService.recordUsage(affiliateCode, price);
                                                            if (commissionResult.success && commissionResult.commission > 0) {
                                                                await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                                                            }
                                                        }

                                                        break;
                                                    }
                                                }
                                            }
                                        }

                                        athenaModified = true;
                                    }

                                    // Tier purchase (150 V-Bucks per tier)
                                    if (battlePass.tierOfferId === offer.offerId) {
                                        const lootList = [];
                                        const startingTier = seasonData[seasonName].battlePassTier;
                                        seasonData[seasonName].battlePassTier += purchaseQuantity || 1;
                                        const endingTier = seasonData[seasonName].battlePassTier;

                                        if (!athena.stats) athena.stats = {};
                                        if (!athena.stats.attributes) athena.stats.attributes = {};
                                        athena.stats.attributes.book_level = seasonData[seasonName].battlePassTier;

                                        const xpResult = EXPService.addXpForTiersPurchased(athena, purchaseQuantity || 1);
                                        athena = xpResult.profile;

                                        const xpChanges = EXPService.createStatModifiedChanges(xpResult.beforeChanges, xpResult.afterChanges);
                                        multiUpdate[0].profileChanges.push(...xpChanges);

                                        // Grant rewards for purchased tiers
                                        for (let i = startingTier; i < endingTier; i++) {
                                            const freeTier = battlePass.freeRewards[i] || {};
                                            const paidTier = battlePass.paidRewards[i] || {};

                                            for (const item in freeTier) {
                                                const tpl = item.toLowerCase();
                                                if (tpl === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += freeTier[item];
                                                    multiUpdate[0].profileChanges.push({ changeType: "statModified", name: "season_match_boost", value: seasonData[seasonName].battlePassXPBoost });
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                    continue;
                                                }
                                                if (tpl === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += freeTier[item];
                                                    multiUpdate[0].profileChanges.push({ changeType: "statModified", name: "season_friend_match_boost", value: seasonData[seasonName].battlePassXPFriendBoost });
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                    continue;
                                                }
                                                if (tpl.startsWith("homebasebanner")) {
                                                    const alreadyInProfile = Object.values(commonCore.items).some(e => e.templateId.toLowerCase() === tpl);
                                                    if (!alreadyInProfile) {
                                                        const itemId = DatabaseManager.generateItemId(item);
                                                        const profileItem = { templateId: item, attributes: { item_seen: false }, quantity: 1 };
                                                        commonCore.items[itemId] = profileItem;
                                                        await DatabaseManager.addItemToProfile(accountId, 'common_core', itemId, profileItem);
                                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, profileItem));
                                                    }
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                    continue;
                                                }
                                                if (tpl.startsWith("currency:mtx")) {
                                                    for (const key in commonCore.items) {
                                                        if (commonCore.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                            if (commonCore.items[key].attributes?.platform?.toLowerCase() === commonCore.stats?.attributes?.current_mtx_platform?.toLowerCase() ||
                                                                commonCore.items[key].attributes?.platform?.toLowerCase() === "shared") {
                                                                commonCore.items[key].quantity += freeTier[item];
                                                                await DatabaseManager.updateItemInProfile(accountId, 'common_core', key, { quantity: commonCore.items[key].quantity });
                                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, commonCore.items[key].quantity));
                                                                break;
                                                            }
                                                        }
                                                    }
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                    continue;
                                                }
                                                const alreadyOwned = Object.values(athena.items).some(e => e.templateId.toLowerCase() === tpl);
                                                if (!alreadyOwned) {
                                                    const itemId = DatabaseManager.generateItemId(item);
                                                    const athenaItem = { templateId: item, attributes: { max_level_bonus: 0, level: 1, item_seen: false, xp: 0, variants: [], favorite: false }, quantity: freeTier[item] };
                                                    athena.items[itemId] = athenaItem;
                                                    await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);
                                                    multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    lootList.push({ itemType: item, itemGuid: itemId, quantity: freeTier[item] });
                                                } else {
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: freeTier[item] });
                                                }
                                            }

                                            for (const item in paidTier) {
                                                const tpl = item.toLowerCase();
                                                if (tpl === "token:athenaseasonxpboost") {
                                                    seasonData[seasonName].battlePassXPBoost += paidTier[item];
                                                    multiUpdate[0].profileChanges.push({ changeType: "statModified", name: "season_match_boost", value: seasonData[seasonName].battlePassXPBoost });
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: paidTier[item] });
                                                    continue;
                                                }
                                                if (tpl === "token:athenaseasonfriendxpboost") {
                                                    seasonData[seasonName].battlePassXPFriendBoost += paidTier[item];
                                                    multiUpdate[0].profileChanges.push({ changeType: "statModified", name: "season_friend_match_boost", value: seasonData[seasonName].battlePassXPFriendBoost });
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: paidTier[item] });
                                                    continue;
                                                }
                                                const alreadyOwned = Object.values(athena.items).some(e => e.templateId.toLowerCase() === tpl);
                                                if (!alreadyOwned) {
                                                    const itemId = DatabaseManager.generateItemId(item);
                                                    const athenaItem = { templateId: item, attributes: { max_level_bonus: 0, level: 1, item_seen: false, xp: 0, variants: [], favorite: false }, quantity: paidTier[item] };
                                                    athena.items[itemId] = athenaItem;
                                                    await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, athenaItem);
                                                    multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, athenaItem));
                                                    lootList.push({ itemType: item, itemGuid: itemId, quantity: paidTier[item] });
                                                } else {
                                                    lootList.push({ itemType: item, itemGuid: item, quantity: paidTier[item] });
                                                }
                                            }
                                        }

                                        // Add gift box
                                        const giftBoxId = DatabaseManager.generateItemId();
                                        const giftBox = {
                                            templateId: "GiftBox:gb_battlepass",
                                            attributes: {
                                                max_level_bonus: 0,
                                                fromAccountId: "",
                                                lootList: lootList
                                            },
                                            quantity: 1
                                        };

                                        const seasonNumber = Number(seasonName.split("Season")[1]);
                                        if (seasonNumber > 2) {
                                            if (profile.profileId === 'common_core') {
                                                commonCore.items[giftBoxId] = giftBox;
                                                await DatabaseManager.addItemToProfile(accountId, 'common_core', giftBoxId, giftBox);
                                                changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));
                                            } else {
                                                profile.items[giftBoxId] = giftBox;
                                                await DatabaseManager.addItemToProfile(accountId, profileId, giftBoxId, giftBox);
                                                changes.push(MCPResponseBuilder.createItemAdded(giftBoxId, giftBox));
                                            }
                                        }

                                        multiUpdate[0].profileChanges.push({
                                            changeType: "statModified",
                                            name: "book_level",
                                            value: seasonData[seasonName].battlePassTier
                                        });

                                        // Deduct V-Bucks
                                        if (offer.prices && offer.prices[0] && offer.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                            const price = offer.prices[0].finalPrice * (purchaseQuantity || 1);

                                            for (const key in commonCore.items) {
                                                if (commonCore.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                                    if (commonCore.items[key].attributes.platform.toLowerCase() === commonCore.stats.attributes.current_mtx_platform.toLowerCase() ||
                                                        commonCore.items[key].attributes.platform.toLowerCase() === "shared") {

                                                        commonCore.items[key].quantity -= price;

                                                        await DatabaseManager.updateItemInProfile(accountId, 'common_core', key, {
                                                            quantity: commonCore.items[key].quantity
                                                        });

                                                        changes.push(MCPResponseBuilder.createItemQuantityChanged(key, commonCore.items[key].quantity));

                                                        commonCore.rvn += 1;
                                                        commonCore.commandRevision += 1;

                                                        if (affiliateCode) {
                                                            const commissionResult = await CreatorCodeService.recordUsage(affiliateCode, price);
                                                            if (commissionResult.success && commissionResult.commission > 0) {
                                                                await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                                                            }
                                                        }

                                                        break;
                                                    }
                                                }
                                            }
                                        }

                                        athenaModified = true;
                                    }

                                    // Sync XP boost stats after reward loops (they accumulate during loop)
                                    athena.stats.attributes.season_match_boost = seasonData[seasonName].battlePassXPBoost;
                                    athena.stats.attributes.season_friend_match_boost = seasonData[seasonName].battlePassXPFriendBoost;

                                    await DatabaseManager.saveAthenaProfile(accountId, 'season-data', seasonData);
                                }

                                purchasedLlama = true;

                                // Save profiles
                                if (athenaModified) {
                                    athena.rvn += 1;
                                    athena.commandRevision += 1;

                                    if (multiUpdate[0]) {
                                        multiUpdate[0].profileRevision = athena.rvn;
                                        multiUpdate[0].profileCommandRevision = athena.commandRevision;
                                    }

                                    await DatabaseManager.saveProfile(accountId, 'athena', athena);

                                    if (profile.profileId === 'common_core') {
                                        await DatabaseManager.saveProfile(accountId, 'common_core', commonCore);
                                    } else {
                                        await DatabaseManager.saveProfile(accountId, profileId, profile);
                                    }
                                }

                                break;
                            }
                        }
                    }
                }
            }

            if (offerId && profile.profileId === 'profile0' && !purchasedLlama) {
                for (const storefront of catalog.storefronts) {
                    if (storefront.name.toLowerCase().startsWith("cardpack")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                let quantity = 0;

                                for (const grant of entry.itemGrants) {
                                    quantity = purchaseQuantity || 1;

                                    const item = {
                                        templateId: grant.templateId || grant,
                                        attributes: {
                                            is_loot_tier_overridden: false,
                                            max_level_bonus: 0,
                                            level: 1391,
                                            pack_source: "Schedule",
                                            item_seen: false,
                                            xp: 0,
                                            favorite: false,
                                            override_loot_tier: 0
                                        },
                                        quantity: 1
                                    };

                                    for (let i = 0; i < quantity; i++) {
                                        const itemId = DatabaseManager.generateItemId();
                                        profile.items[itemId] = item;

                                        await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                                        changes.push(MCPResponseBuilder.createItemAdded(itemId, item));
                                    }
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() ||
                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {

                                                const price = (entry.prices[0].finalPrice) * quantity;
                                                profile.items[key].quantity -= price;

                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                    quantity: profile.items[key].quantity
                                                });

                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                                profile.rvn += 1;
                                                profile.commandRevision += 1;

                                                if (affiliateCode) {
                                                    const commissionResult = await CreatorCodeService.recordUsage(affiliateCode, price);
                                                    if (commissionResult.success && commissionResult.commission > 0) {
                                                        await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                                                    }
                                                }

                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (storefront.name.startsWith("BR") && !storefront.name.startsWith("BRSeason")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                for (const grant of entry.itemGrants) {
                                    const templateId = grant.templateId || grant;
                                    const itemId = DatabaseManager.generateItemId(templateId);

                                    for (const key in athena.items) {
                                        if (templateId.toLowerCase() === athena.items[key].templateId.toLowerCase()) {
                                            itemExists = true;
                                            break;
                                        }
                                    }

                                    if (itemExists) {
                                        return sendError(res, Errors.custom(
                                            'errors.com.epicgames.offer.already_owned',
                                            'You have already bought this item before.',
                                            undefined, 1040, 400
                                        ));
                                    }

                                    if (!itemExists) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: athena.rvn || 0,
                                                profileId: "athena",
                                                profileChangesBaseRevision: athena.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: athena.commandRevision || 0
                                            });
                                        }

                                        if (notifications.length === 0) {
                                            notifications.push({
                                                type: "CatalogPurchase",
                                                primary: true,
                                                lootResult: {
                                                    items: []
                                                }
                                            });
                                        }

                                        const item = {
                                            templateId: templateId,
                                            attributes: {
                                                max_level_bonus: 0,
                                                level: 1,
                                                item_seen: false,
                                                xp: 0,
                                                variants: [],
                                                favorite: false
                                            },
                                            quantity: 1
                                        };

                                        athena.items[itemId] = item;

                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, item);

                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                        notifications[0].lootResult.items.push({
                                            itemType: templateId,
                                            itemGuid: itemId,
                                            itemProfile: "athena",
                                            quantity: grant.quantity || 1
                                        });

                                        athenaModified = true;
                                    }

                                    itemExists = false;
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                    // V-Bucks live in common_core, not profile0 - always deduct from commonCore
                                    for (const key in commonCore.items) {
                                        if (commonCore.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                            if (commonCore.items[key].attributes.platform.toLowerCase() === commonCore.stats.attributes.current_mtx_platform.toLowerCase() ||
                                                commonCore.items[key].attributes.platform.toLowerCase() === "shared") {

                                                const price = (entry.prices[0].finalPrice) * (purchaseQuantity || 1);
                                                commonCore.items[key].quantity -= price;

                                                await DatabaseManager.updateItemInProfile(accountId, 'common_core', key, {
                                                    quantity: commonCore.items[key].quantity
                                                });

                                                commonCore.rvn += 1;
                                                commonCore.commandRevision += 1;

                                                if (affiliateCode) {
                                                    const commissionResult = await CreatorCodeService.recordUsage(affiliateCode, price);
                                                    if (commissionResult.success && commissionResult.commission > 0) {
                                                        await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                                                    }
                                                }

                                                break;
                                            }
                                        }
                                    }
                                }

                                if (entry.itemGrants.length !== 0) {
                                    const purchaseId = DatabaseManager.generateItemId();

                                    if (!commonCore.stats.attributes.mtx_purchase_history) {
                                        commonCore.stats.attributes.mtx_purchase_history = { refundsUsed: 0, refundCredits: 3, purchases: [] };
                                    } else {
                                        if (commonCore.stats.attributes.mtx_purchase_history.refundsUsed === undefined) commonCore.stats.attributes.mtx_purchase_history.refundsUsed = 0;
                                        if (commonCore.stats.attributes.mtx_purchase_history.refundCredits === undefined) commonCore.stats.attributes.mtx_purchase_history.refundCredits = 3;
                                    }

                                    commonCore.stats.attributes.mtx_purchase_history.purchases.push({
                                        purchaseId: purchaseId,
                                        offerId: `v2:/${purchaseId}`,
                                        purchaseDate: new Date().toISOString(),
                                        freeRefundEligible: false,
                                        fulfillments: [],
                                        lootResult: notifications[0]?.lootResult?.items || [],
                                        totalMtxPaid: entry.prices[0].finalPrice,
                                        metadata: {},
                                        gameContext: ""
                                    });

                                    await DatabaseManager.updateProfileStats(accountId, 'common_core', {
                                        'attributes.mtx_purchase_history': commonCore.stats.attributes.mtx_purchase_history
                                    });

                                    changes.push({
                                        changeType: "statModified",
                                        name: "mtx_purchase_history",
                                        value: commonCore.stats.attributes.mtx_purchase_history
                                    });
                                }
                            }
                        }
                    }

                    if (storefront.name.startsWith("STW")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                for (const grant of entry.itemGrants) {
                                    const templateId = grant.templateId || grant;
                                    const itemId = DatabaseManager.generateItemId(templateId);

                                    if (notifications.length === 0) {
                                        notifications.push({
                                            type: "CatalogPurchase",
                                            primary: true,
                                            lootResult: {
                                                items: []
                                            }
                                        });
                                    }

                                    let item = {
                                        templateId: templateId,
                                        attributes: {
                                            legacy_alterations: [],
                                            max_level_bonus: 0,
                                            level: 1,
                                            refund_legacy_item: false,
                                            item_seen: false,
                                            alterations: ["", "", "", "", "", ""],
                                            xp: 0,
                                            refundable: false,
                                            alteration_base_rarities: [],
                                            favorite: false
                                        },
                                        quantity: (purchaseQuantity || 1) * (grant.quantity || 1)
                                    };

                                    if (templateId.toLowerCase().startsWith("worker:")) {
                                        item.attributes = FunctionsService.makeSurvivorAttributes(templateId);
                                    }

                                    profile.items[itemId] = item;

                                    await DatabaseManager.addItemToProfile(accountId, profileId, itemId, item);

                                    changes.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                    notifications[0].lootResult.items.push({
                                        itemType: templateId,
                                        itemGuid: itemId,
                                        itemProfile: "profile0",
                                        quantity: (purchaseQuantity || 1) * (grant.quantity || 1)
                                    });
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "gameitem") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase() === entry.prices[0].currencySubType.toLowerCase()) {
                                            profile.items[key].quantity -= (entry.prices[0].finalPrice) * (purchaseQuantity || 1);

                                            await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                quantity: profile.items[key].quantity
                                            });

                                            changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                            break;
                                        }
                                    }
                                }

                                profile.rvn += 1;
                                profile.commandRevision += 1;
                            }
                        }
                    }
                }

                purchasedLlama = true;

                if (athenaModified) {
                    athena.rvn += 1;
                    athena.commandRevision += 1;

                    if (multiUpdate[0]) {
                        multiUpdate[0].profileRevision = athena.rvn;
                        multiUpdate[0].profileCommandRevision = athena.commandRevision;
                    }

                    await DatabaseManager.saveProfile(accountId, 'athena', athena);
                    await DatabaseManager.saveProfile(accountId, profileId, profile);
                } else {
                    await DatabaseManager.saveProfile(accountId, profileId, profile);
                }
            }

            if (offerId && profile.profileId === "common_core" && !purchasedLlama) {
                for (const storefront of catalog.storefronts) {
                    if (storefront.name.toLowerCase().startsWith("cardpack")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                let quantity = 0;

                                for (const grant of entry.itemGrants) {
                                    if (versionInfo.season <= 4 && !purchasedLlama) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: campaign.rvn || 0,
                                                profileId: "campaign",
                                                profileChangesBaseRevision: campaign.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: campaign.commandRevision || 0
                                            });
                                        }

                                        quantity = purchaseQuantity || 1;

                                        const item = {
                                            templateId: grant.templateId || grant,
                                            attributes: {
                                                is_loot_tier_overridden: false,
                                                max_level_bonus: 0,
                                                level: 1391,
                                                pack_source: "Schedule",
                                                item_seen: false,
                                                xp: 0,
                                                favorite: false,
                                                override_loot_tier: 0
                                            },
                                            quantity: 1
                                        };

                                        for (let i = 0; i < quantity; i++) {
                                            const itemId = DatabaseManager.generateItemId();

                                            campaign.items[itemId] = item;

                                            await DatabaseManager.addItemToProfile(accountId, 'campaign', itemId, item);

                                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));
                                        }

                                        purchasedLlama = true;
                                    }

                                    if (versionInfo.build >= 5 && versionInfo.build <= 7.20 && !purchasedLlama) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: campaign.rvn || 0,
                                                profileId: "campaign",
                                                profileChangesBaseRevision: campaign.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: campaign.commandRevision || 0
                                            });
                                        }

                                        quantity = purchaseQuantity || 1;

                                        const item = {
                                            templateId: grant.templateId || grant,
                                            attributes: {
                                                is_loot_tier_overridden: false,
                                                max_level_bonus: 0,
                                                level: 1391,
                                                pack_source: "Schedule",
                                                item_seen: false,
                                                xp: 0,
                                                favorite: false,
                                                override_loot_tier: 0
                                            },
                                            quantity: 1
                                        };

                                        for (let i = 0; i < quantity; i++) {
                                            const itemId = DatabaseManager.generateItemId();

                                            campaign.items[itemId] = item;

                                            await DatabaseManager.addItemToProfile(accountId, 'campaign', itemId, item);

                                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));
                                        }

                                        notifications.push({
                                            type: "cardPackResult",
                                            primary: true,
                                            lootGranted: {
                                                tierGroupName: "",
                                                items: []
                                            },
                                            displayLevel: 0
                                        });

                                        purchasedLlama = true;
                                    }

                                    if (versionInfo.season > 6 && !purchasedLlama) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: campaign.rvn || 0,
                                                profileId: "campaign",
                                                profileChangesBaseRevision: campaign.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: campaign.commandRevision || 0
                                            });
                                        }

                                        quantity = purchaseQuantity || 1;
                                        const llamaItemIds = [];

                                        const item = {
                                            templateId: grant.templateId || grant,
                                            attributes: {
                                                is_loot_tier_overridden: false,
                                                max_level_bonus: 0,
                                                level: 1391,
                                                pack_source: "Schedule",
                                                item_seen: false,
                                                xp: 0,
                                                favorite: false,
                                                override_loot_tier: 0
                                            },
                                            quantity: 1
                                        };

                                        for (let i = 0; i < quantity; i++) {
                                            const itemId = DatabaseManager.generateItemId();

                                            campaign.items[itemId] = item;

                                            await DatabaseManager.addItemToProfile(accountId, 'campaign', itemId, item);

                                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                            llamaItemIds.push(itemId);
                                        }

                                        notifications.push({
                                            type: "CatalogPurchase",
                                            primary: true,
                                            lootResult: {
                                                items: []
                                            }
                                        });

                                        if (currencySubType && currencySubType.toLowerCase() !== "accountresource:voucher_basicpack") {
                                            let cardPackData;
                                            try {
                                                const cardPackDataPath = path.join(__dirname, '../../../content/campaign/card-pack-data.json');
                                                const data = await fs.readFile(cardPackDataPath, 'utf-8');
                                                cardPackData = JSON.parse(data);
                                            } catch (error) {
                                                LoggerService.log('error', 'Failed to load CardPackData');
                                                cardPackData = { default: [] };
                                            }

                                            for (let x = 0; x < quantity; x++) {
                                                for (const key in campaign.items) {
                                                    if (campaign.items[key].templateId.toLowerCase() === "prerolldata:preroll_basic") {
                                                        if (campaign.items[key].attributes.offerId === offerId) {
                                                            for (const prerollItem of campaign.items[key].attributes.items || []) {
                                                                const id = DatabaseManager.generateItemId();
                                                                const newItem = {
                                                                    templateId: prerollItem.itemType,
                                                                    attributes: prerollItem.attributes,
                                                                    quantity: prerollItem.quantity
                                                                };

                                                                campaign.items[id] = newItem;

                                                                await DatabaseManager.addItemToProfile(accountId, 'campaign', id, newItem);

                                                                multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(id, newItem));

                                                                notifications[0].lootResult.items.push({
                                                                    itemType: prerollItem.itemType,
                                                                    itemGuid: id,
                                                                    itemProfile: "campaign",
                                                                    attributes: newItem.attributes,
                                                                    quantity: 1
                                                                });
                                                            }

                                                            campaign.items[key].attributes.items = [];

                                                            for (let i = 0; i < 10; i++) {
                                                                const itemIds = cardPackData.default || [];
                                                                const randomNumber = Math.floor(Math.random() * itemIds.length);
                                                                let randomItem = {
                                                                    itemType: itemIds[randomNumber],
                                                                    attributes: {
                                                                        legacy_alterations: [],
                                                                        max_level_bonus: 0,
                                                                        level: 1,
                                                                        refund_legacy_item: false,
                                                                        item_seen: false,
                                                                        alterations: ["", "", "", "", "", ""],
                                                                        xp: 0,
                                                                        refundable: false,
                                                                        alteration_base_rarities: [],
                                                                        favorite: false
                                                                    },
                                                                    quantity: 1
                                                                };

                                                                if (itemIds[randomNumber].toLowerCase().startsWith("worker:")) {
                                                                    randomItem.attributes = FunctionsService.makeSurvivorAttributes(itemIds[randomNumber]);
                                                                }

                                                                if (Math.random() < 0.1) {
                                                                    const cpTemplateId = cardPackData.choiceCardPacks[Math.floor(Math.random() * cardPackData.choiceCardPacks.length)];
                                                                    const cpItem = {
                                                                        itemType: cpTemplateId,
                                                                        attributes: {
                                                                            level: 1,
                                                                            pack_source: "Store",
                                                                            options: []
                                                                        },
                                                                        quantity: 1
                                                                    };
                                                                    const cpItemIds = cardPackData[cpTemplateId.toLowerCase()] || cardPackData.default;

                                                                    for (let x = 0; x < 2; x++) {
                                                                        const randomIndex = Math.floor(Math.random() * cpItemIds.length);
                                                                        let choiceItem = {
                                                                            itemType: cpItemIds[randomIndex],
                                                                            attributes: {
                                                                                legacy_alterations: [],
                                                                                max_level_bonus: 0,
                                                                                level: 1,
                                                                                refund_legacy_item: false,
                                                                                item_seen: false,
                                                                                alterations: ["", "", "", "", "", ""],
                                                                                xp: 0,
                                                                                refundable: false,
                                                                                alteration_base_rarities: [],
                                                                                favorite: false
                                                                            },
                                                                            quantity: 1
                                                                        };

                                                                        if (cpItemIds[randomIndex].toLowerCase().startsWith("worker:")) {
                                                                            choiceItem.attributes = FunctionsService.makeSurvivorAttributes(cpItemIds[randomIndex]);
                                                                        }

                                                                        cpItemIds.splice(cpItemIds.indexOf(cpItemIds[randomIndex]), 1);
                                                                        cpItem.attributes.options.push(choiceItem);
                                                                    }

                                                                    randomItem = cpItem;
                                                                }

                                                                campaign.items[key].attributes.items.push(randomItem);
                                                            }

                                                            await DatabaseManager.updateItemInProfile(accountId, 'campaign', key, {
                                                                'attributes.items': campaign.items[key].attributes.items
                                                            });

                                                            multiUpdate[0].profileChanges.push({
                                                                changeType: "itemAttrChanged",
                                                                itemId: key,
                                                                attributeName: "items",
                                                                attributeValue: campaign.items[key].attributes.items
                                                            });
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        try {
                                            if (currencySubType && currencySubType.toLowerCase() !== "accountresource:voucher_basicpack") {
                                                for (const id of llamaItemIds) {
                                                    delete campaign.items[id];

                                                    await DatabaseManager.removeItemFromProfile(accountId, 'campaign', id);

                                                    multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemRemoved(id));
                                                }
                                            }
                                        } catch (err) {
                                            LoggerService.log('error', 'Error removing llama items:', { error: err.message });
                                        }

                                        purchasedLlama = true;
                                    }
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() ||
                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {

                                                const price = (entry.prices[0].finalPrice) * quantity;
                                                profile.items[key].quantity -= price;

                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                    quantity: profile.items[key].quantity
                                                });

                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                                profile.rvn += 1;
                                                profile.commandRevision += 1;

                                                if (affiliateCode) {
                                                    const commissionResult = await CreatorCodeService.recordUsage(affiliateCode, price);
                                                    if (commissionResult.success && commissionResult.commission > 0) {
                                                        await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                                                    }
                                                }

                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (storefront.name.startsWith("BR") && !storefront.name.startsWith("BRSeason")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                for (const grant of entry.itemGrants) {
                                    const templateId = grant.templateId || grant;
                                    const itemId = DatabaseManager.generateItemId(templateId);

                                    for (const key in athena.items) {
                                        if (templateId.toLowerCase() === athena.items[key].templateId.toLowerCase()) {
                                            itemExists = true;
                                            break;
                                        }
                                    }

                                    if (itemExists) {
                                        return sendError(res, Errors.custom(
                                            'errors.com.epicgames.offer.already_owned',
                                            'You have already bought this item before.',
                                            undefined, 1040, 400
                                        ));
                                    }

                                    if (!itemExists) {
                                        if (multiUpdate.length === 0) {
                                            multiUpdate.push({
                                                profileRevision: athena.rvn || 0,
                                                profileId: "athena",
                                                profileChangesBaseRevision: athena.rvn || 0,
                                                profileChanges: [],
                                                profileCommandRevision: athena.commandRevision || 0
                                            });
                                        }

                                        if (notifications.length === 0) {
                                            notifications.push({
                                                type: "CatalogPurchase",
                                                primary: true,
                                                lootResult: {
                                                    items: []
                                                }
                                            });
                                        }

                                        const item = {
                                            templateId: templateId,
                                            attributes: {
                                                max_level_bonus: 0,
                                                level: 1,
                                                item_seen: false,
                                                xp: 0,
                                                variants: [],
                                                favorite: false
                                            },
                                            quantity: 1
                                        };

                                        athena.items[itemId] = item;

                                        await DatabaseManager.addItemToProfile(accountId, 'athena', itemId, item);

                                        multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                        notifications[0].lootResult.items.push({
                                            itemType: templateId,
                                            itemGuid: itemId,
                                            itemProfile: "athena",
                                            quantity: grant.quantity || 1
                                        });

                                        athenaModified = true;
                                    }

                                    itemExists = false;
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
                                    for (const key in profile.items) {
                                        if (profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) {
                                            if (profile.items[key].attributes.platform.toLowerCase() === profile.stats.attributes.current_mtx_platform.toLowerCase() ||
                                                profile.items[key].attributes.platform.toLowerCase() === "shared") {

                                                const price = (entry.prices[0].finalPrice) * (purchaseQuantity || 1);
                                                profile.items[key].quantity -= price;

                                                await DatabaseManager.updateItemInProfile(accountId, profileId, key, {
                                                    quantity: profile.items[key].quantity
                                                });

                                                changes.push(MCPResponseBuilder.createItemQuantityChanged(key, profile.items[key].quantity));

                                                if (affiliateCode) {
                                                    const commissionResult = await CreatorCodeService.recordUsage(affiliateCode, price);
                                                    if (commissionResult.success && commissionResult.commission > 0) {
                                                        await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                                                    }
                                                }

                                                break;
                                            }
                                        }
                                    }
                                }

                                if (entry.itemGrants.length !== 0) {
                                    const purchaseId = DatabaseManager.generateItemId();

                                    if (!profile.stats.attributes.mtx_purchase_history) {
                                        profile.stats.attributes.mtx_purchase_history = { refundsUsed: 0, refundCredits: 3, purchases: [] };
                                    } else {
                                        if (profile.stats.attributes.mtx_purchase_history.refundsUsed === undefined) profile.stats.attributes.mtx_purchase_history.refundsUsed = 0;
                                        if (profile.stats.attributes.mtx_purchase_history.refundCredits === undefined) profile.stats.attributes.mtx_purchase_history.refundCredits = 3;
                                    }

                                    profile.stats.attributes.mtx_purchase_history.purchases.push({
                                        purchaseId: purchaseId,
                                        offerId: `v2:/${purchaseId}`,
                                        purchaseDate: new Date().toISOString(),
                                        freeRefundEligible: false,
                                        fulfillments: [],
                                        lootResult: notifications[0]?.lootResult?.items || [],
                                        totalMtxPaid: entry.prices[0].finalPrice,
                                        metadata: {},
                                        gameContext: ""
                                    });

                                    await DatabaseManager.updateProfileStats(accountId, profileId, {
                                        'attributes.mtx_purchase_history': profile.stats.attributes.mtx_purchase_history
                                    });

                                    changes.push({
                                        changeType: "statModified",
                                        name: "mtx_purchase_history",
                                        value: profile.stats.attributes.mtx_purchase_history
                                    });
                                }

                                profile.rvn += 1;
                                profile.commandRevision += 1;
                            }
                        }
                    }

                    if (storefront.name.startsWith("STW")) {
                        for (const entry of storefront.catalogEntries) {
                            if (entry.offerId === offerId) {
                                if (multiUpdate.length === 0) {
                                    multiUpdate.push({
                                        profileRevision: campaign.rvn || 0,
                                        profileId: "campaign",
                                        profileChangesBaseRevision: campaign.rvn || 0,
                                        profileChanges: [],
                                        profileCommandRevision: campaign.commandRevision || 0
                                    });
                                }

                                for (const grant of entry.itemGrants) {
                                    const templateId = grant.templateId || grant;
                                    const itemId = DatabaseManager.generateItemId(templateId);

                                    if (notifications.length === 0) {
                                        notifications.push({
                                            type: "CatalogPurchase",
                                            primary: true,
                                            lootResult: {
                                                items: []
                                            }
                                        });
                                    }

                                    let item = {
                                        templateId: templateId,
                                        attributes: {
                                            legacy_alterations: [],
                                            max_level_bonus: 0,
                                            level: 1,
                                            refund_legacy_item: false,
                                            item_seen: false,
                                            alterations: ["", "", "", "", "", ""],
                                            xp: 0,
                                            refundable: false,
                                            alteration_base_rarities: [],
                                            favorite: false
                                        },
                                        quantity: (purchaseQuantity || 1) * (grant.quantity || 1)
                                    };

                                    if (templateId.toLowerCase().startsWith("worker:")) {
                                        item.attributes = FunctionsService.makeSurvivorAttributes(templateId);
                                    }

                                    campaign.items[itemId] = item;

                                    await DatabaseManager.addItemToProfile(accountId, 'campaign', itemId, item);

                                    multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemAdded(itemId, item));

                                    notifications[0].lootResult.items.push({
                                        itemType: templateId,
                                        itemGuid: itemId,
                                        itemProfile: "campaign",
                                        quantity: (purchaseQuantity || 1) * (grant.quantity || 1)
                                    });
                                }

                                if (entry.prices[0].currencyType.toLowerCase() === "gameitem") {
                                    for (const key in campaign.items) {
                                        if (campaign.items[key].templateId.toLowerCase() === entry.prices[0].currencySubType.toLowerCase()) {
                                            campaign.items[key].quantity -= (entry.prices[0].finalPrice) * (purchaseQuantity || 1);

                                            await DatabaseManager.updateItemInProfile(accountId, 'campaign', key, {
                                                quantity: campaign.items[key].quantity
                                            });

                                            multiUpdate[0].profileChanges.push(MCPResponseBuilder.createItemQuantityChanged(key, campaign.items[key].quantity));

                                            break;
                                        }
                                    }
                                }

                                profile.rvn += 1;
                                profile.commandRevision += 1;
                            }
                        }
                    }
                }

                if (athenaModified) {
                    athena.rvn += 1;
                    athena.commandRevision += 1;

                    if (multiUpdate[0]) {
                        multiUpdate[0].profileRevision = athena.rvn;
                        multiUpdate[0].profileCommandRevision = athena.commandRevision;
                    }

                    await DatabaseManager.saveProfile(accountId, 'athena', athena);
                    await DatabaseManager.saveProfile(accountId, profileId, profile);
                } else {
                    campaign.rvn += 1;
                    campaign.commandRevision += 1;

                    if (multiUpdate[0]) {
                        multiUpdate[0].profileRevision = campaign.rvn;
                        multiUpdate[0].profileCommandRevision = campaign.commandRevision;
                    }

                    await DatabaseManager.saveProfile(accountId, 'campaign', campaign);
                    await DatabaseManager.saveProfile(accountId, profileId, profile);
                }
            }

            if (queryRevision != profile.rvn - 1 && changes.length === 0) {
                MCPResponseBuilder.sendFullProfileUpdate(res, profile, queryRevision);
            } else {
                res.json({
                    profileRevision: profile.rvn,
                    profileId: profileId,
                    profileChangesBaseRevision: profile.rvn - 1,
                    profileChanges: changes,
                    notifications: notifications,
                    profileCommandRevision: profile.commandRevision,
                    serverTime: new Date().toISOString(),
                    multiUpdate: multiUpdate,
                    responseVersion: 1
                });
            }
        } catch (error) {
            LoggerService.log('error', `PurchaseCatalogEntry error: ${error.message}`);
            sendError(res, Errors.Internal.serverError());;
        }
    }
);

module.exports = router;