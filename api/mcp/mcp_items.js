const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');

// Marquer des items comme vus
async function handleMarkItemSeen(req, profile) {
    const changes = [];
    
    if (!req.body.itemIds || !Array.isArray(req.body.itemIds)) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items) profile.items = {};

    for (const itemId of req.body.itemIds) {
        if (!profile.items[itemId]) continue;
        
        profile.items[itemId].attributes.item_seen = true;
        
        changes.push({
            changeType: "itemAttrChanged",
            itemId: itemId,
            attributeName: "item_seen",
            attributeValue: true
        });
    }

    return { changes };
}

// Définir le statut favori de plusieurs items
async function handleSetItemFavoriteStatusBatch(req, profile) {
    const changes = [];
    
    if (!req.body.itemIds || !Array.isArray(req.body.itemIds) ||
        !req.body.itemFavStatus || !Array.isArray(req.body.itemFavStatus)) {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items) profile.items = {};

    for (let i = 0; i < req.body.itemIds.length; i++) {
        const itemId = req.body.itemIds[i];
        const favStatus = req.body.itemFavStatus[i];

        if (!profile.items[itemId] || typeof favStatus !== 'boolean') continue;

        profile.items[itemId].attributes.favorite = favStatus;

        changes.push({
            changeType: "itemAttrChanged",
            itemId: itemId,
            attributeName: "favorite",
            attributeValue: favStatus
        });
    }

    return { changes };
}

// Définir le statut favori d'un item
async function handleSetItemFavoriteStatus(req, profile) {
    const changes = [];
    
    if (!req.body.targetItemId || typeof req.body.bFavorite !== 'boolean') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.items || !profile.items[req.body.targetItemId]) {
        throw Errors.MCP.itemNotFound();
    }

    profile.items[req.body.targetItemId].attributes.favorite = req.body.bFavorite;

    changes.push({
        changeType: "itemAttrChanged",
        itemId: req.body.targetItemId,
        attributeName: "favorite",
        attributeValue: req.body.bFavorite
    });

    return { changes };
}

// Définir le statut archivé de plusieurs items
async function handleSetItemArchivedStatusBatch(req, profile) {
    const changes = [];
    
    if (!req.body.itemIds || !Array.isArray(req.body.itemIds)) {
        throw Errors.MCP.invalidPayload();
    }

    const archived = req.body.archived || false;

    if (!profile.items) profile.items = {};

    for (const itemId of req.body.itemIds) {
        if (!profile.items[itemId]) continue;

        profile.items[itemId].attributes.archived = archived;

        changes.push({
            changeType: "itemAttrChanged",
            itemId: itemId,
            attributeName: "archived",
            attributeValue: archived
        });
    }

    return { changes };
}

module.exports = {
    handleMarkItemSeen,
    handleSetItemFavoriteStatusBatch,
    handleSetItemFavoriteStatus,
    handleSetItemArchivedStatusBatch
};