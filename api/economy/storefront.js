const Express = require("express");
const router = Express.Router();
const keychain = require("../../content/keychain.json");
const VersionService = require("../../src/service/api/version-service")
const ShopService = require("../../src/service/api/shop-service")

router.get("/fortnite/api/storefront/v2/catalog", async (req, res) => {
    if (req.headers["user-agent"].includes("2870186")) {
        return res.status(404).end();
    }

    var catalog = ShopService.getItemShop();
    const versionInfo = VersionService.getVersionInfo(req);

    if (versionInfo.build >= 30.10) {
        catalog = JSON.parse(JSON.stringify(catalog).replace(/"Normal"/g, '"Size_1_x_2"'));
    }
    if (versionInfo.build >= 30.20) {
        catalog = JSON.parse(JSON.stringify(catalog).replace(/Game\/Items\/CardPacks\//g, 'SaveTheWorld/Items/CardPacks/'));
    }

    res.json(catalog);
})

router.get("/fortnite/api/storefront/v2/gift/check_eligibility/recipient/:recipientId/offer/:offerId", async (req, res) => {
    res.json([]);
});

router.get("/fortnite/api/storefront/v2/keychain", async (req, res) => {
    res.json(keychain)
})

router.get("/catalog/api/shared/bulk/offers", async (req, res) => {
    res.json({});
})

module.exports = router;