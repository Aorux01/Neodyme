const { Errors } = require('../../src/errors/errors');
const LoggerService = require('../../src/utils/logger');
const Functions = require('../../src/utils/functions');

// Définir le nom d'affilié
async function handleSetAffiliateName(req, profile) {
    const changes = [];
    
    if (!req.body.affiliateName || typeof req.body.affiliateName !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    // Validation du nom d'affilié
    if (req.body.affiliateName.length > 16) {
        throw Errors.MCP.affiliateNameTooLong();
    }

    profile.stats.attributes.mtx_affiliate = req.body.affiliateName;

    changes.push({
        changeType: "statModified",
        name: "mtx_affiliate",
        value: profile.stats.attributes.mtx_affiliate
    });

    return { changes };
}

// Définir un record
async function handleSetRecord(req, profile) {
    const changes = [];
    
    if (!req.body.recordName || typeof req.body.recordName !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.recordValue !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.stats.attributes.records) {
        profile.stats.attributes.records = {};
    }

    profile.stats.attributes.records[req.body.recordName] = req.body.recordValue;

    changes.push({
        changeType: "statModified",
        name: "records",
        value: profile.stats.attributes.records
    });

    return { changes };
}

// Supprimer une récompense
async function handleDeleteReward(req, profile) {
    const changes = [];
    
    if (!req.body.rewardId || typeof req.body.rewardId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (profile.items && profile.items[req.body.rewardId]) {
        delete profile.items[req.body.rewardId];

        changes.push({
            changeType: "itemRemoved",
            itemId: req.body.rewardId
        });
    }

    return { changes };
}

// Définir la bannière de base
async function handleSetHomebaseBanner(req, profile) {
    const changes = [];
    
    if (!req.body.homebaseBannerIconId || !req.body.homebaseBannerColorId) {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.homebaseBannerIconId !== 'string' || typeof req.body.homebaseBannerColorId !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    profile.stats.attributes.banner_icon = req.body.homebaseBannerIconId;
    profile.stats.attributes.banner_color = req.body.homebaseBannerColorId;

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

// Définir le nom de base
async function handleSetHomebaseName(req, profile) {
    const changes = [];
    
    if (!req.body.homebaseName || typeof req.body.homebaseName !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    // Validation du nom de base
    if (req.body.homebaseName.length > 20) {
        throw Errors.MCP.homebaseNameTooLong();
    }

    profile.stats.attributes.homebase_name = req.body.homebaseName;

    changes.push({
        changeType: "statModified",
        name: "homebase_name",
        value: profile.stats.attributes.homebase_name
    });

    return { changes };
}

// Définir l'auto-réclamation du passe de saison
async function handleSetSeasonPassAutoClaim(req, profile) {
    const changes = [];
    
    if (typeof req.body.bAutoClaim !== 'boolean') {
        throw Errors.MCP.invalidPayload();
    }

    profile.stats.attributes.season_pass_auto_claim = req.body.bAutoClaim;

    changes.push({
        changeType: "statModified",
        name: "season_pass_auto_claim",
        value: profile.stats.attributes.season_pass_auto_claim
    });

    return { changes };
}

// Définir la plateforme MTX
async function handleSetMtxPlatform(req, profile) {
    const changes = [];
    
    if (!req.body.newPlatform || typeof req.body.newPlatform !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    const validPlatforms = ["PC", "PSN", "XBL", "IOS", "Android", "Nintendo", "Luna"];
    
    if (!validPlatforms.includes(req.body.newPlatform)) {
        throw Errors.MCP.invalidPlatform();
    }

    profile.stats.attributes.current_mtx_platform = req.body.newPlatform;

    changes.push({
        changeType: "statModified",
        name: "current_mtx_platform",
        value: profile.stats.attributes.current_mtx_platform
    });

    return { changes };
}

// Incrémenter une statistique de compteur nommé
async function handleIncrementNamedCounterStat(req, profile) {
    const changes = [];
    
    if (!req.body.counterName || typeof req.body.counterName !== 'string') {
        throw Errors.MCP.invalidPayload();
    }

    if (typeof req.body.increment !== 'number') {
        throw Errors.MCP.invalidPayload();
    }

    if (!profile.stats.attributes.named_counters) {
        profile.stats.attributes.named_counters = {};
    }

    const currentValue = profile.stats.attributes.named_counters[req.body.counterName] || 0;
    profile.stats.attributes.named_counters[req.body.counterName] = currentValue + req.body.increment;

    changes.push({
        changeType: "statModified",
        name: "named_counters",
        value: profile.stats.attributes.named_counters
    });

    return { changes };
}

// Définir le modificateur hardcore
async function handleSetHardcoreModifier(req, profile) {
    const changes = [];
    
    if (typeof req.body.enabled !== 'boolean') {
        throw Errors.MCP.invalidPayload();
    }

    profile.stats.attributes.hardcore_modifier = req.body.enabled;

    changes.push({
        changeType: "statModified",
        name: "hardcore_modifier",
        value: profile.stats.attributes.hardcore_modifier
    });

    return { changes };
}

// Rafraîchir les expéditions
async function handleRefreshExpeditions(req, profile) {
    const changes = [];
    
    // Mettre à jour le timestamp des expéditions
    profile.stats.attributes.expeditions_last_refresh = new Date().toISOString();

    changes.push({
        changeType: "statModified",
        name: "expeditions_last_refresh",
        value: profile.stats.attributes.expeditions_last_refresh
    });

    return { changes };
}

// Obtenir l'heure MCP pour la connexion
async function handleGetMcpTimeForLogin(req, profile) {
    const changes = [];
    
    // Mettre à jour l'heure de dernière connexion
    profile.stats.attributes.last_mcp_login = new Date().toISOString();

    changes.push({
        changeType: "statModified",
        name: "last_mcp_login",
        value: profile.stats.attributes.last_mcp_login
    });

    return { changes };
}

module.exports = {
    handleSetAffiliateName,
    handleSetHomebaseBanner,
    handleSetHomebaseName,
    handleSetSeasonPassAutoClaim,
    handleSetMtxPlatform,
    handleIncrementNamedCounterStat,
    handleSetHardcoreModifier,
    handleRefreshExpeditions,
    handleGetMcpTimeForLogin,
    handleSetRecord,
    handleDeleteReward
};