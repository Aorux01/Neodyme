const fs = require('fs');
const path = require('path');
const { Errors } = require('../../src/errors/errors');
const Functions = require('../../src/utils/functions');
const LoggerService = require('../../src/utils/logger');

// Gestion du login des quêtes
async function handleClientQuestLogin(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    const memory = mcpService.getVersionInfo(req);
    const profileId = req.query.profileId;

    mcpService.ensureQuestManager(profile);

    // Nettoyer les anciennes quêtes saisonnières
    const removedQuests = mcpService.cleanupExpiredQuests(profile, memory.season);
    for (const questId of removedQuests) {
        changes.push({
            changeType: "itemRemoved",
            itemId: questId
        });
    }

    // Gérer les quêtes quotidiennes
    if (await mcpService.shouldGrantDailyQuest(profile)) {
        const questCount = countDailyQuests(profile, profileId);
        
        if (questCount < 3) {
            const dailyQuests = loadDailyQuests(profileId);
            const randomQuest = mcpService.getRandomDailyQuest(dailyQuests, profile);
            
            if (randomQuest) {
                const questId = Functions.MakeID();
                profile.items[questId] = mcpService.createQuestItem(randomQuest);
                
                changes.push({
                    changeType: "itemAdded",
                    itemId: questId,
                    item: profile.items[questId]
                });

                profile.stats.attributes.quest_manager.dailyLoginInterval = new Date().toISOString();
                
                changes.push({
                    changeType: "statModified",
                    name: "quest_manager",
                    value: profile.stats.attributes.quest_manager
                });
            }
        }
    }

    // Gérer les quêtes saisonnières
    await handleSeasonalQuests(profile, memory, changes, profileId);

    return { changes, notifications };
}

// Compter les quêtes quotidiennes
function countDailyQuests(profile, profileId) {
    let count = 0;
    const questPrefix = profileId === "athena" ? "quest:athenadaily" : "quest:daily";
    
    for (const item of Object.values(profile.items)) {
        if (item.templateId.toLowerCase().startsWith(questPrefix)) {
            count++;
        }
    }
    return count;
}

// Charger les quêtes quotidiennes
function loadDailyQuests(profileId) {
    try {
        const questPath = profileId === "athena" 
            ? path.join(process.cwd(), "static-content", "athena", "quests.json")
            : path.join(process.cwd(), "static-content", "campaign", "quests.json");
        
        const questData = JSON.parse(fs.readFileSync(questPath, 'utf8'));
        return questData.Daily || [];
    } catch (error) {
        LoggerService.log('warn', `Could not load daily quests: ${error.message}`);
        return [];
    }
}

// Gérer les quêtes saisonnières
async function handleSeasonalQuests(profile, memory, changes, profileId) {
    try {
        const seasonPrefix = memory.season < 10 ? `0${memory.season}` : memory.season;
        const questPath = profileId === "athena" 
            ? path.join(process.cwd(), "static-content", "athena", "quests.json")
            : path.join(process.cwd(), "static-content", "campaign", "quests.json");
        
        if (!fs.existsSync(questPath)) return;
        
        const questData = JSON.parse(fs.readFileSync(questPath, 'utf8'));
        const seasonQuestKey = `Season${seasonPrefix}`;
        
        if (!questData[seasonQuestKey]) return;
        
        const seasonQuests = questData[seasonQuestKey];
        
        // Gestion des bundles de défis pour Athena
        if (profileId === "athena" && seasonQuests.ChallengeBundleSchedules) {
            for (const [scheduleId, schedule] of Object.entries(seasonQuests.ChallengeBundleSchedules)) {
                if (profile.items[scheduleId]) {
                    changes.push({
                        changeType: "itemRemoved",
                        itemId: scheduleId
                    });
                }

                profile.items[scheduleId] = {
                    templateId: schedule.templateId,
                    attributes: {
                        unlock_epoch: new Date().toISOString(),
                        max_level_bonus: 0,
                        level: 1,
                        item_seen: true,
                        xp: 0,
                        favorite: false,
                        granted_bundles: schedule.granted_bundles
                    },
                    quantity: 1
                };

                changes.push({
                    changeType: "itemAdded",
                    itemId: scheduleId,
                    item: profile.items[scheduleId]
                });
            }

            // Gestion des bundles de défis
            if (seasonQuests.ChallengeBundles) {
                for (const [bundleId, bundle] of Object.entries(seasonQuests.ChallengeBundles)) {
                    if (profile.items[bundleId]) {
                        changes.push({
                            changeType: "itemRemoved",
                            itemId: bundleId
                        });
                    }

                    profile.items[bundleId] = {
                        templateId: bundle.templateId,
                        attributes: {
                            has_unlock_by_completion: false,
                            num_quests_completed: 0,
                            level: 0,
                            grantedquestinstanceids: bundle.grantedquestinstanceids,
                            item_seen: true,
                            max_allowed_bundle_level: 0,
                            num_granted_bundle_quests: bundle.grantedquestinstanceids.length,
                            max_level_bonus: 0,
                            challenge_bundle_schedule_id: bundle.challenge_bundle_schedule_id,
                            num_progress_quests_completed: 0,
                            xp: 0,
                            favorite: false
                        },
                        quantity: 1
                    };

                    changes.push({
                        changeType: "itemAdded",
                        itemId: bundleId,
                        item: profile.items[bundleId]
                    });

                    // Ajouter les quêtes du bundle
                    for (const questId of bundle.grantedquestinstanceids) {
                        if (seasonQuests.Quests?.[questId] && !profile.items[questId]) {
                            profile.items[questId] = createSeasonalQuest(seasonQuests.Quests[questId], bundle.challenge_bundle_id);
                            changes.push({
                                changeType: "itemAdded",
                                itemId: questId,
                                item: profile.items[questId]
                            });
                        }
                    }
                }
            }
        }
    } catch (error) {
        LoggerService.log('warn', `Could not handle seasonal quests: ${error.message}`);
    }
}

// Créer une quête saisonnière
function createSeasonalQuest(questData, bundleId) {
    const quest = {
        templateId: questData.templateId,
        attributes: {
            creation_time: new Date().toISOString(),
            level: -1,
            item_seen: true,
            sent_new_notification: true,
            challenge_bundle_id: bundleId || "",
            xp_reward_scalar: 1,
            quest_state: "Active",
            last_state_change_time: new Date().toISOString(),
            max_level_bonus: 0,
            xp: 0,
            favorite: false
        },
        quantity: 1
    };

    // Ajouter les objectifs
    if (questData.objectives) {
        for (const [objName, objValue] of Object.entries(questData.objectives)) {
            quest.attributes[`completion_${objName}`] = 0;
        }
    }

    return quest;
}

// Définir la quête d'assistance de groupe
async function handleSetPartyAssistQuest(req, profile) {
    const changes = [];
    
    if (!profile.stats.attributes.hasOwnProperty("party_assist_quest")) {
        throw Errors.MCP.operationNotFound();
    }

    profile.stats.attributes.party_assist_quest = req.body.questToPinAsPartyAssist || "";

    changes.push({
        changeType: "statModified",
        name: "party_assist_quest",
        value: profile.stats.attributes.party_assist_quest
    });

    return { changes };
}

module.exports = {
    handleClientQuestLogin,
    handleSetPartyAssistQuest,
    handleAthenaPinQuest,
    handleFortRerollDailyQuest,
    handleMarkNewQuestNotificationSent
};

// Épingler une quête Athena
async function handleAthenaPinQuest(req, profile) {
    const changes = [];
    
    if (!profile.stats.attributes.hasOwnProperty("pinned_quest")) {
        throw Errors.MCP.operationNotFound();
    }

    profile.stats.attributes.pinned_quest = req.body.pinnedQuest || "";

    changes.push({
        changeType: "statModified",
        name: "pinned_quest",
        value: profile.stats.attributes.pinned_quest
    });

    return { changes };
}

// Relancer une quête quotidienne
async function handleFortRerollDailyQuest(req, profile) {
    const changes = [];
    const notifications = [];
    
    if (!req.body.questId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.stats.attributes.quest_manager || 
        profile.stats.attributes.quest_manager.dailyQuestRerolls < 1) {
        throw Errors.MCP.operationForbidden();
    }

    // Réduire le nombre de relances disponibles
    profile.stats.attributes.quest_manager.dailyQuestRerolls -= 1;

    // Supprimer l'ancienne quête
    delete profile.items[req.body.questId];
    changes.push({
        changeType: "itemRemoved",
        itemId: req.body.questId
    });

    // Créer une nouvelle quête
    const profileId = req.query.profileId;
    const dailyQuests = loadDailyQuests(profileId);
    const randomQuest = profile.items ? 
        dailyQuests.find(q => !Object.values(profile.items).some(item => 
            item.templateId.toLowerCase() === q.templateId.toLowerCase())) : 
        dailyQuests[Math.floor(Math.random() * dailyQuests.length)];

    if (randomQuest) {
        const newQuestId = Functions.MakeID();
        profile.items[newQuestId] = {
            templateId: randomQuest.templateId,
            attributes: {
                creation_time: new Date().toISOString(),
                level: -1,
                item_seen: false,
                sent_new_notification: false,
                xp_reward_scalar: 1,
                quest_state: "Active",
                last_state_change_time: new Date().toISOString(),
                max_level_bonus: 0,
                xp: 0,
                favorite: false
            },
            quantity: 1
        };

        // Ajouter les objectifs
        if (randomQuest.objectives) {
            for (const objective of randomQuest.objectives) {
                profile.items[newQuestId].attributes[`completion_${objective.toLowerCase()}`] = 0;
            }
        }

        changes.push({
            changeType: "itemAdded",
            itemId: newQuestId,
            item: profile.items[newQuestId]
        });

        notifications.push({
            type: "dailyQuestReroll",
            primary: true,
            newQuestId: randomQuest.templateId
        });
    }

    changes.push({
        changeType: "statModified",
        name: "quest_manager",
        value: profile.stats.attributes.quest_manager
    });

    return { changes, notifications };
}

// Mettre à jour les objectifs client des quêtes STW
async function handleUpdateQuestClientObjectives(req, profile) {
    const changes = [];
    
    if (!req.body.advance || !Array.isArray(req.body.advance)) {
        throw Errors.MCP.invalidPayload();
    }

    for (const advancement of req.body.advance) {
        const { statName, count } = advancement;
        
        if (!statName || typeof count !== 'number') continue;

        const questsToUpdate = [];

        // Trouver toutes les quêtes qui ont cet objectif
        for (const [itemId, item] of Object.entries(profile.items)) {
            if (!item.templateId.toLowerCase().startsWith("quest:")) continue;

            for (const attributeName in item.attributes) {
                if (attributeName.toLowerCase() === `completion_${statName.toLowerCase()}`) {
                    questsToUpdate.push(itemId);
                    break;
                }
            }
        }

        // Mettre à jour les quêtes trouvées
        for (const questId of questsToUpdate) {
            const quest = profile.items[questId];
            const completionAttr = `completion_${statName.toLowerCase()}`;
            
            quest.attributes[completionAttr] = count;

            changes.push({
                changeType: "itemAttrChanged",
                itemId: questId,
                attributeName: completionAttr,
                attributeValue: count
            });

            // Vérifier si la quête est complétée
            if (quest.attributes.quest_state !== "Claimed") {
                let isComplete = true;
                
                for (const attrName in quest.attributes) {
                    if (attrName.toLowerCase().startsWith("completion_")) {
                        if (quest.attributes[attrName] === 0) {
                            isComplete = false;
                            break;
                        }
                    }
                }

                if (isComplete) {
                    quest.attributes.quest_state = "Claimed";
                    quest.attributes.last_state_change_time = new Date().toISOString();

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: questId,
                        attributeName: "quest_state",
                        attributeValue: "Claimed"
                    });

                    changes.push({
                        changeType: "itemAttrChanged",
                        itemId: questId,
                        attributeName: "last_state_change_time",
                        attributeValue: quest.attributes.last_state_change_time
                    });
                }
            }
        }
    }

    return { changes };
}

// Réclamer les récompenses d'une quête STW
async function handleClaimQuestReward(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    let multiUpdate = [];
    
    if (!req.body.questId) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items[req.body.questId]) {
        throw Errors.MCP.questNotFound();
    }

    const quest = profile.items[req.body.questId];
    
    if (quest.attributes.quest_state !== "Claimed") {
        throw Errors.MCP.questNotCompleted();
    }

    // Charger les récompenses de quête
    let questRewards = {};
    try {
        questRewards = require('../../static-content/campaign/rewards.json').quest || {};
    } catch (error) {
        LoggerService.log('warn', 'Could not load quest rewards');
        return { changes, notifications, multiUpdate };
    }

    const questTemplateId = quest.templateId.toLowerCase();
    let rewards = questRewards[questTemplateId];

    if (!rewards) {
        // Marquer comme réclamée même sans récompenses
        quest.attributes.quest_state = "Claimed";
        quest.attributes.last_state_change_time = new Date().toISOString();
        return { changes, notifications, multiUpdate };
    }

    // Gestion des récompenses sélectionnables
    if (req.body.selectedRewardIndex !== -1 && rewards.selectableRewards) {
        rewards = rewards.selectableRewards[req.body.selectedRewardIndex]?.rewards || [];
    } else {
        rewards = rewards.rewards || [];
    }

    const theater0Profile = await mcpService.getProfile('theater0');
    const commonCoreProfile = await mcpService.getProfile('common_core');
    
    const theater0Changes = [];
    const commonCoreChanges = [];
    let theater0Modified = false;
    let commonCoreModified = false;

    const notification = {
        type: "questClaim",
        primary: true,
        questId: questTemplateId,
        loot: {
            items: []
        }
    };

    for (const reward of rewards) {
        const newItemId = Functions.MakeID();
        const templateId = reward.templateId.toLowerCase();

        if (templateId.startsWith("weapon:") || templateId.startsWith("trap:") || templateId.startsWith("ammo:")) {
            // Items pour theater0
            const item = {
                templateId: reward.templateId,
                attributes: {
                    clipSizeScale: 0,
                    loadedAmmo: 999,
                    level: 1,
                    alterationDefinitions: [],
                    baseClipSize: 999,
                    durability: 375,
                    itemSource: "",
                    item_seen: false
                },
                quantity: reward.quantity || 1
            };

            theater0Profile.items[newItemId] = item;
            theater0Changes.push({
                changeType: "itemAdded",
                itemId: newItemId,
                item: item
            });

            notification.loot.items.push({
                itemType: reward.templateId,
                itemGuid: newItemId,
                itemProfile: "theater0",
                quantity: reward.quantity || 1
            });

            theater0Modified = true;
        } else if (templateId.startsWith("homebasebannericon:") || templateId === "token:founderchatunlock") {
            // Items pour common_core
            const item = {
                templateId: reward.templateId,
                attributes: {
                    max_level_bonus: 0,
                    level: 1,
                    item_seen: false,
                    xp: 0,
                    favorite: false
                },
                quantity: reward.quantity || 1
            };

            commonCoreProfile.items[newItemId] = item;
            commonCoreChanges.push({
                changeType: "itemAdded",
                itemId: newItemId,
                item: item
            });

            notification.loot.items.push({
                itemType: reward.templateId,
                itemGuid: newItemId,
                itemProfile: "common_core",
                quantity: reward.quantity || 1
            });

            commonCoreModified = true;
        } else {
            // Items pour le profil courant
            const item = {
                templateId: reward.templateId,
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
                quantity: reward.quantity || 1
            };

            if (templateId.startsWith("quest:")) {
                item.attributes.quest_state = "Active";
                item.attributes.creation_time = new Date().toISOString();
                item.attributes.last_state_change_time = new Date().toISOString();
            }

            profile.items[newItemId] = item;
            changes.push({
                changeType: "itemAdded",
                itemId: newItemId,
                item: item
            });

            notification.loot.items.push({
                itemType: reward.templateId,
                itemGuid: newItemId,
                itemProfile: req.query?.profileId || "campaign",
                quantity: reward.quantity || 1
            });
        }
    }

    // Marquer la quête comme réclamée
    quest.attributes.quest_state = "Claimed";
    quest.attributes.last_state_change_time = new Date().toISOString();

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.questId,
        attributeName: "quest_state",
        attributeValue: "Claimed"
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.questId,
        attributeName: "last_state_change_time",
        attributeValue: quest.attributes.last_state_change_time
    });

    // Préparer les multiUpdate
    if (theater0Modified) {
        theater0Profile.rvn += 1;
        theater0Profile.commandRevision += 1;
        theater0Profile.updated = new Date().toISOString();

        multiUpdate.push({
            profileRevision: theater0Profile.rvn,
            profileId: "theater0",
            profileChangesBaseRevision: theater0Profile.rvn - 1,
            profileChanges: theater0Changes,
            profileCommandRevision: theater0Profile.commandRevision
        });

        await mcpService.saveProfile('theater0', theater0Profile);
    }

    if (commonCoreModified) {
        commonCoreProfile.rvn += 1;
        commonCoreProfile.commandRevision += 1;
        commonCoreProfile.updated = new Date().toISOString();

        multiUpdate.push({
            profileRevision: commonCoreProfile.rvn,
            profileId: "common_core",
            profileChangesBaseRevision: commonCoreProfile.rvn - 1,
            profileChanges: commonCoreChanges,
            profileCommandRevision: commonCoreProfile.commandRevision
        });

        await mcpService.saveProfile('common_core', commonCoreProfile);
    }

    notifications.push(notification);

    return { changes, notifications, multiUpdate };
}

// Définir les quêtes épinglées STW
async function handleSetPinnedQuests(req, profile) {
    const changes = [];
    
    if (!req.body.pinnedQuestIds || !Array.isArray(req.body.pinnedQuestIds)) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.stats.attributes.client_settings) {
        profile.stats.attributes.client_settings = {
            pinnedQuestInstances: []
        };
    }

    profile.stats.attributes.client_settings.pinnedQuestInstances = req.body.pinnedQuestIds;

    changes.push({
        changeType: "statModified",
        name: "client_settings",
        value: profile.stats.attributes.client_settings
    });

    return { changes };
}

// Marquer la notification de nouvelle quête comme envoyée
async function handleMarkNewQuestNotificationSent(req, profile) {
    const changes = [];
    
    if (!req.body.itemIds || !Array.isArray(req.body.itemIds)) {
        throw Errors.MCP.invalidPayload();
    }

    for (const itemId of req.body.itemIds) {
        if (!profile.items[itemId]) continue;

        profile.items[itemId].attributes.sent_new_notification = true;

        changes.push({
            changeType: "itemAttrChanged",
            itemId: itemId,
            attributeName: "sent_new_notification",
            attributeValue: true
        });
    }

    return { changes };
}

module.exports = {
    handleClientQuestLogin,
    handleSetPartyAssistQuest,
    handleAthenaPinQuest,
    handleFortRerollDailyQuest,
    handleUpdateQuestClientObjectives,
    handleClaimQuestReward,
    handleSetPinnedQuests,
    handleMarkNewQuestNotificationSent,
    handleUpdateQuestClientObjectives,
    handleClaimQuestReward,
    handleSetPinnedQuests
};