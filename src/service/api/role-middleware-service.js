const DatabaseManager = require('../../manager/database-manager');
const { Errors, sendError } = require('../error/errors-system');

const ROLE_LEVELS = {
    PLAYER: 0,
    MODERATOR: 1,
    DEVELOPER: 2,
    ADMIN: 3,
    OWNER: 4
};

const getUserRoleLevel = (account) => {
    if (typeof account.clientType === 'number') {
        return account.clientType;
    }
    return DatabaseManager.getRoleLevel(account.clientType || account.role || 'player');
};

const requireModerator = async (req, res, next) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) {
            return sendError(res, Errors.Authentication.invalidToken());
        }

        const roleLevel = getUserRoleLevel(account);
        if (roleLevel < ROLE_LEVELS.MODERATOR) {
            return res.status(403).json({ success: false, error: 'Moderator access required' });
        }

        req.userRole = DatabaseManager.getRoleName(roleLevel);
        req.userRoleLevel = roleLevel;
        next();
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
};

const requireAdmin = async (req, res, next) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) {
            return sendError(res, Errors.Authentication.invalidToken());
        }

        const roleLevel = getUserRoleLevel(account);
        if (roleLevel < ROLE_LEVELS.ADMIN) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        req.userRole = DatabaseManager.getRoleName(roleLevel);
        req.userRoleLevel = roleLevel;
        next();
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
};

const requireDeveloper = async (req, res, next) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) {
            return sendError(res, Errors.Authentication.invalidToken());
        }

        const roleLevel = getUserRoleLevel(account);
        if (roleLevel < ROLE_LEVELS.DEVELOPER) {
            return res.status(403).json({ success: false, error: 'Developer access required' });
        }

        req.userRole = DatabaseManager.getRoleName(roleLevel);
        req.userRoleLevel = roleLevel;
        next();
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
};

const requireOwner = async (req, res, next) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) {
            return sendError(res, Errors.Authentication.invalidToken());
        }

        const roleLevel = getUserRoleLevel(account);
        if (roleLevel < ROLE_LEVELS.OWNER) {
            return res.status(403).json({ success: false, error: 'Owner access required' });
        }

        req.userRole = DatabaseManager.getRoleName(roleLevel);
        req.userRoleLevel = roleLevel;
        next();
    } catch (error) {
        sendError(res, Errors.Internal.serverError());
    }
};

module.exports = {
    ROLE_LEVELS,
    getUserRoleLevel,
    requireModerator,
    requireAdmin,
    requireDeveloper,
    requireOwner
};
