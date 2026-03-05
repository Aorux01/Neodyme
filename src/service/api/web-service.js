const LoggerService = require('../logger/logger-service');
const DatabaseManager = require('../../manager/database-manager');
const TokenService = require('../token/web-token-service');
const ConfigManager = require('../../manager/config-manager');
const { Errors } = require('../error/errors-system');
const { sendError } = require('../error/errors-system');
const { ROLE_LEVELS } = require('./role-middleware-service');

const CMD_PERMISSIONS = [
    ['account info',   1],
    ['admin info',     1],
    ['unlock',         1],
    ['ban',            1],
    ['account vbucks', 2],
    ['backup create',  2],
    ['backup list',    2],
    ['backup cleanup', 2],
    ['reload',         2],
    ['shop',           2],
    ['tokens',         2],
    ['plugins',        2],
    ['test',           2],
    ['diagnostic',     2],
    ['data migrate',   2],
    ['account role',   3],
    ['account delete', 3],
    ['backup restore', 3],
    ['admin',          3],
    ['maintenance',    3],
    ['broadcast',      3],
];

const CMD_PERMS_SORTED = CMD_PERMISSIONS.slice().sort((a, b) => b[0].length - a[0].length);

class WebService {
    getCookieOptions = () => ({
        httpOnly: true,
        secure: ConfigManager.get('secureCookies', false),
        sameSite: 'strict',
        path: '/'
    });

    setAuthCookies = (res, token, remember = false) => {
        const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
        res.cookie('neodyme_auth', token, { ...this.getCookieOptions(), maxAge });
    };

    clearAuthCookies = (res) => {
        res.clearCookie('neodyme_auth', this.getCookieOptions());
    };
    
    verifyToken = async (req, res, next) => {
        try {
            let token = null;
    
            const authHeader = req.headers.authorization;
            if (authHeader) {
                token = TokenService.extractTokenFromHeader(authHeader);
            }
    
            if (!token && req.cookies?.neodyme_auth) {
                token = req.cookies.neodyme_auth;
            }
    
            if (!token) {
                return sendError(res, Errors.Authentication.invalidHeader());
            }
    
            const verification = await TokenService.verifyToken(token);
    
            if (!verification.valid) {
                this.clearAuthCookies(res);
                return sendError(res, Errors.Authentication.invalidToken(verification.error));
            }
    
            const accountId = verification.payload.accountId || verification.payload.account_id;
    
            if (!accountId) {
                return sendError(res, Errors.Authentication.invalidToken('missing account id'));
            }
    
            const account = await DatabaseManager.getAccount(accountId);
            if (!account) {
                this.clearAuthCookies(res);
                return sendError(res, Errors.Authentication.invalidToken('account not found'));
            }
    
            req.user = {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email
            };
            next();
        } catch {
            return sendError(res, Errors.Authentication.invalidToken());
        }
    }

    getCommandMinRole(cmdStr) {
        const lower = cmdStr.trim().toLowerCase();
        if (lower.includes('--switch')) return ROLE_LEVELS.ADMIN;
        const match = CMD_PERMS_SORTED.find(
            ([prefix]) => lower === prefix || lower.startsWith(prefix + ' ')
        );
        return match ? match[1] : Infinity;
    }
    
    async executeCommandCapture(cmdStr) {
        const parts   = cmdStr.trim().split(/\s+/);
        const cmdName = parts[0].replace(/^\//, '').toLowerCase();
        const args    = parts.slice(1);
    
        if (cmdName === 'maintenance') {
            const mode = (args[0] || '').toLowerCase();
            if (mode === 'on')  { ConfigManager.set('maintenanceMode', true);  return { success: true,  message: 'Maintenance mode enabled.'  }; }
            if (mode === 'off') { ConfigManager.set('maintenanceMode', false); return { success: true,  message: 'Maintenance mode disabled.' }; }
            return { success: false, message: 'Usage: maintenance on | off' };
        }
    
        const CommandManager = require('../../manager/command-manager');
        const handler = CommandManager.commands.get('/' + cmdName);
        if (!handler) return { success: false, message: `Unknown command: '${cmdName}'` };
    
        const captured = [];
        const origLog  = LoggerService.log;
        LoggerService.log = function(level, message, data) {
            origLog.call(LoggerService, level, message, data);
            captured.push({ level, message: String(message) });
        };
    
        let hasError = false;
        try {
            await handler(args);
        } catch (err) {
            captured.push({ level: 'error', message: err.message });
            hasError = true;
        } finally {
            LoggerService.log = origLog;
        }
    
        const last    = captured[captured.length - 1];
        const success = !hasError && (!last || last.level !== 'error');
        const message = captured.map(m => `[${m.level.toUpperCase()}] ${m.message}`).join('\n') || 'Done.';
        return { success, message };
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
    
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = new WebService();