const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Acheter un nœud de base
async function handlePurchaseHomebaseNode(req, profile) {
    const changes = [];
    
    if (!req.body.nodeId || typeof req.body.nodeId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.nodeId]) {
        throw Errors.MCP.itemNotFound();
    }

    const node = profile.items[req.body.nodeId];
    
    // Vérifier que c'est un nœud de base
    if (!node.templateId.includes('HomebaseNode')) {
        throw Errors.MCP.invalidHomebaseNode();
    }

    // Vérifier si déjà acheté
    if (node.attributes.level > 0) {
        throw Errors.MCP.alreadyPurchased();
    }

    // Vérifier les coûts
    const cost = node.attributes.cost || {};
    for (const [resourceType, amount] of Object.entries(cost)) {
        const hasEnoughResources = await checkResources(profile, resourceType, amount);
        if (!hasEnoughResources) {
            throw Errors.MCP.insufficientResources(resourceType, amount);
        }
    }

    // Déduire les ressources
    for (const [resourceType, amount] of Object.entries(cost)) {
        await deductResources(profile, resourceType, amount, changes);
    }

    // Mettre à jour le nœud
    node.attributes.level = 1;
    node.attributes.purchased_time = new Date().toISOString();

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.nodeId,
        attributeName: "level",
        attributeValue: node.attributes.level
    });

    return { changes };
}

// Rembourser un article
async function handleRefundItem(req, profile) {
    const changes = [];
    
    if (!req.body.itemId || typeof req.body.itemId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.itemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = profile.items[req.body.itemId];
    
    // Vérifier que l'article peut être remboursé
    if (!item.attributes.refundable) {
        throw Errors.MCP.notRefundable();
    }

    // Calculer le remboursement
    const refundAmount = calculateRefund(item);
    
    // Ajouter les ressources remboursées
    await addResources(profile, 'currency:mtxcurrency', refundAmount, changes);

    // Supprimer l'article
    delete profile.items[req.body.itemId];

    changes.push({
        changeType: "itemRemoved",
        itemId: req.body.itemId
    });

    return { changes };
}

// Améliorer un article
async function handleUpgradeItem(req, profile) {
    const changes = [];
    
    if (!req.body.itemId || typeof req.body.itemId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.itemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = profile.items[req.body.itemId];
    const currentLevel = item.attributes.level || 1;
    const maxLevel = item.attributes.max_level || 50;

    // Vérifier si peut être amélioré
    if (currentLevel >= maxLevel) {
        throw Errors.MCP.maxLevelReached();
    }

    // Calculer le coût d'amélioration
    const upgradeCost = calculateUpgradeCost(item, currentLevel);
    
    // Vérifier les ressources
    for (const [resourceType, amount] of Object.entries(upgradeCost)) {
        const hasEnoughResources = await checkResources(profile, resourceType, amount);
        if (!hasEnoughResources) {
            throw Errors.MCP.insufficientResources(resourceType, amount);
        }
    }

    // Déduire les ressources
    for (const [resourceType, amount] of Object.entries(upgradeCost)) {
        await deductResources(profile, resourceType, amount, changes);
    }

    // Améliorer l'article
    item.attributes.level = currentLevel + 1;
    item.attributes.xp = (item.attributes.xp || 0) + 1000;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.itemId,
        attributeName: "level",
        attributeValue: item.attributes.level
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.itemId,
        attributeName: "xp",
        attributeValue: item.attributes.xp
    });

    return { changes };
}

// Améliorer la rareté d'un article
async function handleUpgradeItemRarity(req, profile) {
    const changes = [];
    const notifications = [];
    
    if (!req.body.itemId || typeof req.body.itemId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.itemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = profile.items[req.body.itemId];
    const currentRarity = item.attributes.rarity || 'Common';
    const rarityLevels = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    const currentIndex = rarityLevels.indexOf(currentRarity);

    // Vérifier si peut être amélioré
    if (currentIndex >= rarityLevels.length - 1) {
        throw Errors.MCP.maxRarityReached();
    }

    // Calculer le coût d'amélioration de rareté
    const upgradeCost = calculateRarityUpgradeCost(item, currentRarity);
    
    // Vérifier les ressources
    for (const [resourceType, amount] of Object.entries(upgradeCost)) {
        const hasEnoughResources = await checkResources(profile, resourceType, amount);
        if (!hasEnoughResources) {
            throw Errors.MCP.insufficientResources(resourceType, amount);
        }
    }

    // Déduire les ressources
    for (const [resourceType, amount] of Object.entries(upgradeCost)) {
        await deductResources(profile, resourceType, amount, changes);
    }

    // Améliorer la rareté
    const newRarity = rarityLevels[currentIndex + 1];
    item.attributes.rarity = newRarity;
    item.attributes.max_level = Math.min(item.attributes.max_level + 10, 130);

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.itemId,
        attributeName: "rarity",
        attributeValue: item.attributes.rarity
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.itemId,
        attributeName: "max_level",
        attributeValue: item.attributes.max_level
    });

    notifications.push({
        type: "itemRarityUpgraded",
        primary: true,
        itemId: req.body.itemId,
        newRarity: newRarity
    });

    return { changes, notifications };
}

// Convertir un article
async function handleConvertItem(req, profile) {
    const changes = [];
    const notifications = [];
    
    if (!req.body.itemId || typeof req.body.itemId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!req.body.targetType || typeof req.body.targetType !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.itemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = profile.items[req.body.itemId];
    
    // Vérifier si l'article peut être converti
    if (!item.attributes.convertible) {
        throw Errors.MCP.notConvertible();
    }

    // Calculer les ressources récupérées
    const recycleRewards = calculateRecycleRewards(item);
    
    // Ajouter les ressources
    for (const [resourceType, amount] of Object.entries(recycleRewards)) {
        await addResources(profile, resourceType, amount, changes);
    }

    // Supprimer l'article original
    delete profile.items[req.body.itemId];

    changes.push({
        changeType: "itemRemoved",
        itemId: req.body.itemId
    });

    notifications.push({
        type: "itemConverted",
        primary: true,
        originalItemId: req.body.itemId,
        rewards: recycleRewards
    });

    return { changes, notifications };
}

// Fabriquer un article du monde
async function handleCraftWorldItem(req, profile) {
    const changes = [];
    const notifications = [];
    
    if (!req.body.schematicId || typeof req.body.schematicId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.schematicId]) {
        throw Errors.MCP.itemNotFound();
    }

    const schematic = profile.items[req.body.schematicId];
    
    // Vérifier que c'est un schéma
    if (!schematic.templateId.includes('Schematic')) {
        throw Errors.MCP.invalidSchematic();
    }

    // Calculer le coût de fabrication
    const craftingCost = calculateCraftingCost(schematic);
    
    // Vérifier les ressources
    for (const [resourceType, amount] of Object.entries(craftingCost)) {
        const hasEnoughResources = await checkResources(profile, resourceType, amount);
        if (!hasEnoughResources) {
            throw Errors.MCP.insufficientResources(resourceType, amount);
        }
    }

    // Déduire les ressources
    for (const [resourceType, amount] of Object.entries(craftingCost)) {
        await deductResources(profile, resourceType, amount, changes);
    }

    // Créer l'article fabriqué
    const craftedItemId = Functions.MakeID();
    const craftedItem = {
        templateId: schematic.attributes.crafted_item_template,
        attributes: {
            level: 1,
            durability: schematic.attributes.durability || 100,
            crafted_time: new Date().toISOString(),
            crafted_from: req.body.schematicId
        },
        quantity: 1
    };

    profile.items[craftedItemId] = craftedItem;

    changes.push({
        changeType: "itemAdded",
        itemId: craftedItemId,
        item: craftedItem
    });

    notifications.push({
        type: "itemCrafted",
        primary: true,
        itemId: craftedItemId,
        schematicId: req.body.schematicId
    });

    return { changes, notifications };
}

// Fonctions utilitaires
async function checkResources(profile, resourceType, amount) {
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId.toLowerCase() === resourceType.toLowerCase()) {
            return item.quantity >= amount;
        }
    }
    return false;
}

async function deductResources(profile, resourceType, amount, changes) {
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId.toLowerCase() === resourceType.toLowerCase()) {
            item.quantity -= amount;
            
            changes.push({
                changeType: "itemQuantityChanged",
                itemId: itemId,
                quantity: item.quantity
            });
            break;
        }
    }
}

async function addResources(profile, resourceType, amount, changes) {
    let resourceFound = false;
    
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId.toLowerCase() === resourceType.toLowerCase()) {
            item.quantity += amount;
            
            changes.push({
                changeType: "itemQuantityChanged",
                itemId: itemId,
                quantity: item.quantity
            });
            
            resourceFound = true;
            break;
        }
    }
    
    if (!resourceFound) {
        const resourceId = Functions.MakeID();
        profile.items[resourceId] = {
            templateId: resourceType,
            attributes: {},
            quantity: amount
        };
        
        changes.push({
            changeType: "itemAdded",
            itemId: resourceId,
            item: profile.items[resourceId]
        });
    }
}

function calculateRefund(item) {
    // Formule basique de remboursement
    const baseValue = item.attributes.purchase_price || 100;
    const level = item.attributes.level || 1;
    return Math.floor(baseValue * 0.7 * level);
}

function calculateUpgradeCost(item, currentLevel) {
    // Coûts d'amélioration basiques
    const baseCost = 50 * currentLevel;
    return {
        'Currency:ReagentCurrency01': baseCost,
        'Currency:ReagentCurrency02': Math.floor(baseCost * 0.5)
    };
}

function calculateRarityUpgradeCost(item, currentRarity) {
    const rarityMultiplier = {
        'Common': 1,
        'Uncommon': 2,
        'Rare': 4,
        'Epic': 8,
        'Legendary': 16
    };
    
    const multiplier = rarityMultiplier[currentRarity] || 1;
    
    return {
        'Currency:ReagentCurrency01': 100 * multiplier,
        'Currency:ReagentCurrency02': 50 * multiplier,
        'Currency:ReagentCurrency03': 25 * multiplier
    };
}

function calculateRecycleRewards(item) {
    const level = item.attributes.level || 1;
    const rarity = item.attributes.rarity || 'Common';
    
    const rarityMultiplier = {
        'Common': 1,
        'Uncommon': 1.5,
        'Rare': 2,
        'Epic': 3,
        'Legendary': 5
    };
    
    const multiplier = rarityMultiplier[rarity] || 1;
    const baseReward = 10 * level * multiplier;
    
    return {
        'Currency:ReagentCurrency01': Math.floor(baseReward),
        'Currency:ReagentCurrency02': Math.floor(baseReward * 0.5)
    };
}

function calculateCraftingCost(schematic) {
    const level = schematic.attributes.level || 1;
    const rarity = schematic.attributes.rarity || 'Common';
    
    const rarityMultiplier = {
        'Common': 1,
        'Uncommon': 1.5,
        'Rare': 2,
        'Epic': 3,
        'Legendary': 5
    };
    
    const multiplier = rarityMultiplier[rarity] || 1;
    const baseCost = 20 * level * multiplier;
    
    return {
        'Currency:ReagentCurrency01': Math.floor(baseCost),
        'Currency:ReagentCurrency02': Math.floor(baseCost * 0.3),
        'Currency:ReagentCurrency03': Math.floor(baseCost * 0.1)
    };
}

async function handleClaimLoginReward(req, profile) {
    const changes = [];
    const notifications = [];
    
    if (!profile.stats.attributes.daily_rewards) {
        profile.stats.attributes.daily_rewards = {
            nextDefaultReward: 1,
            totalDaysLoggedIn: 0,
            lastClaimDate: null,
            additionalSchedules: {
                founderspackdailyrewardtoken: {
                    rewardsClaimed: 0
                }
            }
        };
    }

    const today = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";
    
    if (profile.stats.attributes.daily_rewards.lastClaimDate === today) {
        throw Errors.MCP.alreadyClaimedToday();
    }

    profile.stats.attributes.daily_rewards.nextDefaultReward += 1;
    profile.stats.attributes.daily_rewards.totalDaysLoggedIn += 1;
    profile.stats.attributes.daily_rewards.lastClaimDate = today;
    profile.stats.attributes.daily_rewards.additionalSchedules.founderspackdailyrewardtoken.rewardsClaimed += 1;

    changes.push({
        changeType: "statModified",
        name: "daily_rewards",
        value: profile.stats.attributes.daily_rewards
    });

    const day = profile.stats.attributes.daily_rewards.totalDaysLoggedIn % 336;
    const dailyRewards = require('../../static-content/campaign/dailyRewards.json');
    
    if (dailyRewards[day]) {
        notifications.push({
            type: "daily_rewards",
            primary: true,
            daysLoggedIn: profile.stats.attributes.daily_rewards.totalDaysLoggedIn,
            items: [dailyRewards[day]]
        });
    }

    return { changes, notifications };
}

// Assigner un team perk à un loadout STW
async function handleAssignTeamPerkToLoadout(req, profile) {
    const changes = [];
    
    if (!req.body.loadoutId || typeof req.body.teamPerkId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.loadoutId]) {
        throw Errors.MCP.loadoutNotFound();
    }

    profile.items[req.body.loadoutId].attributes.team_perk = req.body.teamPerkId || "";

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.loadoutId,
        attributeName: "team_perk",
        attributeValue: profile.items[req.body.loadoutId].attributes.team_perk
    });

    return { changes };
}

// Assigner un gadget à un loadout STW
async function handleAssignGadgetToLoadout(req, profile) {
    const changes = [];
    
    if (!req.body.loadoutId || typeof req.body.slotIndex !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.loadoutId]) {
        throw Errors.MCP.loadoutNotFound();
    }

    if (!profile.items[req.body.loadoutId].attributes.gadgets) {
        profile.items[req.body.loadoutId].attributes.gadgets = [
            { gadget: "", slot_index: 0 },
            { gadget: "", slot_index: 1 }
        ];
    }

    const otherSlotIndex = req.body.slotIndex === 0 ? 1 : 0;
    
    // Éviter les doublons
    if (req.body.gadgetId === profile.items[req.body.loadoutId].attributes.gadgets[otherSlotIndex].gadget) {
        profile.items[req.body.loadoutId].attributes.gadgets[otherSlotIndex].gadget = "";
    }

    profile.items[req.body.loadoutId].attributes.gadgets[req.body.slotIndex].gadget = req.body.gadgetId || "";

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.loadoutId,
        attributeName: "gadgets",
        attributeValue: profile.items[req.body.loadoutId].attributes.gadgets
    });

    return { changes };
}

// Assigner un worker à une squad STW
async function handleAssignWorkerToSquad(req, profile) {
    const changes = [];
    
    if (!req.body.characterId || !req.body.squadId || typeof req.body.slotIndex !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.characterId]) {
        throw Errors.MCP.itemNotFound();
    }

    // Retirer tout worker existant de ce slot
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.attributes && item.attributes.squad_id && item.attributes.squad_slot_idx !== undefined) {
            if (item.attributes.squad_id.toLowerCase() === req.body.squadId.toLowerCase() && 
                item.attributes.squad_slot_idx === req.body.slotIndex) {
                
                item.attributes.squad_id = "";
                item.attributes.squad_slot_idx = -1;

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: itemId,
                    attributeName: "squad_id",
                    attributeValue: ""
                });

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: itemId,
                    attributeName: "squad_slot_idx",
                    attributeValue: -1
                });
            }
        }
    }

    // Assigner le nouveau worker
    profile.items[req.body.characterId].attributes.squad_id = req.body.squadId;
    profile.items[req.body.characterId].attributes.squad_slot_idx = req.body.slotIndex;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.characterId,
        attributeName: "squad_id",
        attributeValue: req.body.squadId
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.characterId,
        attributeName: "squad_slot_idx",
        attributeValue: req.body.slotIndex
    });

    return { changes };
}

// Assigner plusieurs workers en batch
async function handleAssignWorkerToSquadBatch(req, profile) {
    const changes = [];
    
    if (!req.body.characterIds || !req.body.squadIds || !req.body.slotIndices) {
        throw Errors.MCP.invalidPayload();
    }

    if (req.body.characterIds.length !== req.body.squadIds.length || 
        req.body.characterIds.length !== req.body.slotIndices.length) {
        throw Errors.MCP.mismatchedArraySizes();
    }

    for (let i = 0; i < req.body.characterIds.length; i++) {
        const characterId = req.body.characterIds[i];
        const squadId = req.body.squadIds[i];
        const slotIndex = req.body.slotIndices[i];

        if (!profile.items[characterId]) continue;

        // Retirer worker existant de ce slot
        for (const [itemId, item] of Object.entries(profile.items)) {
            if (item.attributes && item.attributes.squad_id && item.attributes.squad_slot_idx !== undefined) {
                if (item.attributes.squad_id.toLowerCase() === squadId.toLowerCase() && 
                    item.attributes.squad_slot_idx === slotIndex) {
                    
                    item.attributes.squad_id = "";
                    item.attributes.squad_slot_idx = -1;

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: itemId,
                        attributeName: "squad_id",
                        attributeValue: ""
                    });

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: itemId,
                        attributeName: "squad_slot_idx",
                        attributeValue: -1
                    });
                }
            }
        }

        // Assigner le nouveau worker
        profile.items[characterId].attributes.squad_id = squadId;
        profile.items[characterId].attributes.squad_slot_idx = slotIndex;

        changes.push({
            changeType: "itemAttrChanged",
            itemId: characterId,
            attributeName: "squad_id",
            attributeValue: squadId
        });

        changes.push({
            changeType: "itemAttrChanged",
            itemId: characterId,
            attributeName: "squad_slot_idx",
            attributeValue: slotIndex
        });
    }

    return { changes };
}

// Upgrade item en bulk
async function handleUpgradeItemBulk(req, profile) {
    const changes = [];
    
    if (!req.body.targetItemId || typeof req.body.desiredLevel !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.targetItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const maxLevel = profile.items[req.body.targetItemId].attributes.max_level || 50;
    
    if (req.body.desiredLevel > maxLevel) {
        throw Errors.MCP.exceedsMaxLevel();
    }

    profile.items[req.body.targetItemId].attributes.level = req.body.desiredLevel;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.targetItemId,
        attributeName: "level",
        attributeValue: req.body.desiredLevel
    });

    return { changes };
}

// Upgrade slotted item
async function handleUpgradeSlottedItem(req, profile) {
    const changes = [];
    
    if (!req.body.targetItemId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.targetItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    if (req.body.desiredLevel && typeof req.body.desiredLevel === 'number') {
        profile.items[req.body.targetItemId].attributes.level = req.body.desiredLevel;
    } else {
        profile.items[req.body.targetItemId].attributes.level += 1;
    }

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.targetItemId,
        attributeName: "level",
        attributeValue: profile.items[req.body.targetItemId].attributes.level
    });

    return { changes };
}

// Convertir un item slotted
async function handleConvertSlottedItem(req, profile) {
    const changes = [];
    const notifications = [];
    
    if (!req.body.targetItemId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.targetItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const item = profile.items[req.body.targetItemId];
    let newTemplateId = item.templateId;

    // Évolution des tiers
    if (newTemplateId.toLowerCase().includes("t04")) {
        newTemplateId = newTemplateId.replace(/t04/ig, "T05");
    } else if (newTemplateId.toLowerCase().includes("t03")) {
        newTemplateId = newTemplateId.replace(/t03/ig, "T04");
    } else if (newTemplateId.toLowerCase().includes("t02")) {
        newTemplateId = newTemplateId.replace(/t02/ig, "T03");
    } else if (newTemplateId.toLowerCase().includes("t01")) {
        newTemplateId = newTemplateId.replace(/t01/ig, "T02");
    }

    // Conversion Ore/Crystal
    if (req.body.conversionIndex === 1) {
        newTemplateId = newTemplateId.replace(/ore/ig, "Crystal");
    }

    const newItemId = Functions.MakeID();
    const newItem = { ...item };
    newItem.templateId = newTemplateId;

    profile.items[newItemId] = newItem;
    delete profile.items[req.body.targetItemId];

    changes.push({
        changeType: "itemAdded",
        itemId: newItemId,
        item: newItem
    });

    changes.push({
        changeType: "itemRemoved",
        itemId: req.body.targetItemId
    });

    notifications.push({
        type: "conversionResult",
        primary: true,
        itemsGranted: [{
            itemType: newItem.templateId,
            itemGuid: newItemId,
            itemProfile: req.query?.profileId || "collection_book_people0",
            attributes: {
                level: newItem.attributes.level,
                alterations: newItem.attributes.alterations || []
            },
            quantity: 1
        }]
    });

    return { changes, notifications };
}

// Promouvoir un item (super charge)
async function handlePromoteItem(req, profile) {
    const changes = [];
    
    if (!req.body.targetItemId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.targetItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    profile.items[req.body.targetItemId].attributes.level += 2;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.targetItemId,
        attributeName: "level",
        attributeValue: profile.items[req.body.targetItemId].attributes.level
    });

    return { changes };
}

module.exports = {
    handlePurchaseHomebaseNode,
    handleRefundItem,
    handleUpgradeItem,
    handleUpgradeItemRarity,
    handleConvertItem,
    handleCraftWorldItem,
    handleClaimLoginReward,
    handleAssignTeamPerkToLoadout,
    handleAssignGadgetToLoadout,
    handleAssignWorkerToSquad,
    handleAssignWorkerToSquadBatch,
    handleUpgradeItemBulk,
    handleUpgradeSlottedItem,
    handleConvertSlottedItem,
    handlePromoteItem
};