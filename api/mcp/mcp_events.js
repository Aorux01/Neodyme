const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Déverrouiller un nœud de récompense
async function handleUnlockRewardNode(req, profile, mcpService) {
    const changes = [];
    const notifications = [];
    let multiUpdate = [];
    
    if (!req.body.nodeId || typeof req.body.nodeId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    // Vérifier si le nœud existe dans le profil
    if (!profile.items[req.body.nodeId]) {
        throw Errors.MCP.itemNotFound();
    }

    const rewardNode = profile.items[req.body.nodeId];
    
    // Vérifier que c'est bien un nœud de récompense
    if (!rewardNode.templateId.includes('RewardNode') && !rewardNode.templateId.includes('Battlepass')) {
        throw Errors.MCP.invalidRewardNode();
    }

    // Vérifier que le nœud n'est pas déjà déverrouillé
    if (rewardNode.attributes.item_seen === true || rewardNode.attributes.unlocked === true) {
        throw Errors.MCP.alreadyUnlocked();
    }

    // Vérifier les prérequis (niveaux, XP, etc.)
    const requiredLevel = rewardNode.attributes.required_level || 0;
    const currentLevel = profile.stats.attributes.level || 1;
    
    if (currentLevel < requiredLevel) {
        throw Errors.MCP.insufficientLevel(requiredLevel, currentLevel);
    }

    // Traitement spécial pour les Battle Pass
    if (rewardNode.templateId.includes('Battlepass')) {
        await processBattlePassReward(req, profile, mcpService, rewardNode, changes, notifications, multiUpdate);
    } else {
        // Traitement standard des nœuds de récompense
        await processStandardReward(req, profile, rewardNode, changes, notifications);
    }

    return { changes, notifications, multiUpdate };
}

// Traitement des récompenses Battle Pass
async function processBattlePassReward(req, profile, mcpService, rewardNode, changes, notifications, multiUpdate) {
    // Marquer le nœud comme déverrouillé
    rewardNode.attributes.unlocked = true;
    rewardNode.attributes.item_seen = true;
    rewardNode.attributes.unlocked_time = new Date().toISOString();

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.nodeId,
        attributeName: "unlocked",
        attributeValue: true
    });

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.nodeId,
        attributeName: "item_seen",
        attributeValue: true
    });

    // Traiter les récompenses du nœud
    if (rewardNode.attributes.rewards && Array.isArray(rewardNode.attributes.rewards)) {
        const athenaProfile = await mcpService.getProfile('athena');
        const athenaChanges = [];

        for (const reward of rewardNode.attributes.rewards) {
            if (reward.type === 'item') {
                const itemId = Functions.MakeID();
                const item = {
                    templateId: reward.templateId,
                    attributes: {
                        item_seen: false,
                        variants: reward.variants || []
                    },
                    quantity: reward.quantity || 1
                };

                athenaProfile.items[itemId] = item;

                athenaChanges.push({
                    changeType: "itemAdded",
                    itemId: itemId,
                    item: athenaProfile.items[itemId]
                });

                // Ajouter à la notification
                notifications.push({
                    type: "battlePassReward",
                    primary: true,
                    itemId: itemId,
                    templateId: reward.templateId,
                    quantity: reward.quantity || 1
                });
            } else if (reward.type === 'currency') {
                // Traitement des monnaies
                await processCurrencyReward(profile, reward, changes);
            }
        }

        // Mise à jour du profil Athena si nécessaire
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
    }

    // Mettre à jour la progression du Battle Pass
    if (!profile.stats.attributes.book_purchased) {
        profile.stats.attributes.book_purchased = false;
    }

    profile.stats.attributes.book_level = Math.max(
        profile.stats.attributes.book_level || 1,
        rewardNode.attributes.required_level || 1
    );

    changes.push({
        changeType: "statModified",
        name: "book_level",
        value: profile.stats.attributes.book_level
    });
}

// Traitement des récompenses standard
async function processStandardReward(req, profile, rewardNode, changes, notifications) {
    // Marquer comme déverrouillé
    rewardNode.attributes.unlocked = true;
    rewardNode.attributes.item_seen = true;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.nodeId,
        attributeName: "unlocked",
        attributeValue: true
    });

    // Traiter les récompenses
    if (rewardNode.attributes.rewards) {
        for (const reward of rewardNode.attributes.rewards) {
            if (reward.type === 'currency') {
                await processCurrencyReward(profile, reward, changes);
            } else if (reward.type === 'experience') {
                await processExperienceReward(profile, reward, changes);
            }
        }
    }

    notifications.push({
        type: "rewardNodeUnlocked",
        primary: true,
        nodeId: req.body.nodeId
    });
}

// Traitement des récompenses de monnaie
async function processCurrencyReward(profile, reward, changes) {
    const currencyType = reward.currencyType || 'mtxcurrency';
    const amount = reward.amount || 0;

    if (amount <= 0) return;

    // Chercher la monnaie existante
    let currencyFound = false;
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId.toLowerCase() === `currency:${currencyType}`.toLowerCase()) {
            item.quantity += amount;
            
            changes.push({
                changeType: "itemQuantityChanged",
                itemId: itemId,
                quantity: item.quantity
            });

            currencyFound = true;
            break;
        }
    }

    // Si la monnaie n'existe pas, la créer
    if (!currencyFound) {
        const currencyId = Functions.MakeID();
        profile.items[currencyId] = {
            templateId: `Currency:${currencyType}`,
            attributes: {
                platform: "shared"
            },
            quantity: amount
        };

        changes.push({
            changeType: "itemAdded",
            itemId: currencyId,
            item: profile.items[currencyId]
        });
    }
}

// Traitement des récompenses d'expérience
async function processExperienceReward(profile, reward, changes) {
    const xpAmount = reward.amount || 0;
    
    if (xpAmount <= 0) return;

    const currentXp = profile.stats.attributes.xp || 0;
    const newXp = currentXp + xpAmount;
    
    profile.stats.attributes.xp = newXp;

    // Calculer le nouveau niveau
    const newLevel = calculateLevel(newXp);
    const oldLevel = profile.stats.attributes.level || 1;
    
    if (newLevel > oldLevel) {
        profile.stats.attributes.level = newLevel;
        
        changes.push({
            changeType: "statModified",
            name: "level",
            value: profile.stats.attributes.level
        });
    }

    changes.push({
        changeType: "statModified",
        name: "xp",
        value: profile.stats.attributes.xp
    });
}

// Calculer le niveau basé sur l'XP
function calculateLevel(xp) {
    // Formule basique - ajustez selon vos besoins
    return Math.floor(xp / 80000) + 1;
}

module.exports = {
    handleUnlockRewardNode
};