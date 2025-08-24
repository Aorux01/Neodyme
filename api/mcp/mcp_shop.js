const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Acheter un article du catalogue
async function handlePurchaseCatalogEntry(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    let multiUpdate = [];
    
    if (!req.body.offerId) {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.offerId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.purchaseQuantity !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (req.body.purchaseQuantity < 1) {
        throw Errors.MCP.invalidQuantity();
    }

    if (!profile.items) profile.items = {};

    // Récupérer le profil Athena pour les cosmétiques
    const athenaProfile = await mcpService.getProfile('athena');
    if (!athenaProfile.items) athenaProfile.items = {};

    // Chercher l'offre
    const offer = Functions.getOfferID(req.body.offerId);
    if (!offer) {
        throw Errors.MCP.offerNotFound(req.body.offerId);
    }

    // Traitement selon le type d'offre
    if (/^BR(Daily|Weekly|Season)Storefront$/.test(offer.name)) {
        // Préparer la notification d'achat
        notifications.push({
            type: "CatalogPurchase",
            primary: true,
            lootResult: {
                items: []
            }
        });

        // Vérifier que l'utilisateur ne possède pas déjà les items
        for (const itemGrant of offer.offerId.itemGrants) {
            for (const [itemId, item] of Object.entries(athenaProfile.items)) {
                if (itemGrant.templateId.toLowerCase() === item.templateId.toLowerCase()) {
                    throw Errors.MCP.alreadyOwned();
                }
            }
        }

        // Traitement du paiement
        if (offer.offerId.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
            const totalPrice = offer.offerId.prices[0].finalPrice * req.body.purchaseQuantity;
            await processPayment(profile, totalPrice, changes);
        }

        // Ajouter les items au profil Athena
        const athenaChanges = [];
        for (const itemGrant of offer.offerId.itemGrants) {
            const itemId = Functions.MakeID();
            const item = {
                templateId: itemGrant.templateId,
                attributes: {
                    item_seen: false,
                    variants: []
                },
                quantity: 1
            };

            athenaProfile.items[itemId] = item;

            athenaChanges.push({
                changeType: "itemAdded",
                itemId: itemId,
                item: athenaProfile.items[itemId]
            });

            notifications[0].lootResult.items.push({
                itemType: item.templateId,
                itemGuid: itemId,
                itemProfile: "athena",
                quantity: 1
            });
        }

        // Préparer multiUpdate pour Athena
        if (athenaChanges.length > 0) {
            athenaProfile.rvn += 1;
            athenaProfile.commandRevision += 1;
            athenaProfile.updated = new Date().toISOString();

            multiUpdate.push({
                profileRevision: athenaProfile.rvn,
                profileId: "athena",
                profileChangesBaseRevision: athenaProfile.rvn - 1,
                profileChanges: athenaChanges,
                profileCommandRevision: athenaProfile.commandRevision
            });

            // Sauvegarder le profil Athena
            await mcpService.saveProfile('athena', athenaProfile);
        }
    }

    return { changes, notifications, multiUpdate };
}

async function handleRefundMtxPurchase(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    let multiUpdate = [];

    if (!req.body.purchaseId || typeof req.body.purchaseId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.stats.attributes.mtx_purchase_history) {
        throw Errors.MCP.noPurchaseHistory();
    }

    if (profile.stats.attributes.mtx_purchase_history.refundCredits <= 0) {
        throw Errors.MCP.noRefundCreditsLeft();
    }

    // Trouver l'achat
    const purchase = profile.stats.attributes.mtx_purchase_history.purchases.find(
        p => p.purchaseId === req.body.purchaseId
    );

    if (!purchase) {
        throw Errors.MCP.purchaseNotFound();
    }

    if (purchase.refundDate) {
        throw Errors.MCP.alreadyRefunded();
    }

    // Vérifier l'éligibilité au remboursement
    const purchaseDate = new Date(purchase.purchaseDate);
    const now = new Date();
    const daysSincePurchase = (now - purchaseDate) / (1000 * 60 * 60 * 24);

    if (daysSincePurchase > 30) {
        throw Errors.MCP.refundPeriodExpired();
    }

    // Traiter le remboursement
    profile.stats.attributes.mtx_purchase_history.refundsUsed += 1;
    profile.stats.attributes.mtx_purchase_history.refundCredits -= 1;
    purchase.refundDate = new Date().toISOString();

    // Rembourser les V-Bucks
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId.toLowerCase().startsWith("currency:mtx")) {
            const platform = item.attributes.platform;
            const currentPlatform = profile.stats.attributes.current_mtx_platform;
            
            if (platform.toLowerCase() === currentPlatform.toLowerCase() || 
                platform.toLowerCase() === "shared") {
                
                item.quantity += purchase.totalMtxPaid;
                
                changes.push({
                    changeType: "itemQuantityChanged",
                    itemId: itemId,
                    quantity: item.quantity
                });
                break;
            }
        }
    }

    // Supprimer les items du profil Athena
    const athenaProfile = await mcpService.getProfile('athena');
    const athenaChanges = [];

    for (const lootItem of purchase.lootResult) {
        if (athenaProfile.items[lootItem.itemGuid]) {
            delete athenaProfile.items[lootItem.itemGuid];
            
            athenaChanges.push({
                changeType: "itemRemoved",
                itemId: lootItem.itemGuid
            });
        }
    }

    if (athenaChanges.length > 0) {
        athenaProfile.rvn += 1;
        athenaProfile.commandRevision += 1;
        athenaProfile.updated = new Date().toISOString();

        multiUpdate.push({
            profileRevision: athenaProfile.rvn,
            profileId: "athena",
            profileChangesBaseRevision: athenaProfile.rvn - 1,
            profileChanges: athenaChanges,
            profileCommandRevision: athenaProfile.commandRevision
        });

        await mcpService.saveProfile('athena', athenaProfile);
    }

    changes.push({
        changeType: "statModified",
        name: "mtx_purchase_history",
        value: profile.stats.attributes.mtx_purchase_history
    });

    notifications.push({
        type: "mtxRefund",
        primary: true,
        purchaseId: req.body.purchaseId,
        refundAmount: purchase.totalMtxPaid
    });

    return { changes, notifications, multiUpdate };
}

// Fonctions utilitaires
async function processPayment(profile, totalPrice, changes) {
    if (totalPrice <= 0) return;

    let paid = false;

    for (const [itemId, item] of Object.entries(profile.items)) {
        if (!item.templateId.toLowerCase().startsWith("currency:mtx")) continue;

        const currencyPlatform = item.attributes.platform;
        const currentPlatform = profile.stats.attributes.current_mtx_platform;
        
        if (currencyPlatform.toLowerCase() !== currentPlatform.toLowerCase() && 
            currencyPlatform.toLowerCase() !== "shared") continue;

        if (item.quantity < totalPrice) {
            throw Errors.MCP.insufficientCurrency(totalPrice, item.quantity);
        }

        item.quantity -= totalPrice;
        
        changes.push({
            changeType: "itemQuantityChanged",
            itemId: itemId,
            quantity: item.quantity
        });

        paid = true;
        break;
    }

    if (!paid && totalPrice > 0) {
        throw Errors.MCP.insufficientCurrency(totalPrice, 0);
    }
}

module.exports = {
    handlePurchaseCatalogEntry,
    handleRefundMtxPurchase
};