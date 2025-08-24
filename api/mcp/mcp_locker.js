const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Cosmétiques spéciaux (random)
const SPECIAL_COSMETICS = [
    "AthenaCharacter:cid_random",
    "AthenaBackpack:bid_random",
    "AthenaPickaxe:pickaxe_random",
    "AthenaGlider:glider_random",
    "AthenaSkyDiveContrail:trails_random",
    "AthenaItemWrap:wrap_random",
    "AthenaMusicPack:musicpack_random",
    "AthenaLoadingScreen:lsid_random"
];

// Équiper une personnalisation Battle Royale
async function handleEquipBattleRoyaleCustomization(req, profile) {
    const changes = [];
    
    if (!req.body.slotName || typeof req.body.slotName !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.itemToSlot !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items) profile.items = {};

    // Vérifier si l'item existe ou est un cosmétique spécial
    if (!profile.items[req.body.itemToSlot] && req.body.itemToSlot) {
        if (!SPECIAL_COSMETICS.includes(req.body.itemToSlot)) {
            throw Errors.MCP.itemNotFound();
        } else {
            // Vérifier que l'item correspond au slot
            if (!req.body.itemToSlot.startsWith(`Athena${req.body.slotName}:`)) {
                throw Errors.MCP.invalidSlotType();
            }
        }
    }

    // Vérifier le type d'item pour le slot
    if (profile.items[req.body.itemToSlot]) {
        if (!profile.items[req.body.itemToSlot].templateId.startsWith(`Athena${req.body.slotName}:`)) {
            throw Errors.MCP.invalidSlotType();
        }

        // Gérer les variantes
        if (req.body.variantUpdates && Array.isArray(req.body.variantUpdates)) {
            for (const variant of req.body.variantUpdates) {
                if (typeof variant !== 'object' || !variant.channel || !variant.active) continue;

                const variantIndex = profile.items[req.body.itemToSlot].attributes.variants.findIndex(
                    v => v.channel === variant.channel
                );

                if (variantIndex === -1) continue;
                if (!profile.items[req.body.itemToSlot].attributes.variants[variantIndex].owned.includes(variant.active)) continue;

                profile.items[req.body.itemToSlot].attributes.variants[variantIndex].active = variant.active;
            }

            changes.push({
                changeType: "itemAttrChanged",
                itemId: req.body.itemToSlot,
                attributeName: "variants",
                attributeValue: profile.items[req.body.itemToSlot].attributes.variants
            });
        }
    }

    const activeLoadoutId = profile.stats.attributes.loadouts[profile.stats.attributes.active_loadout_index];
    const templateId = profile.items[req.body.itemToSlot] ? profile.items[req.body.itemToSlot].templateId : req.body.itemToSlot;
    
    switch (req.body.slotName) {
        case "Dance":
            if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[req.body.slotName]) break;

            if (typeof req.body.indexWithinSlot !== 'number') {
                throw Errors.MCP.invalidPayload();
            }

            if (req.body.indexWithinSlot >= 0 && req.body.indexWithinSlot <= 5) {
                profile.stats.attributes.favorite_dance[req.body.indexWithinSlot] = req.body.itemToSlot;
                profile.items[activeLoadoutId].attributes.locker_slots_data.slots.Dance.items[req.body.indexWithinSlot] = templateId;

                changes.push({
                    changeType: "statModified",
                    name: "favorite_dance",
                    value: profile.stats.attributes.favorite_dance
                });
            }
            break;

        case "ItemWrap":
            if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[req.body.slotName]) break;

            if (typeof req.body.indexWithinSlot !== 'number') {
                throw Errors.MCP.invalidPayload();
            }

            if (req.body.indexWithinSlot >= 0 && req.body.indexWithinSlot <= 7) {
                profile.stats.attributes.favorite_itemwraps[req.body.indexWithinSlot] = req.body.itemToSlot;
                profile.items[activeLoadoutId].attributes.locker_slots_data.slots.ItemWrap.items[req.body.indexWithinSlot] = templateId;

                changes.push({
                    changeType: "statModified",
                    name: "favorite_itemwraps",
                    value: profile.stats.attributes.favorite_itemwraps
                });
            } else if (req.body.indexWithinSlot === -1) {
                // Appliquer à tous les wraps
                for (let i = 0; i < 7; i++) {
                    profile.stats.attributes.favorite_itemwraps[i] = req.body.itemToSlot;
                    profile.items[activeLoadoutId].attributes.locker_slots_data.slots.ItemWrap.items[i] = templateId;
                }

                changes.push({
                    changeType: "statModified",
                    name: "favorite_itemwraps",
                    value: profile.stats.attributes.favorite_itemwraps
                });
            }
            break;

        default:
            const slotNames = ["Character", "Backpack", "Pickaxe", "Glider", "SkyDiveContrail", "MusicPack", "LoadingScreen"];
            
            if (!slotNames.includes(req.body.slotName)) break;
            if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[req.body.slotName]) break;

            // Les piochos et planeurs ne peuvent pas être vides
            if ((req.body.slotName === "Pickaxe" || req.body.slotName === "Glider") && !req.body.itemToSlot) {
                throw Errors.MCP.requiredItem(req.body.slotName);
            }

            profile.stats.attributes[`favorite_${req.body.slotName.toLowerCase()}`] = req.body.itemToSlot;
            profile.items[activeLoadoutId].attributes.locker_slots_data.slots[req.body.slotName].items = [templateId];

            changes.push({
                changeType: "statModified",
                name: `favorite_${req.body.slotName.toLowerCase()}`,
                value: profile.stats.attributes[`favorite_${req.body.slotName.toLowerCase()}`]
            });
            break;
    }

    return { changes };
}

// Définir la bannière Battle Royale
async function handleSetBattleRoyaleBanner(req, profile) {
    const changes = [];
    
    if (!req.body.homebaseBannerIconId || !req.body.homebaseBannerColorId) {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.homebaseBannerIconId !== 'string' || typeof req.body.homebaseBannerColorId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    // Déterminer le profil de bannière selon la version
    const memory = Functions.GetVersionInfo(req);
    const bannerProfileId = memory.build < 3.5 ? "profile0" : "common_core";

    // Chercher les IDs des bannières dans le profil approprié
    let homebaseBannerIconID = "";
    let homebaseBannerColorID = "";

    const bannerProfile = await require('../../src/services/MCPService').getProfile(req.user.accountId, bannerProfileId);
    if (!bannerProfile.items) bannerProfile.items = {};

    for (const [itemId, item] of Object.entries(bannerProfile.items)) {
        if (item.templateId.toLowerCase() === `HomebaseBannerIcon:${req.body.homebaseBannerIconId}`.toLowerCase()) {
            homebaseBannerIconID = itemId;
        }
        if (item.templateId.toLowerCase() === `HomebaseBannerColor:${req.body.homebaseBannerColorId}`.toLowerCase()) {
            homebaseBannerColorID = itemId;
        }
        
        if (homebaseBannerIconID && homebaseBannerColorID) break;
    }

    if (!homebaseBannerIconID) {
        throw Errors.MCP.bannerNotFound(`HomebaseBannerIcon:${req.body.homebaseBannerIconId}`);
    }

    if (!homebaseBannerColorID) {
        throw Errors.MCP.bannerNotFound(`HomebaseBannerColor:${req.body.homebaseBannerColorId}`);
    }

    // Mettre à jour la bannière
    if (!profile.items) profile.items = {};

    const activeLoadoutId = profile.stats.attributes.loadouts[profile.stats.attributes.active_loadout_index];

    profile.stats.attributes.banner_icon = req.body.homebaseBannerIconId;
    profile.stats.attributes.banner_color = req.body.homebaseBannerColorId;

    profile.items[activeLoadoutId].attributes.banner_icon_template = req.body.homebaseBannerIconId;
    profile.items[activeLoadoutId].attributes.banner_color_template = req.body.homebaseBannerColorId;

    changes.push({
        changeType: "statModified",
        name: "banner_icon",
        value: profile.stats.attributes.banner_icon
    });
    
    changes.push({
        changeType: "statModified",
        name: "banner_color",
        value: profile.stats.attributes.banner_color
    });

    return { changes };
}

// Définir un slot de casier cosmétique
async function handleSetCosmeticLockerSlot(req, profile) {
    const changes = [];
    
    if (!req.body.category || !req.body.lockerItem) {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.itemToSlot !== 'string' || 
        typeof req.body.slotIndex !== 'number' || 
        typeof req.body.lockerItem !== 'string' || 
        typeof req.body.category !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items) profile.items = {};

    // Trouver l'ID de l'item à équiper
    let itemToSlotID = "";
    if (req.body.itemToSlot) {
        for (const [itemId, item] of Object.entries(profile.items)) {
            if (item.templateId.toLowerCase() === req.body.itemToSlot.toLowerCase()) {
                itemToSlotID = itemId;
                break;
            }
        }
    }

    // Vérifier que le casier existe
    if (!profile.items[req.body.lockerItem]) {
        throw Errors.MCP.itemNotFound();
    }

    if (profile.items[req.body.lockerItem].templateId.toLowerCase() !== "cosmeticlocker:cosmeticlocker_athena") {
        throw Errors.MCP.invalidLockerItem();
    }

    // Vérifier l'item à équiper
    if (!profile.items[itemToSlotID] && req.body.itemToSlot) {
        if (!SPECIAL_COSMETICS.includes(req.body.itemToSlot)) {
            throw Errors.MCP.itemNotFound();
        } else {
            if (!req.body.itemToSlot.startsWith(`Athena${req.body.category}:`)) {
                throw Errors.MCP.invalidSlotType();
            }
        }
    }

    if (profile.items[itemToSlotID]) {
        if (!profile.items[itemToSlotID].templateId.startsWith(`Athena${req.body.category}:`)) {
            throw Errors.MCP.invalidSlotType();
        }

        // Gérer les variantes
        if (req.body.variantUpdates && Array.isArray(req.body.variantUpdates)) {
            for (const variant of req.body.variantUpdates) {
                if (typeof variant !== 'object' || !variant.channel || !variant.active) continue;

                const variantIndex = profile.items[itemToSlotID].attributes.variants.findIndex(
                    v => v.channel === variant.channel
                );

                if (variantIndex === -1) continue;
                if (!profile.items[itemToSlotID].attributes.variants[variantIndex].owned.includes(variant.active)) continue;

                profile.items[itemToSlotID].attributes.variants[variantIndex].active = variant.active;
            }

            changes.push({
                changeType: "itemAttrChanged",
                itemId: itemToSlotID,
                attributeName: "variants",
                attributeValue: profile.items[itemToSlotID].attributes.variants
            });
        }
    }
    
    switch (req.body.category) {
        case "Dance":
            if (!profile.items[req.body.lockerItem].attributes.locker_slots_data.slots[req.body.category]) break;

            if (req.body.slotIndex >= 0 && req.body.slotIndex <= 5) {
                profile.items[req.body.lockerItem].attributes.locker_slots_data.slots.Dance.items[req.body.slotIndex] = req.body.itemToSlot;
                profile.stats.attributes.favorite_dance[req.body.slotIndex] = itemToSlotID || req.body.itemToSlot;

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: req.body.lockerItem,
                    attributeName: "locker_slots_data",
                    attributeValue: profile.items[req.body.lockerItem].attributes.locker_slots_data
                });
            }
            break;

        case "ItemWrap":
            if (!profile.items[req.body.lockerItem].attributes.locker_slots_data.slots[req.body.category]) break;

            if (req.body.slotIndex >= 0 && req.body.slotIndex <= 7) {
                profile.items[req.body.lockerItem].attributes.locker_slots_data.slots.ItemWrap.items[req.body.slotIndex] = req.body.itemToSlot;
                profile.stats.attributes.favorite_itemwraps[req.body.slotIndex] = itemToSlotID || req.body.itemToSlot;

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: req.body.lockerItem,
                    attributeName: "locker_slots_data",
                    attributeValue: profile.items[req.body.lockerItem].attributes.locker_slots_data
                });
            } else if (req.body.slotIndex === -1) {
                // Appliquer à tous les wraps
                for (let i = 0; i < 7; i++) {
                    profile.items[req.body.lockerItem].attributes.locker_slots_data.slots.ItemWrap.items[i] = req.body.itemToSlot;
                    profile.stats.attributes.favorite_itemwraps[i] = itemToSlotID || req.body.itemToSlot;
                }

                changes.push({
                    changeType: "itemAttrChanged",
                    itemId: req.body.lockerItem,
                    attributeName: "locker_slots_data",
                    attributeValue: profile.items[req.body.lockerItem].attributes.locker_slots_data
                });
            }
            break;

        default:
            if (!profile.items[req.body.lockerItem].attributes.locker_slots_data.slots[req.body.category]) break;

            // Les piochos et planeurs ne peuvent pas être vides
            if ((req.body.category === "Pickaxe" || req.body.category === "Glider") && !req.body.itemToSlot) {
                throw Errors.MCP.requiredItem(req.body.category);
            }

            profile.items[req.body.lockerItem].attributes.locker_slots_data.slots[req.body.category].items = [req.body.itemToSlot];
            profile.stats.attributes[`favorite_${req.body.category.toLowerCase()}`] = itemToSlotID || req.body.itemToSlot;

            changes.push({
                changeType: "itemAttrChanged",
                itemId: req.body.lockerItem,
                attributeName: "locker_slots_data",
                attributeValue: profile.items[req.body.lockerItem].attributes.locker_slots_data
            });
            break;
    }

    return { changes };
}

// Définir la bannière du casier cosmétique
async function handleSetCosmeticLockerBanner(req, profile) {
    const changes = [];
    
    if (!req.body.bannerIconTemplateName || !req.body.bannerColorTemplateName || !req.body.lockerItem) {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.lockerItem !== 'string' || 
        typeof req.body.bannerIconTemplateName !== 'string' || 
        typeof req.body.bannerColorTemplateName !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items) profile.items = {};

    if (!profile.items[req.body.lockerItem]) {
        throw Errors.MCP.itemNotFound();
    }

    if (profile.items[req.body.lockerItem].templateId.toLowerCase() !== "cosmeticlocker:cosmeticlocker_athena") {
        throw Errors.MCP.invalidLockerItem();
    }

    // Vérifier les bannières dans common_core
    const bannerProfile = await require('../../src/services/MCPService').getProfile(req.user.accountId, "common_core");
    
    let homebaseBannerIconID = "";
    let homebaseBannerColorID = "";

    if (!bannerProfile.items) bannerProfile.items = {};

    for (const [itemId, item] of Object.entries(bannerProfile.items)) {
        if (item.templateId.toLowerCase() === `HomebaseBannerIcon:${req.body.bannerIconTemplateName}`.toLowerCase()) {
            homebaseBannerIconID = itemId;
        }
        if (item.templateId.toLowerCase() === `HomebaseBannerColor:${req.body.bannerColorTemplateName}`.toLowerCase()) {
            homebaseBannerColorID = itemId;
        }
        
        if (homebaseBannerIconID && homebaseBannerColorID) break;
    }

    if (!homebaseBannerIconID) {
        throw Errors.MCP.bannerNotFound(`HomebaseBannerIcon:${req.body.bannerIconTemplateName}`);
    }

    if (!homebaseBannerColorID) {
        throw Errors.MCP.bannerNotFound(`HomebaseBannerColor:${req.body.bannerColorTemplateName}`);
    }

    // Mettre à jour la bannière du casier
    profile.items[req.body.lockerItem].attributes.banner_icon_template = req.body.bannerIconTemplateName;
    profile.items[req.body.lockerItem].attributes.banner_color_template = req.body.bannerColorTemplateName;

    profile.stats.attributes.banner_icon = req.body.bannerIconTemplateName;
    profile.stats.attributes.banner_color = req.body.bannerColorTemplateName;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.lockerItem,
        attributeName: "banner_icon_template",
        attributeValue: profile.items[req.body.lockerItem].attributes.banner_icon_template
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.lockerItem,
        attributeName: "banner_color_template",
        attributeValue: profile.items[req.body.lockerItem].attributes.banner_color_template
    });

    return { changes };
}

// Équipement en lot de personnalisations Battle Royale
async function handleBulkEquipBattleRoyaleCustomization(req, profile) {
    const changes = [];
    
    if (!req.body.loadout || !Array.isArray(req.body.loadout)) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items) profile.items = {};
    
    const activeLoadoutId = profile.stats.attributes.loadouts[profile.stats.attributes.active_loadout_index];

    for (const loadoutItem of req.body.loadout) {
        if (typeof loadoutItem !== 'object' || !loadoutItem.slotName || typeof loadoutItem.itemToSlot !== 'string') {
            continue;
        }

        // Vérifier si l'item existe ou est un cosmétique spécial
        if (!profile.items[loadoutItem.itemToSlot] && loadoutItem.itemToSlot) {
            if (!SPECIAL_COSMETICS.includes(loadoutItem.itemToSlot)) {
                continue; // Ignorer les items invalides en mode bulk
            } else {
                if (!loadoutItem.itemToSlot.startsWith(`Athena${loadoutItem.slotName}:`)) {
                    continue;
                }
            }
        }

        // Vérifier le type d'item pour le slot
        if (profile.items[loadoutItem.itemToSlot]) {
            if (!profile.items[loadoutItem.itemToSlot].templateId.startsWith(`Athena${loadoutItem.slotName}:`)) {
                continue;
            }
        }

        const templateId = profile.items[loadoutItem.itemToSlot] ? 
            profile.items[loadoutItem.itemToSlot].templateId : loadoutItem.itemToSlot;

        switch (loadoutItem.slotName) {
            case "Dance":
                if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[loadoutItem.slotName]) break;
                
                if (typeof loadoutItem.indexWithinSlot === 'number' && 
                    loadoutItem.indexWithinSlot >= 0 && loadoutItem.indexWithinSlot <= 5) {
                    
                    profile.stats.attributes.favorite_dance[loadoutItem.indexWithinSlot] = loadoutItem.itemToSlot;
                    profile.items[activeLoadoutId].attributes.locker_slots_data.slots.Dance.items[loadoutItem.indexWithinSlot] = templateId;
                }
                break;

            case "ItemWrap":
                if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[loadoutItem.slotName]) break;
                
                if (typeof loadoutItem.indexWithinSlot === 'number') {
                    if (loadoutItem.indexWithinSlot >= 0 && loadoutItem.indexWithinSlot <= 7) {
                        profile.stats.attributes.favorite_itemwraps[loadoutItem.indexWithinSlot] = loadoutItem.itemToSlot;
                        profile.items[activeLoadoutId].attributes.locker_slots_data.slots.ItemWrap.items[loadoutItem.indexWithinSlot] = templateId;
                    } else if (loadoutItem.indexWithinSlot === -1) {
                        for (let i = 0; i < 7; i++) {
                            profile.stats.attributes.favorite_itemwraps[i] = loadoutItem.itemToSlot;
                            profile.items[activeLoadoutId].attributes.locker_slots_data.slots.ItemWrap.items[i] = templateId;
                        }
                    }
                }
                break;

            default:
                const slotNames = ["Character", "Backpack", "Pickaxe", "Glider", "SkyDiveContrail", "MusicPack", "LoadingScreen"];
                
                if (!slotNames.includes(loadoutItem.slotName)) break;
                if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[loadoutItem.slotName]) break;

                // Les piochos et planeurs ne peuvent pas être vides
                if ((loadoutItem.slotName === "Pickaxe" || loadoutItem.slotName === "Glider") && !loadoutItem.itemToSlot) {
                    continue;
                }

                profile.stats.attributes[`favorite_${loadoutItem.slotName.toLowerCase()}`] = loadoutItem.itemToSlot;
                profile.items[activeLoadoutId].attributes.locker_slots_data.slots[loadoutItem.slotName].items = [templateId];
                break;
        }
    }

    // Ajouter tous les changements nécessaires
    changes.push({
        changeType: "statModified",
        name: "favorite_character",
        value: profile.stats.attributes.favorite_character
    });

    changes.push({
        changeType: "statModified",
        name: "favorite_backpack",
        value: profile.stats.attributes.favorite_backpack
    });

    changes.push({
        changeType: "statModified",
        name: "favorite_pickaxe",
        value: profile.stats.attributes.favorite_pickaxe
    });

    changes.push({
        changeType: "statModified",
        name: "favorite_glider",
        value: profile.stats.attributes.favorite_glider
    });

    changes.push({
        changeType: "statModified",
        name: "favorite_skydivecontrail",
        value: profile.stats.attributes.favorite_skydivecontrail
    });

    changes.push({
        changeType: "statModified",
        name: "favorite_musicpack",
        value: profile.stats.attributes.favorite_musicpack
    });

    changes.push({
        changeType: "statModified",
        name: "favorite_loadingscreen",
        value: profile.stats.attributes.favorite_loadingscreen
    });

    changes.push({
        changeType: "statModified",
        name: "favorite_dance",
        value: profile.stats.attributes.favorite_dance
    });

    changes.push({
        changeType: "statModified",
        name: "favorite_itemwraps",
        value: profile.stats.attributes.favorite_itemwraps
    });

    return { changes };
}

// Mettre un loadout cosmétique modulaire
async function handlePutModularCosmeticLoadout(req, profile) {
    const changes = [];
    
    if (!req.body.loadoutData || typeof req.body.loadoutData !== 'object') {
        throw Errors.MCP.invalidPayload();
    }

    if (!req.body.lockerItem || typeof req.body.lockerItem !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items) profile.items = {};

    if (!profile.items[req.body.lockerItem]) {
        throw Errors.MCP.itemNotFound();
    }

    if (profile.items[req.body.lockerItem].templateId.toLowerCase() !== "cosmeticlocker:cosmeticlocker_athena") {
        throw Errors.MCP.invalidLockerItem();
    }

    // Mettre à jour les données du loadout
    profile.items[req.body.lockerItem].attributes.locker_slots_data = req.body.loadoutData;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.lockerItem,
        attributeName: "locker_slots_data",
        attributeValue: profile.items[req.body.lockerItem].attributes.locker_slots_data
    });

    return { changes };
}

// Définir l'archétype actif
async function handleSetActiveArchetype(req, profile) {
    const changes = [];
    
    if (!req.body.archetypeId || typeof req.body.archetypeId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    // Vérifier que l'archétype existe
    if (!profile.items[req.body.archetypeId]) {
        throw Errors.MCP.itemNotFound();
    }

    // Mettre à jour l'archétype actif
    profile.stats.attributes.active_archetype = req.body.archetypeId;

    changes.push({
        changeType: "statModified",
        name: "active_archetype",
        value: profile.stats.attributes.active_archetype
    });

    return { changes };
}

module.exports = {
    handleEquipBattleRoyaleCustomization,
    handleSetBattleRoyaleBanner,
    handleSetCosmeticLockerSlot,
    handleSetCosmeticLockerBanner,
    handleBulkEquipBattleRoyaleCustomization,
    handlePutModularCosmeticLoadout,
    handleSetActiveArchetype
};