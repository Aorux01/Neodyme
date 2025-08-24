const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Charger les données d'expédition
function loadExpeditionData() {
    try {
        return require('../../static-content/campaign/expeditionData.json');
    } catch (error) {
        LoggerService.log('warn', 'Could not load expedition data, using defaults');
        return {
            slots: {},
            attributes: {},
            criteria: [],
            rewards: [],
            heroLevels: { old: {}, new: {} },
            questsUnlockingSlots: [],
            slotsFromQuests: {}
        };
    }
}

// Démarrer une expédition STW
async function handleStartExpedition(req, profile) {
    const changes = [];
    const expeditionData = loadExpeditionData();
    
    if (!req.body.expeditionId || !req.body.squadId || !req.body.itemIds || !req.body.slotIndices) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.expeditionId]) {
        throw Errors.MCP.expeditionNotFound();
    }

    const expedition = profile.items[req.body.expeditionId];
    
    if (expedition.attributes.expedition_start_time) {
        throw Errors.MCP.expeditionAlreadyStarted();
    }

    const expeditionLevel = expedition.attributes.expedition_max_target_power;
    const heroLevels = expeditionData.heroLevels.new; // Utiliser les nouveaux niveaux par défaut

    // Calculer la puissance des héros
    const sortedHeroes = [];
    for (const heroId of req.body.itemIds) {
        if (!profile.items[heroId]) continue;

        const hero = profile.items[heroId];
        const templateParts = hero.templateId.split("_");
        const rarity = templateParts[templateParts.length - 2]?.toLowerCase() || 'common';
        const tier = templateParts[templateParts.length - 1]?.toLowerCase() || 't01';
        const level = hero.attributes.level || 1;
        const heroClass = templateParts[1]?.toLowerCase() || 'soldier';

        const powerLevel = heroLevels[rarity]?.[tier]?.[level] || level * 10;

        sortedHeroes.push({
            itemGuid: heroId,
            templateId: hero.templateId,
            class: heroClass,
            rarity: rarity,
            tier: tier,
            level: level,
            powerLevel: powerLevel,
            bBoostedByCriteria: false
        });
    }

    // Trier par puissance
    sortedHeroes.sort((a, b) => b.powerLevel - a.powerLevel);

    // Appliquer les bonus de critères
    if (expedition.attributes.expedition_criteria) {
        for (const criterion of expedition.attributes.expedition_criteria) {
            const criteriaReq = expeditionData.criteriaRequirements?.[criterion];
            if (!criteriaReq) continue;

            for (const hero of sortedHeroes) {
                if (hero.bBoostedByCriteria) continue;

                let matches = true;
                if (criteriaReq.requirements.class !== hero.class) matches = false;
                if (criteriaReq.requirements.rarity && 
                    !criteriaReq.requirements.rarity.includes(hero.rarity)) matches = false;

                if (matches) {
                    hero.powerLevel *= criteriaReq.ModValue || 1.5;
                    hero.bBoostedByCriteria = true;
                    break;
                }
            }
        }
    }

    // Calculer le taux de succès
    const totalPowerLevel = sortedHeroes.reduce((sum, hero) => sum + hero.powerLevel, 0);
    const successChance = Math.min(totalPowerLevel / expeditionLevel, 1);

    // Assigner les héros aux squads
    for (let i = 0; i < req.body.itemIds.length; i++) {
        const heroId = req.body.itemIds[i];
        if (!profile.items[heroId]) continue;

        profile.items[heroId].attributes.squad_id = req.body.squadId.toLowerCase();
        profile.items[heroId].attributes.squad_slot_idx = req.body.slotIndices[i];

        changes.push({
            changeType: "itemAttrChanged",
            itemId: heroId,
            attributeName: "squad_id",
            attributeValue: req.body.squadId.toLowerCase()
        });

        changes.push({
            changeType: "itemAttrChanged",
            itemId: heroId,
            attributeName: "squad_slot_idx",
            attributeValue: req.body.slotIndices[i]
        });
    }

    // Mettre à jour l'expédition
    const now = new Date().toISOString();
    const expeditionDuration = expeditionData.attributes[expedition.templateId]?.expedition_duration_minutes || 240;
    const endTime = new Date(Date.now() + expeditionDuration * 60000).toISOString();

    expedition.attributes.expedition_squad_id = req.body.squadId.toLowerCase();
    expedition.attributes.expedition_success_chance = successChance;
    expedition.attributes.expedition_start_time = now;
    expedition.attributes.expedition_end_time = endTime;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.expeditionId,
        attributeName: "expedition_squad_id",
        attributeValue: expedition.attributes.expedition_squad_id
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.expeditionId,
        attributeName: "expedition_success_chance",
        attributeValue: expedition.attributes.expedition_success_chance
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.expeditionId,
        attributeName: "expedition_start_time",
        attributeValue: expedition.attributes.expedition_start_time
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.expeditionId,
        attributeName: "expedition_end_time",
        attributeValue: expedition.attributes.expedition_end_time
    });

    return { changes };
}

// Abandonner une expédition STW
async function handleAbandonExpedition(req, profile) {
    const changes = [];
    const expeditionData = loadExpeditionData();
    
    if (!req.body.expeditionId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.expeditionId]) {
        throw Errors.MCP.expeditionNotFound();
    }

    const expedition = profile.items[req.body.expeditionId];
    
    if (!expedition.attributes.expedition_squad_id) {
        throw Errors.MCP.expeditionNotStarted();
    }

    const squadId = expedition.attributes.expedition_squad_id;

    // Libérer les héros
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.attributes?.squad_id === squadId) {
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

    // Vérifier si l'expédition a expiré et la remplacer si nécessaire
    const now = new Date();
    const expirationTime = new Date(expedition.attributes.expedition_expiration_end_time);
    
    if (now > expirationTime) {
        // Supprimer l'expédition expirée et créer une nouvelle
        const slot = expedition.attributes.expedition_slot_id;
        delete profile.items[req.body.expeditionId];

        changes.push({
            changeType: "itemRemoved",
            itemId: req.body.expeditionId
        });

        // Créer une nouvelle expédition
        const expeditionsToChoose = expeditionData.slots[slot]?.normal || [];
        if (expeditionsToChoose.length > 0) {
            const randomIndex = Math.floor(Math.random() * expeditionsToChoose.length);
            const newExpeditionTemplate = expeditionsToChoose[randomIndex];
            const newExpeditionId = Functions.MakeID();
            
            const newEndTime = new Date(Date.now() + (expeditionData.attributes[newExpeditionTemplate]?.expiration_duration_minutes || 1440) * 60000);

            const newExpedition = {
                templateId: newExpeditionTemplate,
                attributes: {
                    expedition_expiration_end_time: newEndTime.toISOString(),
                    expedition_criteria: [],
                    level: 1,
                    expedition_max_target_power: expeditionData.attributes[newExpeditionTemplate]?.expedition_max_target_power || 100,
                    expedition_min_target_power: expeditionData.attributes[newExpeditionTemplate]?.expedition_min_target_power || 50,
                    expedition_slot_id: slot,
                    expedition_expiration_start_time: now.toISOString()
                },
                quantity: 1
            };

            // Ajouter des critères bonus aléatoires
            for (let i = 0; i < 3; i++) {
                if (Math.random() < 0.2 && expeditionData.criteria.length > 0) {
                    const randomCriterion = expeditionData.criteria[Math.floor(Math.random() * expeditionData.criteria.length)];
                    newExpedition.attributes.expedition_criteria.push(randomCriterion);
                }
            }

            profile.items[newExpeditionId] = newExpedition;

            changes.push({
                changeType: "itemAdded",
                itemId: newExpeditionId,
                item: newExpedition
            });
        }
    } else {
        // Remettre l'expédition disponible
        delete expedition.attributes.expedition_squad_id;
        delete expedition.attributes.expedition_start_time;
        delete expedition.attributes.expedition_end_time;
        delete expedition.attributes.expedition_success_chance;

        changes.push({
            changeType: "itemAttrChanged",
            itemId: req.body.expeditionId,
            attributeName: "expedition_squad_id",
            attributeValue: null
        });

        changes.push({
            changeType: "itemAttrChanged",
            itemId: req.body.expeditionId,
            attributeName: "expedition_start_time",
            attributeValue: null
        });

        changes.push({
            changeType: "itemAttrChanged",
            itemId: req.body.expeditionId,
            attributeName: "expedition_end_time",
            attributeValue: null
        });
    }

    return { changes };
}

// Collecter une expédition terminée STW
async function handleCollectExpedition(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    let multiUpdate = [];
    const expeditionData = loadExpeditionData();
    
    if (!req.body.expeditionId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.expeditionId]) {
        throw Errors.MCP.expeditionNotFound();
    }

    const expedition = profile.items[req.body.expeditionId];
    
    if (!expedition.attributes.expedition_end_time) {
        throw Errors.MCP.expeditionNotFinished();
    }

    const now = new Date();
    const endTime = new Date(expedition.attributes.expedition_end_time);
    
    if (now < endTime) {
        throw Errors.MCP.expeditionStillRunning();
    }

    const squadId = expedition.attributes.expedition_squad_id;
    const successChance = expedition.attributes.expedition_success_chance || 0;
    const succeeded = Math.random() < successChance;

    notifications.push({
        type: "expeditionResult",
        primary: true,
        bExpeditionSucceeded: succeeded,
        expeditionRewards: []
    });

    // Libérer les héros
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.attributes?.squad_id === squadId) {
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

    // Donner des récompenses si réussi
    if (succeeded && expeditionData.rewards && expeditionData.rewards.length > 0) {
        const otherProfiles = [];
        
        for (const rewardCategory of expeditionData.rewards) {
            if (!Array.isArray(rewardCategory) || rewardCategory.length === 0) continue;
            
            const randomReward = rewardCategory[Math.floor(Math.random() * rewardCategory.length)];
            const rewardId = Functions.MakeID();
            const minQ = randomReward.minQuantity || 1;
            const maxQ = randomReward.maxQuantity || 1;
            const quantity = Math.floor(Math.random() * (maxQ - minQ + 1)) + minQ;

            const rewardItem = {
                templateId: randomReward.templateId,
                attributes: {
                    loadedAmmo: 0,
                    inventory_overflow_date: false,
                    level: 0,
                    alterationDefinitions: [],
                    durability: 1,
                    itemSource: ""
                },
                quantity: quantity
            };

            const itemProfile = randomReward.itemProfile || "campaign";

            notifications[0].expeditionRewards.push({
                itemType: randomReward.templateId,
                itemGuid: rewardId,
                itemProfile: itemProfile,
                quantity: quantity
            });

            if (itemProfile === "campaign") {
                profile.items[rewardId] = rewardItem;
                changes.push({
                    changeType: "itemAdded",
                    itemId: rewardId,
                    item: rewardItem
                });
            } else {
                // Gérer les autres profils
                let profileIndex = otherProfiles.findIndex(p => p.profileId === itemProfile);
                
                if (profileIndex === -1) {
                    const otherProfile = await mcpService.getProfile(itemProfile);
                    otherProfiles.push(otherProfile);
                    profileIndex = otherProfiles.length - 1;

                    multiUpdate.push({
                        profileRevision: otherProfile.rvn || 0,
                        profileId: itemProfile,
                        profileChangesBaseRevision: otherProfile.rvn || 0,
                        profileChanges: [],
                        profileCommandRevision: otherProfile.commandRevision || 0
                    });
                }

                otherProfiles[profileIndex].items[rewardId] = rewardItem;
                multiUpdate[profileIndex].profileChanges.push({
                    changeType: "itemAdded",
                    itemId: rewardId,
                    item: rewardItem
                });
            }
        }

        // Sauvegarder les autres profils
        for (let i = 0; i < otherProfiles.length; i++) {
            otherProfiles[i].rvn += 1;
            otherProfiles[i].commandRevision += 1;
            multiUpdate[i].profileRevision = otherProfiles[i].rvn;
            multiUpdate[i].profileCommandRevision = otherProfiles[i].commandRevision;
            
            await mcpService.saveProfile(otherProfiles[i].profileId, otherProfiles[i]);
        }
    }

    // Remplacer par une nouvelle expédition
    const slot = expedition.attributes.expedition_slot_id;
    delete profile.items[req.body.expeditionId];

    changes.push({
        changeType: "itemRemoved",
        itemId: req.body.expeditionId
    });

    // Créer une nouvelle expédition
    const expeditionsToChoose = expeditionData.slots[slot]?.normal || [];
    if (expeditionsToChoose.length > 0) {
        const hasRare = expeditionData.slots[slot]?.rare && Math.random() < 0.05;
        const chosenCategory = hasRare ? expeditionData.slots[slot].rare : expeditionsToChoose;
        
        const randomIndex = Math.floor(Math.random() * chosenCategory.length);
        const newExpeditionTemplate = chosenCategory[randomIndex];
        const newExpeditionId = Functions.MakeID();
        
        const newEndTime = new Date(Date.now() + (expeditionData.attributes[newExpeditionTemplate]?.expiration_duration_minutes || 1440) * 60000);

        const newExpedition = {
            templateId: newExpeditionTemplate,
            attributes: {
                expedition_expiration_end_time: newEndTime.toISOString(),
                expedition_criteria: [],
                level: 1,
                expedition_max_target_power: expeditionData.attributes[newExpeditionTemplate]?.expedition_max_target_power || 100,
                expedition_min_target_power: expeditionData.attributes[newExpeditionTemplate]?.expedition_min_target_power || 50,
                expedition_slot_id: slot,
                expedition_expiration_start_time: now.toISOString()
            },
            quantity: 1
        };

        // Ajouter des critères bonus aléatoires
        for (let i = 0; i < 3; i++) {
            if (Math.random() < 0.2 && expeditionData.criteria.length > 0) {
                const randomCriterion = expeditionData.criteria[Math.floor(Math.random() * expeditionData.criteria.length)];
                newExpedition.attributes.expedition_criteria.push(randomCriterion);
            }
        }

        profile.items[newExpeditionId] = newExpedition;

        changes.push({
            changeType: "itemAdded",
            itemId: newExpeditionId,
            item: newExpedition
        });
    }

    return { changes, notifications, multiUpdate };
}

module.exports = {
    handleStartExpedition,
    handleAbandonExpedition,
    handleCollectExpedition
};