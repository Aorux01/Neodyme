const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Détruire des items du monde STW
async function handleDestroyWorldItems(req, profile) {
    const changes = [];
    
    if (!req.body.itemIds || !Array.isArray(req.body.itemIds)) {
        throw Errors.MCP.invalidPayload();
    }

    for (const itemId of req.body.itemIds) {
        if (profile.items[itemId]) {
            delete profile.items[itemId];
            
            changes.push({
                changeType: "itemRemoved",
                itemId: itemId
            });
        }
    }

    return { changes };
}

// Démonter des items du monde STW
async function handleDisassembleWorldItems(req, profile) {
    const changes = [];
    
    if (!req.body.targetItemIdAndQuantityPairs || !Array.isArray(req.body.targetItemIdAndQuantityPairs)) {
        throw Errors.MCP.invalidPayload();
    }

    for (const pair of req.body.targetItemIdAndQuantityPairs) {
        const { itemId, quantity } = pair;
        
        if (!profile.items[itemId] || typeof quantity !== 'number' || quantity <= 0) {
            continue;
        }

        const item = profile.items[itemId];
        const requestedQuantity = Number(quantity);
        const currentQuantity = Number(item.quantity);

        if (requestedQuantity >= currentQuantity) {
            // Supprimer complètement l'item
            delete profile.items[itemId];
            
            changes.push({
                changeType: "itemRemoved",
                itemId: itemId
            });
        } else {
            // Réduire la quantité
            item.quantity -= requestedQuantity;
            
            changes.push({
                changeType: "itemQuantityChanged",
                itemId: itemId,
                quantity: item.quantity
            });
        }
    }

    return { changes };
}

// Transfert de stockage STW (entre theater0 et outpost0)
async function handleStorageTransfer(req, profile, mcpService) {
    const changes = [];
    let multiUpdate = [];
    
    if (!req.body.transferOperations && 
        (!req.body.theaterToOutpostItems || !req.body.outpostToTheaterItems)) {
        throw Errors.MCP.invalidPayload();
    }

    // Récupérer le profil outpost0
    const outpostProfile = await mcpService.getProfile('outpost0');
    const outpostChanges = [];

    multiUpdate.push({
        profileRevision: outpostProfile.rvn || 0,
        profileId: "outpost0", 
        profileChangesBaseRevision: outpostProfile.rvn || 0,
        profileChanges: outpostChanges,
        profileCommandRevision: outpostProfile.commandRevision || 0
    });

    // Fonction utilitaire pour transférer des items
    function transferItem(fromProfile, toProfile, fromChanges, toChanges, itemId, quantity, toStorage) {
        const fromItem = fromProfile.items[itemId];
        const toItem = toProfile.items[itemId];
        
        if (!fromItem) return;

        const transferQuantity = Number(quantity);
        const fromQuantity = Number(fromItem.quantity);

        if (toItem) {
            // L'item existe dans le profil de destination
            if (fromQuantity > transferQuantity) {
                // Transférer partiellement
                fromItem.quantity -= transferQuantity;
                toItem.quantity += transferQuantity;

                fromChanges.push({
                    changeType: "itemQuantityChanged",
                    itemId: itemId,
                    quantity: fromItem.quantity
                });

                toChanges.push({
                    changeType: "itemQuantityChanged", 
                    itemId: itemId,
                    quantity: toItem.quantity
                });
            } else {
                // Transférer complètement
                toItem.quantity += fromQuantity;
                delete fromProfile.items[itemId];

                toChanges.push({
                    changeType: "itemQuantityChanged",
                    itemId: itemId,
                    quantity: toItem.quantity
                });

                fromChanges.push({
                    changeType: "itemRemoved",
                    itemId: itemId
                });
            }
        } else {
            // L'item n'existe pas dans le profil de destination
            if (fromQuantity > transferQuantity) {
                // Transférer partiellement - créer nouvel item
                const newItem = { ...fromItem };
                newItem.quantity = transferQuantity;
                fromItem.quantity -= transferQuantity;

                toProfile.items[itemId] = newItem;

                fromChanges.push({
                    changeType: "itemQuantityChanged",
                    itemId: itemId,
                    quantity: fromItem.quantity
                });

                toChanges.push({
                    changeType: "itemAdded",
                    itemId: itemId,
                    item: newItem
                });
            } else {
                // Transférer complètement
                toProfile.items[itemId] = fromItem;
                delete fromProfile.items[itemId];

                toChanges.push({
                    changeType: "itemAdded",
                    itemId: itemId,
                    item: toProfile.items[itemId]
                });

                fromChanges.push({
                    changeType: "itemRemoved",
                    itemId: itemId
                });
            }
        }
    }

    // Traiter les transferts
    if (req.body.transferOperations) {
        for (const operation of req.body.transferOperations) {
            const { itemId, quantity, toStorage } = operation;
            
            if (toStorage) {
                // Theater0 vers Outpost0
                transferItem(profile, outpostProfile, changes, outpostChanges, itemId, quantity, true);
            } else {
                // Outpost0 vers Theater0
                transferItem(outpostProfile, profile, outpostChanges, changes, itemId, quantity, false);
            }
        }
    } else {
        // Format legacy
        if (req.body.theaterToOutpostItems) {
            for (const item of req.body.theaterToOutpostItems) {
                transferItem(profile, outpostProfile, changes, outpostChanges, item.itemId, item.quantity, true);
            }
        }

        if (req.body.outpostToTheaterItems) {
            for (const item of req.body.outpostToTheaterItems) {
                transferItem(outpostProfile, profile, outpostChanges, changes, item.itemId, item.quantity, false);
            }
        }
    }

    // Mettre à jour les révisions
    outpostProfile.rvn += 1;
    outpostProfile.commandRevision += 1;
    outpostProfile.updated = new Date().toISOString();

    multiUpdate[0].profileRevision = outpostProfile.rvn;
    multiUpdate[0].profileCommandRevision = outpostProfile.commandRevision;

    // Sauvegarder le profil outpost0
    await mcpService.saveProfile('outpost0', outpostProfile);

    return { changes, multiUpdate };
}

// Recycler des items en lot STW
async function handleRecycleItemBatch(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    let multiUpdate = [];
    
    if (!req.body.targetItemIds || !Array.isArray(req.body.targetItemIds)) {
        throw Errors.MCP.invalidPayload();
    }

    const memory = Functions.GetVersionInfo(req);
    
    // Pour les versions récentes, transférer vers le collection book
    if (memory.season > 11 || memory.build >= 11.30) {
        for (const itemId of req.body.targetItemIds) {
            if (!profile.items[itemId]) continue;

            const item = profile.items[itemId];
            
            // Déterminer le bon profil collection book
            const isSchematic = item.templateId.toLowerCase().startsWith("schematic:");
            const collectionProfileId = isSchematic ? "collection_book_schematics0" : "collection_book_people0";
            
            // Récupérer le profil collection book
            let collectionProfile;
            let profileIndex = multiUpdate.findIndex(p => p.profileId === collectionProfileId);
            
            if (profileIndex === -1) {
                collectionProfile = await mcpService.getProfile(collectionProfileId);
                profileIndex = multiUpdate.length;
                
                multiUpdate.push({
                    profileRevision: collectionProfile.rvn || 0,
                    profileId: collectionProfileId,
                    profileChangesBaseRevision: collectionProfile.rvn || 0,
                    profileChanges: [],
                    profileCommandRevision: collectionProfile.commandRevision || 0
                });
            } else {
                collectionProfile = await mcpService.getProfile(collectionProfileId);
            }

            // Vérifier si un item similaire existe déjà dans le collection book
            let itemExists = false;
            for (const [existingId, existingItem] of Object.entries(collectionProfile.items)) {
                const template1 = item.templateId.slice(0, -4).toLowerCase();
                const template2 = existingItem.templateId.slice(0, -4).toLowerCase();
                
                if (template1 === template2) {
                    // Pour les workers, vérifier aussi la personnalité
                    if (item.templateId.toLowerCase().startsWith("worker:") && 
                        existingItem.templateId.toLowerCase().startsWith("worker:")) {
                        
                        if (item.attributes.personality && existingItem.attributes.personality) {
                            if (item.attributes.personality.toLowerCase() === existingItem.attributes.personality.toLowerCase()) {
                                if (item.attributes.level > existingItem.attributes.level) {
                                    // Remplacer par la version de niveau supérieur
                                    delete collectionProfile.items[existingId];
                                    multiUpdate[profileIndex].profileChanges.push({
                                        changeType: "itemRemoved",
                                        itemId: existingId
                                    });
                                    itemExists = false;
                                } else {
                                    itemExists = true;
                                }
                            }
                        }
                    } else {
                        if (item.attributes.level > existingItem.attributes.level) {
                            delete collectionProfile.items[existingId];
                            multiUpdate[profileIndex].profileChanges.push({
                                changeType: "itemRemoved",
                                itemId: existingId
                            });
                            itemExists = false;
                        } else {
                            itemExists = true;
                        }
                    }
                }
            }

            // Ajouter l'item au collection book s'il n'existe pas
            if (!itemExists) {
                collectionProfile.items[itemId] = item;
                multiUpdate[profileIndex].profileChanges.push({
                    changeType: "itemAdded",
                    itemId: itemId,
                    item: item
                });

                notifications.push({
                    type: "slotItemResult",
                    primary: true,
                    slottedItemId: itemId
                });
            }

            // Supprimer l'item du profil principal
            delete profile.items[itemId];
            changes.push({
                changeType: "itemRemoved",
                itemId: itemId
            });

            // Mettre à jour les révisions du collection book
            collectionProfile.rvn += 1;
            collectionProfile.commandRevision += 1;
            multiUpdate[profileIndex].profileRevision = collectionProfile.rvn;
            multiUpdate[profileIndex].profileCommandRevision = collectionProfile.commandRevision;
            
            await mcpService.saveProfile(collectionProfileId, collectionProfile);
        }
    } else {
        // Pour les anciennes versions, supprimer simplement
        for (const itemId of req.body.targetItemIds) {
            if (profile.items[itemId]) {
                delete profile.items[itemId];
                changes.push({
                    changeType: "itemRemoved",
                    itemId: itemId
                });
            }
        }
    }

    return { changes, notifications, multiUpdate };
}

// Transformer des items STW
async function handleTransmogItem(req, profile) {
    const changes = [];
    const notifications = [];
    
    if (!req.body.sacrificeItemIds || !req.body.transmogKeyTemplateId) {
        throw Errors.MCP.invalidPayload();
    }

    // Supprimer les items sacrifiés
    for (const itemId of req.body.sacrificeItemIds) {
        if (profile.items[itemId]) {
            delete profile.items[itemId];
            changes.push({
                changeType: "itemRemoved",
                itemId: itemId
            });
        }
    }

    // Charger les données de transformation
    let transformItemIDs = [];
    try {
        const transformData = require('../../static-content/campaign/transformItemIDS.json');
        transformItemIDs = transformData[req.body.transmogKeyTemplateId] || transformData.default || [];
    } catch (error) {
        // Utiliser les données par défaut du cardPack
        try {
            const cardPackData = require('../../static-content/campaign/cardPackData.json');
            transformItemIDs = cardPackData.default || [];
        } catch (e) {
            LoggerService.log('warn', 'Could not load transform data');
            transformItemIDs = [];
        }
    }

    if (transformItemIDs.length === 0) {
        throw Errors.MCP.noTransformOptions();
    }

    // Créer un nouvel item aléatoire
    const randomIndex = Math.floor(Math.random() * transformItemIDs.length);
    const newItemTemplate = transformItemIDs[randomIndex];
    const newItemId = Functions.MakeID();

    const newItem = {
        templateId: newItemTemplate,
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

    // Attributs spéciaux pour les workers
    if (newItemTemplate.toLowerCase().startsWith("worker:")) {
        newItem.attributes = Functions.MakeSurvivorAttributes(newItemTemplate);
    }

    profile.items[newItemId] = newItem;

    changes.push({
        changeType: "itemAdded",
        itemId: newItemId,
        item: newItem
    });

    notifications.push({
        type: "transmogResult",
        primary: true,
        transmoggedItems: [{
            itemType: newItem.templateId,
            itemGuid: newItemId,
            itemProfile: req.query?.profileId || "campaign",
            attributes: newItem.attributes,
            quantity: 1
        }]
    });

    return { changes, notifications };
}

module.exports = {
    handleDestroyWorldItems,
    handleDisassembleWorldItems,
    handleStorageTransfer,
    handleRecycleItemBatch,
    handleTransmogItem
};