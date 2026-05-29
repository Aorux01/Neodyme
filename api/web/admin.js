const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../../src/manager/database-manager');
const ConfigManager = require('../../src/manager/config-manager');
const LoggerService = require('../../src/service/logger/logger-service');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const TicketService = require('../../src/service/api/ticket-service');
const AuditService = require('../../src/service/api/audit-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { ROLE_LEVELS, requireAdmin, requireDeveloper, requireModerator } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;

// Middleware chains by required staff level (read vs. state-changing).
const admin = [verifyToken, requireAdmin];
const adminWrite = [verifyToken, requireAdmin, csrfProtection];
const dev = [verifyToken, requireDeveloper];
const devWrite = [verifyToken, requireDeveloper, csrfProtection];

const roleLevelOf = (account) => (typeof account.clientType === 'number' ? account.clientType : 0);

// ---- Users & roles (admin) ----

router.get('/neodyme/api/admin/users', ...admin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        return WebResponse.ok(res, {
            users: users.map(u => {
                const roleLevel = roleLevelOf(u);
                return {
                    accountId: u.accountId,
                    displayName: u.displayName,
                    email: u.email,
                    role: DatabaseManager.getRoleName(roleLevel),
                    roleLevel,
                    created: u.created,
                    lastLogin: u.lastLogin,
                    banned: u.banned || false
                };
            })
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get all users', error);
    }
});

router.put('/neodyme/api/admin/users/:accountId/role', ...adminWrite, async (req, res) => {
    try {
        const { accountId } = req.params;
        const role = (typeof req.body.role === 'string' ? req.body.role : String(req.body.role ?? '')).trim().toLowerCase();

        const validRoles = ['player', 'mod', 'moderator', 'dev', 'developer', 'admin', 'owner', 'server'];
        if (!validRoles.includes(role)) {
            return WebResponse.badRequest(res, 'Invalid role.');
        }

        const target = await DatabaseManager.getAccount(accountId);
        const oldRole = target ? DatabaseManager.getRoleName(roleLevelOf(target)) : 'unknown';
        const targetName = target ? target.displayName : accountId;

        await DatabaseManager.updateAccountRole(accountId, role);
        await AuditService.logRoleChange(req.user.accountId, req.user.displayName, accountId, targetName, oldRole, role, req.ip);
        LoggerService.log('info', `User ${accountId} role updated to ${role} by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `Role updated to ${role}.` });
    } catch (error) {
        return WebResponse.serverError(res, 'update user role', error);
    }
});

router.put('/neodyme/api/admin/users/:accountId/ban', ...adminWrite, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { banned, reason } = req.body;

        const target = await DatabaseManager.getAccount(accountId);
        const targetName = target ? target.displayName : accountId;

        await DatabaseManager.setBanStatus(accountId, banned, reason);
        if (banned) {
            await AuditService.logBan(req.user.accountId, req.user.displayName, accountId, targetName, reason || 'No reason', null, req.ip);
        } else {
            await AuditService.logUnban(req.user.accountId, req.user.displayName, accountId, targetName, req.ip);
        }
        LoggerService.log('info', `User ${accountId} ${banned ? 'banned' : 'unbanned'} by ${req.user.displayName}${reason ? ': ' + reason : ''}`);

        return WebResponse.ok(res, { message: `User ${banned ? 'banned' : 'unbanned'}.` });
    } catch (error) {
        return WebResponse.serverError(res, 'ban user', error);
    }
});

router.put('/neodyme/api/admin/creator-codes/commission', ...adminWrite, async (req, res) => {
    try {
        const { percent } = req.body;
        if (typeof percent !== 'number' || percent < 0 || percent > 100) {
            return WebResponse.badRequest(res, 'Percent must be a number between 0 and 100.');
        }

        const saved = await ConfigManager.save('creatorCodeCommissionPercent', percent);
        if (saved) {
            LoggerService.log('info', `Creator code commission updated to ${percent}% by ${req.user.displayName}`);
        }
        return WebResponse.ok(res, {
            message: `Commission updated to ${percent}%.`,
            warning: saved ? null : 'Failed to save to server.properties.'
        });
    } catch (error) {
        return WebResponse.serverError(res, 'update commission', error);
    }
});

// ---- Stats & audit (admin) ----

router.get('/neodyme/api/admin/stats', ...admin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        const creatorCodes = await CreatorCodeService.getStats();

        return WebResponse.ok(res, {
            stats: {
                totalUsers: users.length,
                bannedUsers: users.filter(u => u.banned).length,
                admins: users.filter(u => u.clientType === ROLE_LEVELS.ADMIN || u.clientType === ROLE_LEVELS.OWNER).length,
                moderators: users.filter(u => u.clientType === ROLE_LEVELS.MODERATOR).length,
                developers: users.filter(u => u.clientType === ROLE_LEVELS.DEVELOPER).length,
                creatorCodes
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get admin stats', error);
    }
});

router.get('/neodyme/api/admin/stats/players', ...admin, async (req, res) => {
    try {
        const PlayerStatsService = require('../../src/service/api/player-stats-service');
        const RANGE_HOURS = { '1h': 1, '24h': 24, '1w': 168, '1m': 720, '1y': 8760, 'all': 0 };
        const range = req.query.range || '24h';
        const points = await PlayerStatsService.getPlayerRange(RANGE_HOURS[range] ?? 24);
        return WebResponse.ok(res, { points, range });
    } catch (error) {
        return WebResponse.serverError(res, 'get player stats', error);
    }
});

router.get('/neodyme/api/admin/stats/detailed', ...admin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        const creatorCodes = await CreatorCodeService.getStats();
        const tickets = await TicketService.getStats();

        const now = Date.now();
        const since = (days) => new Date(now - days * 24 * 60 * 60 * 1000);
        const day = since(1), week = since(7), month = since(30);
        const activeSince = (d) => users.filter(u => u.lastLogin && new Date(u.lastLogin) >= d).length;
        const registeredSince = (d) => users.filter(u => u.created && new Date(u.created) >= d).length;

        return WebResponse.ok(res, {
            stats: {
                users: {
                    total: users.length,
                    banned: users.filter(u => u.banned).length,
                    byRole: {
                        players: users.filter(u => (u.clientType || 0) === 0).length,
                        moderators: users.filter(u => u.clientType === ROLE_LEVELS.MODERATOR).length,
                        developers: users.filter(u => u.clientType === ROLE_LEVELS.DEVELOPER).length,
                        admins: users.filter(u => u.clientType === ROLE_LEVELS.ADMIN).length,
                        owners: users.filter(u => u.clientType === ROLE_LEVELS.OWNER).length
                    }
                },
                activity: { activeLastDay: activeSince(day), activeLastWeek: activeSince(week), activeLastMonth: activeSince(month) },
                registrations: { lastDay: registeredSince(day), lastWeek: registeredSince(week), lastMonth: registeredSince(month) },
                creatorCodes,
                tickets
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get detailed stats', error);
    }
});

router.get('/neodyme/api/admin/audit-log/summary', ...admin, async (req, res) => {
    try {
        const summary = await AuditService.getRecentSummary(parseInt(req.query.hours, 10) || 24);
        return WebResponse.ok(res, { summary });
    } catch (error) {
        return WebResponse.serverError(res, 'get audit summary', error);
    }
});

router.get('/neodyme/api/admin/audit-log', ...admin, async (req, res) => {
    try {
        const { action, performedBy, targetType, search, page, limit } = req.query;
        const result = await AuditService.getLogs({
            action, performedBy, targetType, search,
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 50
        });
        return WebResponse.ok(res, result);
    } catch (error) {
        return WebResponse.serverError(res, 'get audit log', error);
    }
});

router.get('/neodyme/api/admin/server-properties', ...admin, async (req, res) => {
    try {
        const propFile = path.join(__dirname, '../../server.properties');
        if (!fs.existsSync(propFile)) {
            return WebResponse.notFound(res, 'server.properties not found.');
        }
        return WebResponse.ok(res, { content: fs.readFileSync(propFile, 'utf8') });
    } catch (error) {
        return WebResponse.serverError(res, 'read server.properties', error);
    }
});

router.put('/neodyme/api/admin/server-properties', ...adminWrite, async (req, res) => {
    try {
        const { content } = req.body;
        if (typeof content !== 'string') {
            return WebResponse.badRequest(res, 'Content must be a string.');
        }
        fs.writeFileSync(path.join(__dirname, '../../server.properties'), content, 'utf8');
        LoggerService.log('info', `server.properties updated via admin panel by ${req.user.displayName}`);
        return WebResponse.ok(res, { message: 'server.properties saved. Restart or use /reload to apply.' });
    } catch (error) {
        return WebResponse.serverError(res, 'write server.properties', error);
    }
});

router.post('/neodyme/api/admin/shop/rotate-date', ...adminWrite, async (req, res) => {
    try {
        const { date, categoryKey } = req.body;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return WebResponse.badRequest(res, 'date must be in YYYY-MM-DD format.');
        }

        const ShopManager = require('../../src/manager/shop-manager');
        await ShopManager.rotateToDate(date, categoryKey || null);
        const scope = categoryKey ? `category "${categoryKey}"` : 'all categories';
        LoggerService.log('info', `[Admin] Date rotation to ${date} (${scope}) triggered by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `Shop rotated to cosmetics from ${date}.` });
    } catch (error) {
        return WebResponse.serverError(res, 'admin date rotation', error);
    }
});

// ---- Developer panel (logs, live metrics, plugins, xmpp) ----

router.get('/neodyme/api/admin/console-logs', ...dev, async (req, res) => {
    try {
        const lines = parseInt(req.query.lines, 10) || 200;
        const logsDir = path.join(__dirname, '../../logs');
        if (!fs.existsSync(logsDir)) {
            return WebResponse.ok(res, { logs: [], message: 'No logs directory found.' });
        }

        const now = new Date();
        const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.log`;
        const todayFile = path.join(logsDir, fileName);
        if (!fs.existsSync(todayFile)) {
            return WebResponse.ok(res, { logs: [], message: 'No log file for today.' });
        }

        const allLines = fs.readFileSync(todayFile, 'utf8').split('\n').filter(l => l.trim());
        return WebResponse.ok(res, { logs: allLines.slice(-lines), total: allLines.length });
    } catch (error) {
        return WebResponse.serverError(res, 'fetch console logs', error);
    }
});

router.get('/neodyme/api/admin/live-stats', ...dev, async (req, res) => {
    try {
        const cpuCount = os.cpus().length || 1;

        // Sample CPU over 100ms (works on Windows, unlike os.loadavg()).
        const cpuSample1 = os.cpus().map(c => ({ ...c.times }));
        const procStart = process.cpuUsage();
        await new Promise(r => setTimeout(r, 100));
        const cpuSample2 = os.cpus().map(c => ({ ...c.times }));
        const procEnd = process.cpuUsage(procStart);

        let sysBusy = 0, sysTotal = 0;
        for (let i = 0; i < cpuSample1.length; i++) {
            const s = cpuSample1[i], e = cpuSample2[i];
            const total = Object.keys(s).reduce((acc, k) => acc + (e[k] - s[k]), 0);
            sysBusy += total - (e.idle - s.idle);
            sysTotal += total;
        }
        const sysCpuPct = sysTotal > 0 ? Math.min(100, Math.round((sysBusy / sysTotal) * 100)) : 0;
        const elapsedUs = 100 * 1000 * cpuCount;
        const procCpuPct = Math.min(100, Math.round((procEnd.user + procEnd.system) / elapsedUs * 100));

        const mem = process.memoryUsage();
        const totalMem = os.totalmem();
        const usedMem = totalMem - os.freemem();

        let activePlayers = 0;
        try {
            const accounts = await DatabaseManager.getAllAccounts();
            const fiveMinAgo = Date.now() - 5 * 60 * 1000;
            activePlayers = accounts.filter(a => a.lastLogin && new Date(a.lastLogin).getTime() > fiveMinAgo).length;
        } catch (_) {}

        return WebResponse.ok(res, {
            cpu: { percent: sysCpuPct, process: procCpuPct, cores: cpuCount },
            ram: {
                total: totalMem, used: usedMem, free: os.freemem(),
                percent: Math.round((usedMem / totalMem) * 100),
                heapUsed: mem.heapUsed, heapTotal: mem.heapTotal
            },
            players: { active: activePlayers },
            uptime: Math.floor(process.uptime()),
            timestamp: Date.now()
        });
    } catch (error) {
        return WebResponse.serverError(res, 'live stats', error);
    }
});

router.get('/neodyme/api/admin/plugins', ...dev, async (req, res) => {
    try {
        const PluginManager = require('../../src/manager/plugin-manager');
        const loaded = PluginManager.getPlugins();
        const pluginsDir = path.join(__dirname, '../../plugins');
        const installed = fs.existsSync(pluginsDir)
            ? fs.readdirSync(pluginsDir).filter(d => fs.statSync(path.join(pluginsDir, d)).isDirectory())
            : [];

        return WebResponse.ok(res, {
            loaded: loaded.map(p => ({ name: p.name, version: p.version, description: p.description })),
            installed,
            enabled: ConfigManager.get('plugins', false)
        });
    } catch (error) {
        return WebResponse.serverError(res, 'list plugins', error);
    }
});

router.post('/neodyme/api/admin/plugins/:pluginName/load', ...devWrite, async (req, res) => {
    try {
        const PluginManager = require('../../src/manager/plugin-manager');
        const { pluginName } = req.params;
        const ok = await PluginManager.loadPlugin(pluginName);
        if (!ok) {
            return WebResponse.badRequest(res, `Failed to load plugin '${pluginName}'.`);
        }
        return WebResponse.ok(res, { message: `Plugin '${pluginName}' loaded.` });
    } catch (error) {
        return WebResponse.serverError(res, 'load plugin', error);
    }
});

router.post('/neodyme/api/admin/plugins/:pluginName/unload', ...devWrite, async (req, res) => {
    try {
        const PluginManager = require('../../src/manager/plugin-manager');
        const { pluginName } = req.params;
        const plugins = PluginManager.getPlugins();
        const idx = plugins.findIndex(p => p.name.toLowerCase() === pluginName.toLowerCase());
        if (idx === -1) {
            return WebResponse.notFound(res, `Plugin '${pluginName}' not loaded.`);
        }
        if (plugins[idx].shutdown) await plugins[idx].shutdown();
        plugins.splice(idx, 1);
        return WebResponse.ok(res, { message: `Plugin '${pluginName}' unloaded.` });
    } catch (error) {
        return WebResponse.serverError(res, 'unload plugin', error);
    }
});

router.post('/neodyme/api/admin/plugins/:pluginName/reload', ...devWrite, async (req, res) => {
    try {
        const PluginManager = require('../../src/manager/plugin-manager');
        const { pluginName } = req.params;
        const ok = await PluginManager.reloadPlugin(pluginName);
        if (!ok) {
            return WebResponse.badRequest(res, `Failed to reload plugin '${pluginName}'.`);
        }
        return WebResponse.ok(res, { message: `Plugin '${pluginName}' reloaded.` });
    } catch (error) {
        return WebResponse.serverError(res, 'reload plugin', error);
    }
});

router.get('/neodyme/api/admin/xmpp-clients', ...dev, async (req, res) => {
    try {
        const XMPPManager = require('../../src/manager/xmpp-manager');
        const clients = XMPPManager.clients.map(c => ({
            accountId: c.accountId,
            displayName: c.displayName,
            jid: c.jid,
            away: c.lastPresenceUpdate.away,
            joinedMUCs: c.joinedMUCs || []
        }));
        const mucs = Object.entries(XMPPManager.mucs).map(([name, muc]) => ({ name, members: muc.members.length }));
        return WebResponse.ok(res, { count: clients.length, clients, mucs });
    } catch (error) {
        return WebResponse.serverError(res, 'list xmpp clients', error);
    }
});

// ---- Console command (moderator+, gated per-command by required level) ----

router.post('/neodyme/api/admin/command', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { command } = req.body;
        if (!command || typeof command !== 'string' || !command.trim()) {
            return WebResponse.badRequest(res, 'command is required.');
        }

        const userRoleLevel = req.userRoleLevel ?? 0;
        const minRole = WebService.getCommandMinRole(command);
        if (userRoleLevel < minRole) {
            return WebResponse.forbidden(res, `Insufficient permissions (requires level ${minRole}, you have ${userRoleLevel}).`);
        }

        LoggerService.log('info', `Panel command '${command.trim()}' by ${req.user.displayName} (role ${userRoleLevel})`);
        const result = await WebService.executeCommandCapture(command.trim());
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'admin command', error);
    }
});

module.exports = router;
