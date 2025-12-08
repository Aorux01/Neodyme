const { Errors, sendError } = require('../service/error/Errors');

async function validateProfileId(req, res, next) {
    if (!req.query.profileId && req.originalUrl.toLowerCase().startsWith("/fortnite/api/game/v2/profile/")) {
        return sendError(res, Errors.MCP.profileNotFound('undefined'));
    }
    next();
}

async function validateAccountOwnership(req, res, next) {
    // TODO: Implement ownership validation logic
    next();
}

async function attachProfileInfo(req, res, next) {
    req.mcpProfile = {
        accountId: req.params.accountId,
        profileId: req.query.profileId || 'athena',
        rvn: req.query.rvn || -1
    };
    next();
}

module.exports = {
    validateProfileId,
    validateAccountOwnership,
    attachProfileInfo
};
