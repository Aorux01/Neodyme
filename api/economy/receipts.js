const express = require('express');
const router = express.Router();
const ShopService = require('../../src/service/api/shop-service');
const VersionService = require('../../src/service/api/version-service');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');

router.get('/fortnite/api/receipts/v1/account/:accountId/receipts', async (req, res) => {
    try {
        const accountId = req.params.accountId;
        const versionInfo = VersionService.getVersionInfo(req);

        // Get catalog and extract V-Bucks offers from CurrencyStorefront
        const catalog = ShopService.getItemShop(versionInfo.season);
        const currencyStorefront = catalog.storefronts.find(sf => sf.name === 'CurrencyStorefront');

        if (!currencyStorefront) {
            return res.json([]);
        }

        // Map currency offers to receipt format
        const receipts = currencyStorefront.catalogEntries.map(entry => ({
            appStore: "EpicPurchasingService",
            appStoreId: entry.appStoreId?.[0] || entry.offerId,
            receiptId: entry.offerId,
            receiptType: "CurrencyStore",
            state: "Available",
            transactionId: entry.offerId,
            transactionState: "Available",
            offerId: entry.offerId,
            quantity: 1,
            metaData: entry.metaInfo || [],
            prices: entry.prices || [],
            title: entry.title || entry.devName,
            description: entry.description || entry.shortDescription || "",
            displayAssetPath: entry.displayAssetPath || ""
        }));

        res.json(receipts);
    } catch (error) {
        LoggerService.log('error', `Receipts error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;