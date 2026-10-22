const { Errors, sendError } = require('../service/error/errors-system');
const { verifyToken } = require('./auth-middleware');
const KeyedLock = require('../utils/keyed-lock');

async function validateProfileId(req, res, next) {
    if (!req.query.profileId && req.originalUrl.toLowerCase().startsWith("/fortnite/api/game/v2/profile/")) {
        return sendError(res, Errors.MCP.profileNotFound('undefined'));
    }
    next();
}

// Commands on one account run one at a time, otherwise two concurrent
// read-modify-write cycles on the same profile overwrite each other.
async function validateAccountOwnership(req, res, next) {
    await verifyToken(req, res, async () => {
        const release = await KeyedLock.acquire(`mcp:${req.user.accountId}`);
        res.once('finish', release);
        res.once('close', release);
        next();
    });
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
