const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Rechercher un item depuis le collection book STW
async function handleResearchItemFromCollectionBook(req, profile) {
    const changes = [];
    
    if (!req.body.templateId || typeof req.body.templateId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    const newItemId = Functions.MakeID();
    const newItem = {
        templateId: req.body.templateId,
        attributes: {
            last_state_change_time: "2017-08-29T21:05:57.087Z",
            max_level_bonus: 0,
            level: 1,
            item_seen: false,
            xp: 0,
            sent_new_notification: true,
            favorite: false
        },
        quantity: 1
    };

    profile.items[newItemId] = newItem;

    changes.push({
        changeType: "itemAdded",
        itemId: newItemId,
        item: newItem
    });

    return { changes };
}

// Placer un item dans le collection book STW
async function handleSlotItemInCollectionBook(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    let multiUpdate = [];
    
    if (!req.body.itemId || typeof req.body.itemId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.itemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = profile.items[req.body.itemId];
    
    // Déterminer le bon profil collection book
    const isSchematic = item.templateId.toLowerCase().startsWith("schematic:");
    const collectionProfileId = isSchematic ? "collection_book_schematics0" : "collection_book_people0";
    
    const collectionProfile = await mcpService.getProfile(collectionProfileId);

    multiUpdate.push({
        profileRevision: collectionProfile.rvn || 0,
        profileId: collectionProfileId,
        profileChangesBaseRevision: collectionProfile.rvn || 0,
        profileChanges: [],
        profileCommandRevision: collectionProfile.commandRevision || 0
    });

    // Vérifier et supprimer tout item similaire existant
    for (const [existingId, existingItem] of Object.entries(collectionProfile.items)) {
        const template1 = item.templateId.slice(0, -4).toLowerCase();
        const template2 = existingItem.templateId.slice(0, -4).toLowerCase();
        
        if (template1 === template2) {
            // Pour les workers, vérifier aussi la personnalité
            if (item.templateId.toLowerCase().startsWith("worker:") && 
                existingItem.templateId.toLowerCase().startsWith("worker:")) {
                
                if (item.attributes.personality && existingItem.attributes.personality) {
                    if (item.attributes.personality.toLowerCase() === existingItem.attributes.personality.toLowerCase()) {
                        delete collectionProfile.items[existingId];
                        multiUpdate[0].profileChanges.push({
                            changeType: "itemRemoved",
                            itemId: existingId
                        });
                    }
                }
            } else {
                delete collectionProfile.items[existingId];
                multiUpdate[0].profileChanges.push({
                    changeType: "itemRemoved",
                    itemId: existingId
                });
            }
        }
    }

    // Déplacer l'item vers le collection book
    collectionProfile.items[req.body.itemId] = item;
    delete profile.items[req.body.itemId];

    changes.push({
        changeType: "itemRemoved",
        itemId: req.body.itemId
    });

    multiUpdate[0].profileChanges.push({
        changeType: "itemAdded",
        itemId: req.body.itemId,
        item: item
    });

    notifications.push({
        type: "slotItemResult",
        primary: true,
        slottedItemId: req.body.itemId
    });

    // Mettre à jour les révisions
    collectionProfile.rvn += 1;
    collectionProfile.commandRevision += 1;
    multiUpdate[0].profileRevision = collectionProfile.rvn;
    multiUpdate[0].profileCommandRevision = collectionProfile.commandRevision;

    await mcpService.saveProfile(collectionProfileId, collectionProfile);

    return { changes, notifications, multiUpdate };
}

// Retirer un item du collection book STW
async function handleUnslotItemFromCollectionBook(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    let multiUpdate = [];
    
    if (!req.body.itemId || typeof req.body.itemId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    // Déterminer le bon profil collection book basé sur le templateId
    const isSchematic = req.body.templateId && req.body.templateId.toLowerCase().startsWith("schematic:");
    const collectionProfileId = isSchematic ? "collection_book_schematics0" : "collection_book_people0";
    
    const collectionProfile = await mcpService.getProfile(collectionProfileId);

    multiUpdate.push({
        profileRevision: collectionProfile.rvn || 0,
        profileId: collectionProfileId,
        profileChangesBaseRevision: collectionProfile.rvn || 0,
        profileChanges: [],
        profileCommandRevision: collectionProfile.commandRevision || 0
    });

    if (!collectionProfile.items[req.body.itemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = collectionProfile.items[req.body.itemId];

    // Déplacer l'item vers le profil principal
    let targetItemId = req.body.itemId;
    
    // Si l'item existe déjà dans le profil principal, créer un nouvel ID
    if (profile.items[req.body.itemId]) {
        targetItemId = Functions.MakeID();
    }

    profile.items[targetItemId] = item;
    delete collectionProfile.items[req.body.itemId];

    changes.push({
        changeType: "itemAdded",
        itemId: targetItemId,
        item: item
    });

    multiUpdate[0].profileChanges.push({
        changeType: "itemRemoved",
        itemId: req.body.itemId
    });

    // Mettre à jour les révisions
    collectionProfile.rvn += 1;
    collectionProfile.commandRevision += 1;
    multiUpdate[0].profileRevision = collectionProfile.rvn;
    multiUpdate[0].profileCommandRevision = collectionProfile.commandRevision;

    await mcpService.saveProfile(collectionProfileId, collectionProfile);

    return { changes, notifications, multiUpdate };
}

// Réclamer les récompenses du collection book STW
async function handleClaimCollectionBookRewards(req, profile) {
    const changes = [];
    
    if (!req.body.requiredXp || typeof req.body.requiredXp !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.stats.attributes.collection_book) {
        profile.stats.attributes.collection_book = {
            maxBookXpLevelAchieved: 1
        };
    }

    profile.stats.attributes.collection_book.maxBookXpLevelAchieved += 1;

    changes.push({
        changeType: "statModified",
        name: "collection_book",
        value: profile.stats.attributes.collection_book
    });

    return { changes };
}

// Respec altération STW
async function handleRespecAlteration(req, profile) {
    const changes = [];
    
    if (!req.body.targetItemId || !req.body.alterationId || typeof req.body.alterationSlot !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.targetItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = profile.items[req.body.targetItemId];
    
    if (!item.attributes.alterations) {
        item.attributes.alterations = ["", "", "", "", "", ""];
    }

    if (req.body.alterationSlot < 0 || req.body.alterationSlot >= item.attributes.alterations.length) {
        throw Errors.MCP.invalidAlterationSlot();
    }

    item.attributes.alterations[req.body.alterationSlot] = req.body.alterationId;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.targetItemId,
        attributeName: "alterations",
        attributeValue: item.attributes.alterations
    });

    return { changes };
}

// Upgrade altération STW
async function handleUpgradeAlteration(req, profile) {
    const changes = [];
    
    if (!req.body.targetItemId || typeof req.body.alterationSlot !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.targetItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = profile.items[req.body.targetItemId];
    
    if (!item.attributes.alterations || !item.attributes.alterations[req.body.alterationSlot]) {
        throw Errors.MCP.noAlterationToUpgrade();
    }

    let alteration = item.attributes.alterations[req.body.alterationSlot];

    // Progression des tiers d'altération
    if (alteration.toLowerCase().includes("t04")) {
        alteration = alteration.replace(/t04/ig, "T05");
    } else if (alteration.toLowerCase().includes("t03")) {
        alteration = alteration.replace(/t03/ig, "T04");
    } else if (alteration.toLowerCase().includes("t02")) {
        alteration = alteration.replace(/t02/ig, "T03");
    } else if (alteration.toLowerCase().includes("t01")) {
        alteration = alteration.replace(/t01/ig, "T02");
    }

    item.attributes.alterations[req.body.alterationSlot] = alteration;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.targetItemId,
        attributeName: "alterations",
        attributeValue: item.attributes.alterations
    });

    return { changes };
}

module.exports = {
    handleResearchItemFromCollectionBook,
    handleSlotItemInCollectionBook,
    handleUnslotItemFromCollectionBook,
    handleClaimCollectionBookRewards,
    handleRespecAlteration,
    handleUpgradeAlteration
};