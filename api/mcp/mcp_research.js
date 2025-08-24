const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Reset des niveaux de recherche STW
async function handleRespecResearch(req, profile) {
    const changes = [];
    
    if (!profile.stats.attributes.research_levels) {
        profile.stats.attributes.research_levels = {
            technology: 0,
            fortitude: 0,
            offense: 0,
            resistance: 0
        };
    } else {
        profile.stats.attributes.research_levels.technology = 0;
        profile.stats.attributes.research_levels.fortitude = 0;
        profile.stats.attributes.research_levels.offense = 0;
        profile.stats.attributes.research_levels.resistance = 0;
    }

    changes.push({
        changeType: "statModified",
        name: "research_levels",
        value: profile.stats.attributes.research_levels
    });

    return { changes };
}

// Reset des upgrades STW
async function handleRespecUpgrades(req, profile) {
    const changes = [];
    
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId.toLowerCase().startsWith("homebasenode:skilltree_")) {
            item.quantity = 0;

            changes.push({
                changeType: "itemQuantityChanged",
                itemId: itemId,
                quantity: item.quantity
            });
        }
    }

    return { changes };
}

// Acheter un upgrade de statistique de recherche STW
async function handlePurchaseResearchStatUpgrade(req, profile) {
    const changes = [];
    
    if (!req.body.statId || typeof req.body.statId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    const validStats = ['technology', 'fortitude', 'offense', 'resistance'];
    if (!validStats.includes(req.body.statId.toLowerCase())) {
        throw Errors.MCP.invalidStatId();
    }

    if (!profile.stats.attributes.research_levels) {
        profile.stats.attributes.research_levels = {
            technology: 0,
            fortitude: 0,
            offense: 0,
            resistance: 0
        };
    }

    const statId = req.body.statId.toLowerCase();
    const currentLevel = profile.stats.attributes.research_levels[statId] || 0;
    const maxLevel = 120; // Limite typique pour la recherche

    if (currentLevel >= maxLevel) {
        throw Errors.MCP.maxResearchLevelReached();
    }

    profile.stats.attributes.research_levels[statId] = currentLevel + 1;

    changes.push({
        changeType: "statModified",
        name: "research_levels",
        value: profile.stats.attributes.research_levels
    });

    return { changes };
}

// Acheter ou upgrader un nœud de homebase STW
async function handlePurchaseOrUpgradeHomebaseNode(req, profile) {
    const changes = [];
    
    if (!req.body.nodeId || typeof req.body.nodeId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    let nodeExists = false;
    let existingItemId = null;

    // Chercher si le nœud existe déjà
    for (const [itemId, item] of Object.entries(profile.items)) {
        if (item.templateId.toLowerCase() === req.body.nodeId.toLowerCase()) {
            existingItemId = itemId;
            nodeExists = true;
            break;
        }
    }

    if (nodeExists && existingItemId) {
        // Upgrader le nœud existant
        profile.items[existingItemId].quantity += 1;

        changes.push({
            changeType: "itemQuantityChanged",
            itemId: existingItemId,
            quantity: profile.items[existingItemId].quantity
        });
    } else {
        // Créer un nouveau nœud
        const newNodeId = Functions.MakeID();
        const newNode = {
            templateId: req.body.nodeId,
            attributes: {
                item_seen: false
            },
            quantity: 1
        };

        profile.items[newNodeId] = newNode;

        changes.push({
            changeType: "itemAdded",
            itemId: newNodeId,
            item: newNode
        });
    }

    return { changes };
}

module.exports = {
    handleRespecResearch,
    handleRespecUpgrades,
    handlePurchaseResearchStatUpgrade,
    handlePurchaseOrUpgradeHomebaseNode
};