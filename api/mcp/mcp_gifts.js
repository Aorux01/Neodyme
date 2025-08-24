const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');
const AccountService = require('../../src/services/AccountService');

// Boîtes cadeau valides
const VALID_GIFT_BOXES = [
    "GiftBox:gb_default",
    "GiftBox:gb_giftwrap1",
    "GiftBox:gb_giftwrap2",
    "GiftBox:gb_giftwrap3"
];

// Offrir un article du catalogue
async function handleGiftCatalogEntry(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    
    if (!req.body.offerId || !req.body.receiverAccountIds || !req.body.giftWrapTemplateId) {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.offerId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!Array.isArray(req.body.receiverAccountIds)) {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.giftWrapTemplateId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.personalMessage !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    // Validation du message personnel
    if (req.body.personalMessage.length > 100) {
        throw Errors.MCP.personalMessageTooLong();
    }

    // Validation de la boîte cadeau
    if (!VALID_GIFT_BOXES.includes(req.body.giftWrapTemplateId)) {
        throw Errors.MCP.invalidGiftBox();
    }

    // Validation du nombre de destinataires
    if (req.body.receiverAccountIds.length < 1 || req.body.receiverAccountIds.length > 5) {
        throw Errors.MCP.invalidReceiverCount();
    }

    // Vérifier les doublons
    if (hasDuplicates(req.body.receiverAccountIds)) {
        throw Errors.MCP.duplicateReceivers();
    }

    // Vérifier les relations d'amitié
    for (const receiverId of req.body.receiverAccountIds) {
        if (typeof receiverId !== 'string') {
            throw Errors.MCP.invalidReceiverId();
        }

        // Vérifier l'amitié (sauf pour soi-même)
        if (receiverId !== req.user.accountId) {
            const isFriend = await checkFriendship(req.user.accountId, receiverId);
            if (!isFriend) {
                throw Errors.MCP.notFriends(req.user.accountId, receiverId);
            }
        }
    }

    // Chercher l'offre
    const offer = Functions.getOfferID(req.body.offerId);
    if (!offer) {
        throw Errors.MCP.offerNotFound(req.body.offerId);
    }

    // Traitement selon le type d'offre
    if (/^BR(Daily|Weekly)Storefront$/.test(offer.name)) {
        // Traitement du paiement
        if (offer.offerId.prices[0].currencyType.toLowerCase() === "mtxcurrency") {
            const totalPrice = offer.offerId.prices[0].finalPrice * req.body.receiverAccountIds.length;
            await processPayment(profile, totalPrice, changes);
        }

        // Vérifier et créer les cadeaux pour chaque destinataire
        for (const receiverId of req.body.receiverAccountIds) {
            await processGiftForReceiver(receiverId, offer, req, profile, changes);
        }
    }

    return { changes, notifications };
}

// Supprimer une boîte cadeau
async function handleRemoveGiftBox(req, profile) {
    const changes = [];
    
    if (!profile.items) profile.items = {};

    // Supprimer une seule boîte cadeau
    if (req.body.giftBoxItemId && typeof req.body.giftBoxItemId === 'string') {
        if (!profile.items[req.body.giftBoxItemId]) {
            throw Errors.MCP.itemNotFound();
        }

        if (!profile.items[req.body.giftBoxItemId].templateId.startsWith("GiftBox:")) {
            throw Errors.MCP.notAGiftBox();
        }

        delete profile.items[req.body.giftBoxItemId];

        changes.push({
            changeType: "itemRemoved",
            itemId: req.body.giftBoxItemId
        });
    }

    // Supprimer plusieurs boîtes cadeaux
    if (req.body.giftBoxItemIds && Array.isArray(req.body.giftBoxItemIds)) {
        for (const giftBoxItemId of req.body.giftBoxItemIds) {
            if (typeof giftBoxItemId !== 'string') continue;
            if (!profile.items[giftBoxItemId]) continue;
            if (!profile.items[giftBoxItemId].templateId.startsWith("GiftBox:")) continue;

            delete profile.items[giftBoxItemId];

            changes.push({
                changeType: "itemRemoved",
                itemId: giftBoxItemId
            });
        }
    }

    return { changes };
}

// Activer/désactiver la réception de cadeaux
async function handleSetReceiveGiftsEnabled(req, profile) {
    const changes = [];
    
    if (typeof req.body.bReceiveGifts !== 'boolean') {
        throw Errors.MCP.invalidPayload();
    }

    profile.stats.attributes.allowed_to_receive_gifts = req.body.bReceiveGifts;

    changes.push({
        changeType: "statModified",
        name: "allowed_to_receive_gifts",
        value: profile.stats.attributes.allowed_to_receive_gifts
    });

    return { changes };
}

// Fonctions utilitaires
function hasDuplicates(array) {
    return new Set(array).size !== array.length;
}

async function checkFriendship(senderId, receiverId) {
    try {
        // Récupérer la liste d'amis du sender
        const senderFriends = await require('../../src/services/FriendsService').getFriends(senderId);
        return senderFriends.some(friend => friend.accountId === receiverId && friend.status === 'ACCEPTED');
    } catch (error) {
        LoggerService.log('error', `Error checking friendship: ${error.message}`);
        return false;
    }
}

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

async function processGiftForReceiver(receiverId, offer, req, senderProfile, changes) {
    try {
        // Récupérer les profils du destinataire
        const receiverProfiles = await require('../../src/services/MCPService').getAllProfiles(receiverId);
        const athenaProfile = receiverProfiles.athena;
        const commonCoreProfile = receiverId === req.user.accountId ? 
            senderProfile : receiverProfiles.common_core;

        if (!athenaProfile.items) athenaProfile.items = {};
        if (!commonCoreProfile.items) commonCoreProfile.items = {};

        // Vérifier si le destinataire accepte les cadeaux
        if (!commonCoreProfile.stats.attributes.allowed_to_receive_gifts) {
            throw Errors.MCP.giftsDisabled(receiverId);
        }

        // Vérifier si le destinataire possède déjà les items
        for (const itemGrant of offer.offerId.itemGrants) {
            for (const [itemId, item] of Object.entries(athenaProfile.items)) {
                if (itemGrant.templateId.toLowerCase() === item.templateId.toLowerCase()) {
                    throw Errors.MCP.alreadyOwned(receiverId);
                }
            }
        }

        // Créer la boîte cadeau
        const giftBoxItemID = Functions.MakeID();
        const giftBoxItem = {
            templateId: req.body.giftWrapTemplateId,
            attributes: {
                fromAccountId: req.user.accountId,
                lootList: [],
                params: {
                    userMessage: req.body.personalMessage
                },
                level: 1,
                giftedOn: new Date().toISOString()
            },
            quantity: 1
        };

        // Ajouter les items du cadeau
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

            giftBoxItem.attributes.lootList.push({
                itemType: item.templateId,
                itemGuid: itemId,
                itemProfile: "athena",
                quantity: 1
            });
        }

        commonCoreProfile.items[giftBoxItemID] = giftBoxItem;

        // Si c'est pour soi-même, ajouter aux changements
        if (receiverId === req.user.accountId) {
            changes.push({
                changeType: "itemAdded",
                itemId: giftBoxItemID,
                item: commonCoreProfile.items[giftBoxItemID]
            });
        }

        // Mettre à jour les révisions
        athenaProfile.rvn += 1;
        athenaProfile.commandRevision += 1;
        athenaProfile.updated = new Date().toISOString();

        commonCoreProfile.rvn += 1;
        commonCoreProfile.commandRevision += 1;
        commonCoreProfile.updated = new Date().toISOString();

        // Sauvegarder les profils
        await require('../../src/services/MCPService').saveAllProfiles(receiverId, {
            athena: athenaProfile,
            common_core: commonCoreProfile
        });

        // Marquer comme ayant reçu un cadeau
        global.giftReceived = global.giftReceived || {};
        global.giftReceived[receiverId] = true;

        // Envoyer notification XMPP
        Functions.sendXmppMessageToId({
            type: "com.epicgames.gift.received",
            payload: {},
            timestamp: new Date().toISOString()
        }, receiverId);

        LoggerService.log('info', `Gift sent successfully`, {
            from: req.user.accountId,
            to: receiverId,
            offer: req.body.offerId
        });

    } catch (error) {
        LoggerService.log('error', `Failed to process gift for receiver ${receiverId}: ${error.message}`);
        throw error;
    }
}

module.exports = {
    handleGiftCatalogEntry,
    handleRemoveGiftBox,
    handleSetReceiveGiftsEnabled
};