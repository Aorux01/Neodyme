const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const ConfigManager = require('../../src/manager/config-manager');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const TicketService = require('../../src/service/api/ticket-service');
const AuditService = require('../../src/service/api/audit-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const WebService = require('../../src/service/api/web-service');
const { ROLE_LEVELS, requireAdmin, requireDeveloper, requireModerator } = require('../../src/service/api/role-middleware-service');
const os = require('os');
const fs = require('fs');
const path = require('path');

const verifyToken = WebService.verifyToken;


router.put('/api/admin/creator-codes/commission', verifyToken, requireAdmin, csrfProtection, async (req, res) => {
    try {
        const { percent } = req.body;

        if (typeof percent !== 'number' || percent < 0 || percent > 100) {
            return res.status(400).json({ success: false, error: 'Percent must be a number between 0 and 100' });
        }

        const saved = await ConfigManager.save('creatorCodeCommissionPercent', percent);

        if (saved) {
            LoggerService.log('info', `Creator code commission updated to ${percent}% by ${req.user.displayName}`);
            res.json({
                success: true,
                message: `Commission updated to ${percent}%`
            });
        } else {
            res.json({
                success: true,
                message: `Commission updated to ${percent}% (in memory only)`,
                warning: 'Failed to save to server.properties'
            });
        }
    } catch (error) {
        LoggerService.log('error', `Update commission error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        res.json({
            success: true,
            users: users.map(u => {
                const roleLevel = typeof u.clientType === 'number' ? u.clientType : 0;
                return {
                    accountId: u.accountId,
                    displayName: u.displayName,
                    email: u.email,
                    role: DatabaseManager.getRoleName(roleLevel),
                    roleLevel: roleLevel,
                    created: u.created,
                    lastLogin: u.lastLogin,
                    banned: u.banned || false
                };
            })
        });
    } catch (error) {
        LoggerService.log('error', `Get all users error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/admin/users/:accountId/role', verifyToken, requireAdmin, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;
        const role = typeof req.body.role === 'string' ? req.body.role.trim() : String(req.body.role ?? '');

        const validRoles = ['player', 'mod', 'moderator', 'dev', 'developer', 'admin', 'owner', 'server'];
        if (!validRoles.includes(role.toLowerCase())) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        const targetAccount = await DatabaseManager.getAccount(accountId);
        const oldRole = targetAccount ? DatabaseManager.getRoleName(typeof targetAccount.clientType === 'number' ? targetAccount.clientType : 0) : 'unknown';
        const targetName = targetAccount ? targetAccount.displayName : accountId;

        await DatabaseManager.updateAccountRole(accountId, role.toLowerCase());

        await AuditService.logRoleChange(
            req.user.accountId,
            req.user.displayName,
            accountId,
            targetName,
            oldRole,
            role.toLowerCase(),
            req.ip
        );

        LoggerService.log('info', `User ${accountId} role updated to ${role} by ${req.user.displayName}`);
        res.json({ success: true, message: `Role updated to ${role}` });
    } catch (error) {
        LoggerService.log('error', `Update user role error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/admin/users/:accountId/ban', verifyToken, requireAdmin, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { banned, reason } = req.body;

        const targetAccount = await DatabaseManager.getAccount(accountId);
        const targetName = targetAccount ? targetAccount.displayName : accountId;

        await DatabaseManager.setBanStatus(accountId, banned, reason);

        if (banned) {
            await AuditService.logBan(req.user.accountId, req.user.displayName, accountId, targetName, reason || 'No reason', null, req.ip);
        } else {
            await AuditService.logUnban(req.user.accountId, req.user.displayName, accountId, targetName, req.ip);
        }

        LoggerService.log('info', `User ${accountId} ${banned ? 'banned' : 'unbanned'} by ${req.user.displayName}${reason ? ': ' + reason : ''}`);
        res.json({ success: true, message: `User ${banned ? 'banned' : 'unbanned'}` });
    } catch (error) {
        LoggerService.log('error', `Ban user error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/stats', verifyToken, requireAdmin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        const creatorStats = await CreatorCodeService.getStats();

        res.json({
            success: true,
            stats: {
                totalUsers: users.length,
                bannedUsers: users.filter(u => u.banned).length,
                admins: users.filter(u => u.clientType === ROLE_LEVELS.ADMIN || u.clientType === ROLE_LEVELS.OWNER).length,
                moderators: users.filter(u => u.clientType === ROLE_LEVELS.MODERATOR).length,
                developers: users.filter(u => u.clientType === ROLE_LEVELS.DEVELOPER).length,
                creatorCodes: creatorStats
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get admin stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/audit-log', verifyToken, requireAdmin, async (req, res) => {
    try {
        const { action, performedBy, targetType, search, page, limit } = req.query;

        const filters = {
            action,
            performedBy,
            targetType,
            search,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50
        };

        const result = await AuditService.getLogs(filters);
        res.json({ success: true, ...result });
    } catch (error) {
        LoggerService.log('error', `Get audit log error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/audit-log/summary', verifyToken, requireAdmin, async (req, res) => {
    try {
        const { hours } = req.query;
        const summary = await AuditService.getRecentSummary(parseInt(hours) || 24);
        res.json({ success: true, summary });
    } catch (error) {
        LoggerService.log('error', `Get audit summary error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

const RANGE_HOURS = { '1h': 1, '24h': 24, '1w': 168, '1m': 720, '1y': 8760, 'all': 0 };

router.get('/api/admin/stats/players', verifyToken, requireAdmin, async (req, res) => {
    try {
        const PlayerStatsService = require('../../src/service/api/player-stats-service');
        const range = req.query.range || '24h';
        const hours = RANGE_HOURS[range] ?? 24;
        const points = await PlayerStatsService.getPlayerRange(hours);
        res.json({ success: true, points, range });
    } catch (error) {
        LoggerService.log('error', `Get player stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/stats/detailed', verifyToken, requireAdmin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        const creatorStats = await CreatorCodeService.getStats();
        const ticketStats = await TicketService.getStats();

        const now = new Date();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const activeLastDay = users.filter(u => u.lastLogin && new Date(u.lastLogin) >= oneDayAgo).length;
        const activeLastWeek = users.filter(u => u.lastLogin && new Date(u.lastLogin) >= oneWeekAgo).length;
        const activeLastMonth = users.filter(u => u.lastLogin && new Date(u.lastLogin) >= oneMonthAgo).length;

        const registeredLastDay = users.filter(u => u.created && new Date(u.created) >= oneDayAgo).length;
        const registeredLastWeek = users.filter(u => u.created && new Date(u.created) >= oneWeekAgo).length;
        const registeredLastMonth = users.filter(u => u.created && new Date(u.created) >= oneMonthAgo).length;

        res.json({
            success: true,
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
                activity: {
                    activeLastDay,
                    activeLastWeek,
                    activeLastMonth
                },
                registrations: {
                    lastDay: registeredLastDay,
                    lastWeek: registeredLastWeek,
                    lastMonth: registeredLastMonth
                },
                creatorCodes: creatorStats,
                tickets: ticketStats
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get detailed stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/console-logs', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const lines  = parseInt(req.query.lines) || 200;
        const logsDir = path.join(__dirname, '../../logs');

        if (!fs.existsSync(logsDir)) {
            return res.json({ success: true, logs: [], message: 'No logs directory found' });
        }

        const now  = new Date();
        const yyyy = now.getFullYear();
        const mm   = String(now.getMonth() + 1).padStart(2, '0');
        const dd   = String(now.getDate()).padStart(2, '0');
        const todayFile = path.join(logsDir, `${yyyy}-${mm}-${dd}.log`);

        if (!fs.existsSync(todayFile)) {
            return res.json({ success: true, logs: [], message: 'No log file for today' });
        }

        const content  = fs.readFileSync(todayFile, 'utf8');
        const allLines = content.split('\n').filter(l => l.trim());
        const last     = allLines.slice(-lines);

        res.json({ success: true, logs: last, total: allLines.length });
    } catch (error) {
        LoggerService.log('error', `Failed to fetch console logs: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/api/admin/live-stats', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const cpuCount = os.cpus().length || 1;

        // Sample CPU usage over 100ms - works on Windows unlike os.loadavg()
        const cpuSample1  = os.cpus().map(c => ({ ...c.times }));
        const procStart   = process.cpuUsage();

        await new Promise(r => setTimeout(r, 100));

        const cpuSample2  = os.cpus().map(c => ({ ...c.times }));
        const procEnd     = process.cpuUsage(procStart);

        // System-wide CPU %
        let sysBusy = 0, sysTotal = 0;
        for (let i = 0; i < cpuSample1.length; i++) {
            const s = cpuSample1[i], e = cpuSample2[i];
            const total = Object.keys(s).reduce((acc, k) => acc + (e[k] - s[k]), 0);
            const idle  = (e.idle - s.idle);
            sysBusy  += total - idle;
            sysTotal += total;
        }
        const sysCpuPct  = sysTotal > 0 ? Math.min(100, Math.round((sysBusy / sysTotal) * 100)) : 0;

        // Process CPU % (Node.js only)
        const elapsedUs   = 100 * 1000 * cpuCount; // 100ms × µs × cores
        const procCpuPct  = Math.min(100, Math.round((procEnd.user + procEnd.system) / elapsedUs * 100));

        const mem      = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem  = os.freemem();
        const usedMem  = totalMem - freeMem;

        let activePlayers = 0;
        try {
            const accounts = await DatabaseManager.getAllAccounts();
            const fiveMinAgo = Date.now() - 5 * 60 * 1000;
            activePlayers = accounts.filter(a => a.lastLogin && new Date(a.lastLogin).getTime() > fiveMinAgo).length;
        } catch (_) {}

        const uptimeSeconds = Math.floor(process.uptime());

        res.json({
            success: true,
            cpu: {
                percent: sysCpuPct,
                process: procCpuPct,
                cores: cpuCount
            },
            ram: {
                total: totalMem,
                used: usedMem,
                free: freeMem,
                percent: Math.round((usedMem / totalMem) * 100),
                heapUsed: mem.heapUsed,
                heapTotal: mem.heapTotal
            },
            players: {
                active: activePlayers
            },
            uptime: uptimeSeconds,
            timestamp: Date.now()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/api/admin/server-properties', verifyToken, requireAdmin, async (req, res) => {
    try {
        const propFile = path.join(__dirname, '../../server.properties');
        if (!fs.existsSync(propFile)) {
            return res.status(404).json({ success: false, error: 'server.properties not found' });
        }
        const content = fs.readFileSync(propFile, 'utf8');
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/api/admin/server-properties', verifyToken, requireAdmin, csrfProtection, async (req, res) => {
    try {
        const { content } = req.body;
        if (typeof content !== 'string') {
            return res.status(400).json({ success: false, error: 'Content must be a string' });
        }
        const propFile = path.join(__dirname, '../../server.properties');
        fs.writeFileSync(propFile, content, 'utf8');
        LoggerService.log('info', `server.properties updated via admin panel by account ${req.account?.accountId}`);
        res.json({ success: true, message: 'server.properties saved. Restart or use /reload to apply.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/api/admin/plugins', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const PluginManager = require('../../src/manager/plugin-manager');
        const loaded = PluginManager.getPlugins();
        const pluginsDir = path.join(__dirname, '../../plugins');
        const installedDirs = fs.existsSync(pluginsDir)
            ? fs.readdirSync(pluginsDir).filter(d => fs.statSync(path.join(pluginsDir, d)).isDirectory())
            : [];

        res.json({
            success: true,
            loaded: loaded.map(p => ({ name: p.name, version: p.version, description: p.description })),
            installed: installedDirs,
            enabled: ConfigManager.get('plugins', false)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/admin/plugins/:pluginName/load', verifyToken, requireDeveloper, csrfProtection, async (req, res) => {
    try {
        const PluginManager = require('../../src/manager/plugin-manager');
        const { pluginName } = req.params;
        const ok = await PluginManager.loadPlugin(pluginName);
        if (ok) {
            res.json({ success: true, message: `Plugin '${pluginName}' loaded.` });
        } else {
            res.status(400).json({ success: false, error: `Failed to load plugin '${pluginName}'.` });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/admin/plugins/:pluginName/unload', verifyToken, requireDeveloper, csrfProtection, async (req, res) => {
    try {
        const PluginManager = require('../../src/manager/plugin-manager');
        const { pluginName } = req.params;
        const plugins = PluginManager.getPlugins();
        const idx = plugins.findIndex(p => p.name.toLowerCase() === pluginName.toLowerCase());
        if (idx === -1) {
            return res.status(404).json({ success: false, error: `Plugin '${pluginName}' not loaded.` });
        }
        const plugin = plugins[idx];
        if (plugin.shutdown) await plugin.shutdown();
        plugins.splice(idx, 1);
        res.json({ success: true, message: `Plugin '${pluginName}' unloaded.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/admin/plugins/:pluginName/reload', verifyToken, requireDeveloper, csrfProtection, async (req, res) => {
    try {
        const PluginManager = require('../../src/manager/plugin-manager');
        const { pluginName } = req.params;
        const ok = await PluginManager.reloadPlugin(pluginName);
        if (ok) {
            res.json({ success: true, message: `Plugin '${pluginName}' reloaded.` });
        } else {
            res.status(400).json({ success: false, error: `Failed to reload plugin '${pluginName}'.` });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/admin/command', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { command } = req.body;
        if (!command || typeof command !== 'string' || !command.trim()) {
            return res.status(400).json({ success: false, error: 'command is required' });
        }

        const userRoleLevel = req.userRoleLevel ?? 0;
        const minRole = WebService.getCommandMinRole(command);

        if (userRoleLevel < minRole) {
            return res.status(403).json({
                success: false,
                error: `Insufficient permissions (requires level ${minRole}, you have ${userRoleLevel})`
            });
        }

        LoggerService.log('info', `Panel command '${command.trim()}' by ${req.user?.displayName || req.user?.accountId} (role ${userRoleLevel})`);

        const result = await WebService.executeCommandCapture(command.trim());
        return res.json(result);
    } catch (error) {
        LoggerService.log('error', `Admin command failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
