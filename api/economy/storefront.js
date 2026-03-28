const Express = require("express");
const router = Express.Router();
const keychain = require("../../content/keychain.json");
const VersionService = require("../../src/service/api/version-service")
const ShopService = require("../../src/service/api/shop-service")
const DatabaseManager = require("../../src/manager/database-manager");
const { Errors, sendError } = require("../../src/service/error/errors-system");
const { verifyToken } = require("../../src/middleware/auth-middleware");

router.get("/fortnite/api/storefront/v2/catalog", async (req, res) => {
    if (req.headers["user-agent"].includes("2870186")) {
        return res.status(404).end();
    }

    const versionInfo = VersionService.getVersionInfo(req);
    const shopConfig = ShopService.getShopConfig();
    var catalog = shopConfig.randomShop
        ? await ShopService.getRandomItemShop(versionInfo.season)
        : ShopService.getItemShop(versionInfo.season);

    if (versionInfo.build >= 30.10) {
        catalog = JSON.parse(JSON.stringify(catalog).replace(/"Normal"/g, '"Size_1_x_2"'));
    }
    if (versionInfo.build >= 30.20) {
        catalog = JSON.parse(JSON.stringify(catalog).replace(/Game\/Items\/CardPacks\//g, 'SaveTheWorld/Items/CardPacks/'));
    }

    res.json(catalog);
})

router.get("/fortnite/api/storefront/v2/gift/check_eligibility/recipient/:recipientId/offer/:offerId", verifyToken, async (req, res) => {
    try {
        const { recipientId, offerId } = req.params;
        const senderAccountId = req.user.accountId;
        const versionInfo = VersionService.getVersionInfo(req);

        // Find offer in the current shop catalog by SHA1 offerId
        const shopConfig = ShopService.getShopConfig();
        const catalog = shopConfig.randomShop
            ? await ShopService.getRandomItemShop(versionInfo.season)
            : ShopService.getItemShop(versionInfo.season);
        let foundEntry = null;
        for (const storefront of catalog.storefronts) {
            foundEntry = storefront.catalogEntries.find(e => e.offerId === offerId);
            if (foundEntry) break;
        }

        if (!foundEntry) {
            return sendError(res, Errors.custom(
                'errors.com.epicgames.fortnite.id_invalid',
                `Offer ID (id: "${offerId}") not found`,
                16027, 400
            ));
        }

        // Friendship check (gifting to yourself is allowed)
        if (recipientId !== senderAccountId) {
            const friendsData = await DatabaseManager.getFriends(senderAccountId);
            const isFriend = friendsData.friends.some(f =>
                (typeof f === 'string' ? f : f.accountId) === recipientId
            );
            if (!isFriend) {
                return sendError(res, Errors.custom(
                    'errors.com.epicgames.friends.no_relationship',
                    `User ${senderAccountId} is not friends with ${recipientId}`,
                    28004, 403
                ));
            }
        }

        // Check recipient doesn't already own any of the granted items
        const recipientProfile = await DatabaseManager.getProfile(recipientId, 'athena');
        if (recipientProfile) {
            const ownedItems = recipientProfile.items || {};
            for (const grant of foundEntry.itemGrants) {
                const grantLower = grant.templateId.toLowerCase();
                for (const owned of Object.values(ownedItems)) {
                    if (owned.templateId?.toLowerCase() === grantLower) {
                        return sendError(res, Errors.custom(
                            'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed',
                            `Recipient already owns item ${grant.templateId}`,
                            28004, 403
                        ));
                    }
                }
            }
        }

        res.json({
            price: foundEntry.prices[0].finalPrice,
            items: foundEntry.itemGrants.map(g => ({ templateId: g.templateId, quantity: g.quantity }))
        });
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
});

router.get("/fortnite/api/storefront/v2/keychain", async (req, res) => {
    res.json(keychain)
})

router.get("/catalog/api/shared/bulk/offers", async (req, res) => {
    res.json({});
})

module.exports = router;