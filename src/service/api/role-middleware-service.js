const DatabaseManager = require('../../manager/database-manager');
const WebResponse = require('./web-response-service');

const ROLE_LEVELS = {
    PLAYER: 0,
    MODERATOR: 1,
    DEVELOPER: 2,
    ADMIN: 3,
    OWNER: 4,
    SERVER: 5
};

const getUserRoleLevel = (account) => {
    if (typeof account.clientType === 'number') {
        return account.clientType;
    }
    return DatabaseManager.getRoleLevel(account.clientType || account.role || 'player');
};

// Builds a role-gate middleware for /neodyme/api/* routes. Always runs after
// verifyToken (so req.user exists). Re-reads the account to get the live role,
// attaches role info to req, and returns the unified web error shape on failure.
//   `check` decides if the resolved level is allowed; `label` names the requirement.
const roleGate = (check, label) => async (req, res, next) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) {
            return WebResponse.unauthorized(res, 'Session expired. Please sign in again.');
        }

        const roleLevel = getUserRoleLevel(account);
        if (!check(roleLevel)) {
            return WebResponse.forbidden(res, `${label} access required.`);
        }

        req.userRole = DatabaseManager.getRoleName(roleLevel);
        req.userRoleLevel = roleLevel;
        next();
    } catch (error) {
        return WebResponse.serverError(res, `roleGate (${label})`, error);
    }
};

const requireModerator = roleGate(lvl => lvl >= ROLE_LEVELS.MODERATOR, 'Moderator');
const requireAdmin     = roleGate(lvl => lvl >= ROLE_LEVELS.ADMIN, 'Admin');
const requireDeveloper = roleGate(lvl => lvl >= ROLE_LEVELS.DEVELOPER, 'Developer');
const requireOwner     = roleGate(lvl => lvl >= ROLE_LEVELS.OWNER, 'Owner');
const verifyServer     = roleGate(lvl => lvl === ROLE_LEVELS.SERVER, 'Server');

module.exports = {
    ROLE_LEVELS,
    getUserRoleLevel,
    requireModerator,
    requireAdmin,
    requireDeveloper,
    requireOwner,
    verifyServer
};
