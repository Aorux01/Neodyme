const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Assigner un héros à un loadout STW
async function handleAssignHeroToLoadout(req, profile) {
    const changes = [];
    
    if (!req.body.loadoutId || !req.body.slotName) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.loadoutId]) {
        throw Errors.MCP.loadoutNotFound();
    }

    const loadout = profile.items[req.body.loadoutId];
    if (!loadout.attributes.crew_members) {
        loadout.attributes.crew_members = {
            commanderslot: "",
            followerslot1: "",
            followerslot2: "",
            followerslot3: "",
            followerslot4: "",
            followerslot5: ""
        };
    }

    const heroId = req.body.heroId || "";

    // Éviter les doublons - retirer le héros de tous les autres slots
    if (heroId) {
        for (const slot in loadout.attributes.crew_members) {
            if (loadout.attributes.crew_members[slot].toLowerCase() === heroId.toLowerCase()) {
                loadout.attributes.crew_members[slot] = "";
            }
        }
    }

    // Assigner au nouveau slot
    switch (req.body.slotName) {
        case "CommanderSlot":
            loadout.attributes.crew_members.commanderslot = heroId;
            break;
        case "FollowerSlot1":
            loadout.attributes.crew_members.followerslot1 = heroId;
            break;
        case "FollowerSlot2":
            loadout.attributes.crew_members.followerslot2 = heroId;
            break;
        case "FollowerSlot3":
            loadout.attributes.crew_members.followerslot3 = heroId;
            break;
        case "FollowerSlot4":
            loadout.attributes.crew_members.followerslot4 = heroId;
            break;
        case "FollowerSlot5":
            loadout.attributes.crew_members.followerslot5 = heroId;
            break;
        default:
            throw Errors.MCP.invalidSlotName();
    }

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.loadoutId,
        attributeName: "crew_members",
        attributeValue: loadout.attributes.crew_members
    });

    return { changes };
}

// Vider un loadout de héros STW
async function handleClearHeroLoadout(req, profile) {
    const changes = [];
    
    if (!req.body.loadoutId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.loadoutId]) {
        throw Errors.MCP.loadoutNotFound();
    }

    const loadout = profile.items[req.body.loadoutId];
    const loadoutName = loadout.attributes.loadout_name || "";
    const loadoutIndex = loadout.attributes.loadout_index || 0;
    const commanderSlot = loadout.attributes.crew_members?.commanderslot || "";

    // Garder uniquement le commander et vider le reste
    loadout.attributes = {
        team_perk: "",
        loadout_name: loadoutName,
        crew_members: {
            followerslot5: "",
            followerslot4: "",
            followerslot3: "",
            followerslot2: "",
            followerslot1: "",
            commanderslot: commanderSlot
        },
        loadout_index: loadoutIndex,
        gadgets: [
            { gadget: "", slot_index: 0 },
            { gadget: "", slot_index: 1 }
        ]
    };

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.loadoutId,
        attributeName: "team_perk",
        attributeValue: loadout.attributes.team_perk
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.loadoutId,
        attributeName: "crew_members",
        attributeValue: loadout.attributes.crew_members
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.loadoutId,
        attributeName: "gadgets",
        attributeValue: loadout.attributes.gadgets
    });

    return { changes };
}

// Définir le loadout de héros actif STW
async function handleSetActiveHeroLoadout(req, profile) {
    const changes = [];
    
    if (!req.body.selectedLoadout) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.selectedLoadout]) {
        throw Errors.MCP.loadoutNotFound();
    }

    profile.stats.attributes.selected_hero_loadout = req.body.selectedLoadout;

    changes.push({
        changeType: "statModified",
        name: "selected_hero_loadout",
        value: profile.stats.attributes.selected_hero_loadout
    });

    return { changes };
}

// Définir les variantes cosmétiques d'un héros STW
async function handleSetHeroCosmeticVariants(req, profile) {
    const changes = [];
    
    if (!req.body.heroItem || !req.body.outfitVariants || !req.body.backblingVariants) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.heroItem]) {
        throw Errors.MCP.itemNotFound();
    }

    profile.items[req.body.heroItem].attributes.outfitvariants = req.body.outfitVariants;
    profile.items[req.body.heroItem].attributes.backblingvariants = req.body.backblingVariants;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.heroItem,
        attributeName: "outfitvariants",
        attributeValue: req.body.outfitVariants
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.heroItem,
        attributeName: "backblingvariants",
        attributeValue: req.body.backblingVariants
    });

    return { changes };
}

// Modifier la quickbar STW
async function handleModifyQuickbar(req, profile) {
    const changes = [];
    
    if (!profile.stats.attributes.player_loadout) {
        profile.stats.attributes.player_loadout = {
            primaryQuickBarRecord: {
                slots: Array(6).fill(null).map((_, i) => ({ items: [] }))
            },
            secondaryQuickBarRecord: {
                slots: Array(6).fill(null).map((_, i) => ({ items: [] }))
            }
        };
    }

    if (req.body.primaryQuickbarChoices) {
        for (let i = 0; i < req.body.primaryQuickbarChoices.length && i < 5; i++) {
            const slotIndex = i + 1;
            const choice = req.body.primaryQuickbarChoices[i];
            
            if (choice === "") {
                profile.stats.attributes.player_loadout.primaryQuickBarRecord.slots[slotIndex].items = [];
            } else {
                const formattedChoice = choice.replace(/-/g, "").toUpperCase();
                profile.stats.attributes.player_loadout.primaryQuickBarRecord.slots[slotIndex].items = [formattedChoice];
            }
        }
    }

    if (typeof req.body.secondaryQuickbarChoice === "string") {
        const choice = req.body.secondaryQuickbarChoice;
        
        if (choice === "") {
            profile.stats.attributes.player_loadout.secondaryQuickBarRecord.slots[5].items = [];
        } else {
            const formattedChoice = choice.replace(/-/g, "").toUpperCase();
            profile.stats.attributes.player_loadout.secondaryQuickBarRecord.slots[5].items = [formattedChoice];
        }
    }

    changes.push({
        changeType: "statModified",
        name: "player_loadout",
        value: profile.stats.attributes.player_loadout
    });

    return { changes };
}

// Désassigner toutes les squads STW
async function handleUnassignAllSquads(req, profile) {
    const changes = [];
    
    if (!req.body.squadIds || !Array.isArray(req.body.squadIds)) {
        throw Errors.MCP.invalidPayload();
    }

    for (const squadId of req.body.squadIds) {
        for (const [itemId, item] of Object.entries(profile.items)) {
            if (item.attributes?.squad_id?.toLowerCase() === squadId.toLowerCase()) {
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

    return { changes };
}

// Activer un consommable STW
async function handleActivateConsumable(req, profile) {
    const changes = [];
    
    if (!req.body.targetItemId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.targetItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    const consumable = profile.items[req.body.targetItemId];
    
    if (consumable.quantity <= 0) {
        throw Errors.MCP.insufficientQuantity();
    }

    consumable.quantity -= 1;

    changes.push({
        changeType: "itemQuantityChanged",
        itemId: req.body.targetItemId,
        quantity: consumable.quantity
    });

    // Chercher et ajouter de l'XP boost
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId === "Token:xpboost") {
            const xpAmount = Math.floor(Math.random() * 250000) + 1000000;
            item.quantity += xpAmount;

            changes.push({
                changeType: "itemQuantityChanged",
                itemId: itemId,
                quantity: item.quantity
            });
            break;
        }
    }

    return { changes };
}

module.exports = {
    handleAssignHeroToLoadout,
    handleClearHeroLoadout,
    handleSetActiveHeroLoadout,
    handleSetHeroCosmeticVariants,
    handleModifyQuickbar,
    handleUnassignAllSquads,
    handleActivateConsumable
};