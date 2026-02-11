const { Errors, sendError } = require('../service/error/errors-system');
const { verifyToken } = require('./auth-middleware');

async function validateProfileId(req, res, next) {
    if (!req.query.profileId && req.originalUrl.toLowerCase().startsWith("/fortnite/api/game/v2/profile/")) {
        return sendError(res, Errors.MCP.profileNotFound('undefined'));
    }
    next();
}

async function validateAccountOwnership(req, res, next) {
    await verifyToken(req, res, next);
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
