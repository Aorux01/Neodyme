const express = require('express');
const router = express.Router();
const ConfigManager = require('../../src/manager/config-manager');
const DatabaseManager = require('../../src/manager/database-manager');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const AuditService = require('../../src/service/api/audit-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const WebService = require('../../src/service/api/web-service');
const { requireDeveloper } = require('../../src/service/api/role-middleware-service');
const os = require('os');
const fs = require('fs');
const path = require('path');

const verifyToken = WebService.verifyToken;

router.get('/api/dev/config', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const config = {
            debug: {
                globalDebug: ConfigManager.get('globalDebug', true),
                debug: ConfigManager.get('debug', false),
                debugRequests: ConfigManager.get('debugRequests', false),
                debugResponses: ConfigManager.get('debugResponses', false),
                debugIps: ConfigManager.get('debugIps', false),
                databaseLogging: ConfigManager.get('databaseLogging', false)
            },
            maintenance: {
                maintenanceMode: ConfigManager.get('maintenanceMode', false),
                maintenanceMessage: ConfigManager.get('maintenanceMessage', ''),
                maintenanceEstimatedDowntime: ConfigManager.get('maintenanceEstimatedDowntime', '')
            },
            rateLimiting: {
                rateLimiting: ConfigManager.get('rateLimiting', true),
                maxRequestsPerMinute: ConfigManager.get('maxRequestsPerMinute', 125),
                rateLimitWindowMinutes: ConfigManager.get('rateLimitWindowMinutes', 1),
                authMaxAttempts: ConfigManager.get('authMaxAttempts', 5),
                authWindowMinutes: ConfigManager.get('authWindowMinutes', 15),
                authSkipSuccessfulRequests: ConfigManager.get('authSkipSuccessfulRequests', false),
                expensiveMaxRequests: ConfigManager.get('expensiveMaxRequests', 10),
                expensiveWindowMinutes: ConfigManager.get('expensiveWindowMinutes', 5)
            },
            features: {
                plugins: ConfigManager.get('plugins', true),
                autoShopRotation: ConfigManager.get('autoShopRotation', true),
                xmppEnable: ConfigManager.get('xmppEnable', true),
                xmppPort: ConfigManager.get('xmppPort', 80),
                xmppDomain: ConfigManager.get('xmppDomain', 'prod.ol.epicgames.com'),
                webInterface: ConfigManager.get('webInterface', true)
            },
            events: {
                bEnableAllEvents: ConfigManager.get('bEnableAllEvents', true),
                bAllSTWEventsActivated: ConfigManager.get('bAllSTWEventsActivated', true),
                bEnableGeodeEvent: ConfigManager.get('bEnableGeodeEvent', false),
                geodeEventStartDate: ConfigManager.get('geodeEventStartDate', '2020-01-01T00:00:00.000Z'),
                bEnableCrackInTheSky: ConfigManager.get('bEnableCrackInTheSky', false),
                bEnableS4OddityPrecursor: ConfigManager.get('bEnableS4OddityPrecursor', false),
                bEnableS4OddityExecution: ConfigManager.get('bEnableS4OddityExecution', false),
                S4OddityEventStartDate: ConfigManager.get('S4OddityEventStartDate', '2020-01-01T00:00:00.000Z'),
                S4OddityEventsInterval: ConfigManager.get('S4OddityEventsInterval', 0),
                bEnableS5OddityPrecursor: ConfigManager.get('bEnableS5OddityPrecursor', false),
                S5OddityPrecursorDate: ConfigManager.get('S5OddityPrecursorDate', '2020-01-01T00:00:00.000Z'),
                bEnableS5OddityExecution: ConfigManager.get('bEnableS5OddityExecution', false),
                S5OddityExecutionDate: ConfigManager.get('S5OddityExecutionDate', '2020-01-01T00:00:00.000Z'),
                bEnableCubeLightning: ConfigManager.get('bEnableCubeLightning', false),
                cubeSpawnDate: ConfigManager.get('cubeSpawnDate', '2020-01-01T00:00:00.000Z'),
                bEnableBlockbusterRiskyEvent: ConfigManager.get('bEnableBlockbusterRiskyEvent', false),
                bEnableCubeLake: ConfigManager.get('bEnableCubeLake', false),
                cubeLakeDate: ConfigManager.get('cubeLakeDate', '2020-01-01T00:00:00.000Z')
            },
            database: {
                databaseBackup: ConfigManager.get('databaseBackup', true),
                databaseBackupInterval: ConfigManager.get('databaseBackupInterval', 60),
                databaseBackupExpiryDays: ConfigManager.get('databaseBackupExpiryDays', 7),
                performInitialBackup: ConfigManager.get('performInitialBackup', false),
                getJsonSpacing: ConfigManager.get('getJsonSpacing', true)
            },
            gameDefaults: {
                bGrantFoundersPacks: ConfigManager.get('bGrantFoundersPacks', false),
                bCompletedSeasonalQuests: ConfigManager.get('bCompletedSeasonalQuests', false)
            },
            tokens: {
                accessTokenExpiryHours: ConfigManager.get('accessTokenExpiryHours', 8),
                refreshTokenExpiryDays: ConfigManager.get('refreshTokenExpiryDays', 30),
                bcryptWorkFactor: ConfigManager.get('bcryptWorkFactor', 12),
                passwordMinLength: ConfigManager.get('passwordMinLength', 8),
                authTimingDelayMin: ConfigManager.get('authTimingDelayMin', 50),
                authTimingDelayMax: ConfigManager.get('authTimingDelayMax', 200),
                tokenEncryptionEnabled: ConfigManager.get('tokenEncryptionEnabled', false)
            },
            creatorCode: {
                creatorCodeCommissionPercent: ConfigManager.get('creatorCodeCommissionPercent', 1)
            },
            gameServer: {
                gameServerHeartbeatInterval: ConfigManager.get('gameServerHeartbeatInterval', 30),
                gameServerTimeout: ConfigManager.get('gameServerTimeout', 120)
            },
            serverSecurity: {
                corsEnable: ConfigManager.get('corsEnable', true),
                compressionEnable: ConfigManager.get('compressionEnable', true),
                helmetEnable: ConfigManager.get('helmetEnable', true),
                trustProxy: ConfigManager.get('trustProxy', true)
            },
            ssl: {
                protocol: ConfigManager.get('protocol', 'http'),
                sslCertPath: ConfigManager.get('sslCertPath', 'config/ssl/cert.pem'),
                sslKeyPath: ConfigManager.get('sslKeyPath', 'config/ssl/key.pem'),
                secureCookies: ConfigManager.get('secureCookies', false)
            }
        };

        res.json({ success: true, config });
    } catch (error) {
        LoggerService.log('error', `Get config error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/dev/config/:key', verifyToken, requireDeveloper, csrfProtection, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        const allowedKeys = [
            'globalDebug', 'debug', 'debugRequests', 'debugResponses', 'debugIps', 'databaseLogging',
            'maintenanceMode', 'maintenanceMessage', 'maintenanceEstimatedDowntime',
            'rateLimiting', 'maxRequestsPerMinute', 'rateLimitWindowMinutes',
            'authMaxAttempts', 'authWindowMinutes', 'authSkipSuccessfulRequests',
            'expensiveMaxRequests', 'expensiveWindowMinutes',
            'plugins', 'autoShopRotation', 'xmppEnable', 'xmppPort', 'xmppDomain', 'webInterface',
            'bEnableAllEvents', 'bAllSTWEventsActivated',
            'bEnableGeodeEvent', 'geodeEventStartDate',
            'bEnableCrackInTheSky',
            'bEnableS4OddityPrecursor', 'bEnableS4OddityExecution', 'S4OddityEventStartDate', 'S4OddityEventsInterval',
            'bEnableS5OddityPrecursor', 'S5OddityPrecursorDate', 'bEnableS5OddityExecution', 'S5OddityExecutionDate',
            'bEnableCubeLightning', 'cubeSpawnDate',
            'bEnableBlockbusterRiskyEvent',
            'bEnableCubeLake', 'cubeLakeDate',
            'databaseBackup', 'databaseBackupInterval', 'databaseBackupExpiryDays', 'performInitialBackup', 'getJsonSpacing',
            'bGrantFoundersPacks', 'bCompletedSeasonalQuests',
            'accessTokenExpiryHours', 'refreshTokenExpiryDays',
            'bcryptWorkFactor', 'passwordMinLength', 'authTimingDelayMin', 'authTimingDelayMax', 'tokenEncryptionEnabled',
            'creatorCodeCommissionPercent',
            'gameServerHeartbeatInterval', 'gameServerTimeout',
            'corsEnable', 'compressionEnable', 'helmetEnable', 'trustProxy',
            'protocol', 'sslCertPath', 'sslKeyPath', 'secureCookies'
        ];

        if (!allowedKeys.includes(key)) {
            return res.status(403).json({ success: false, error: 'This configuration key cannot be modified' });
        }

        const oldValue = ConfigManager.get(key);
        const saved = await ConfigManager.save(key, value);

        await AuditService.logConfigChange(
            req.user.accountId,
            req.user.displayName,
            key,
            oldValue,
            value,
            req.ip
        );

        LoggerService.log('info', `Config ${key} changed from ${oldValue} to ${value} by ${req.user.displayName}`);

        res.json({
            success: true,
            message: `Configuration ${key} updated`,
            saved,
            warning: saved ? null : 'Failed to persist to server.properties'
        });
    } catch (error) {
        LoggerService.log('error', `Update config error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/config/files', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const configDir = path.join(__dirname, '../../config');
        const files = fs.readdirSync(configDir)
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: path.join(configDir, f),
                size: fs.statSync(path.join(configDir, f)).size
            }));

        res.json({ success: true, files });
    } catch (error) {
        LoggerService.log('error', `Get config files error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/config/files/:fileName', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const { fileName } = req.params;

        const allowedFiles = ['experience.json', 'game-servers.json', 'shop.json', 'motd.json'];
        if (!allowedFiles.includes(fileName)) {
            return res.status(403).json({ success: false, error: 'Access to this file is not allowed' });
        }

        const filePath = path.join(__dirname, '../../config', fileName);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json({ success: true, fileName, content });
    } catch (error) {
        LoggerService.log('error', `Get config file error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/dev/config/files/:fileName', verifyToken, requireDeveloper, csrfProtection, async (req, res) => {
    try {
        const { fileName } = req.params;
        const { content } = req.body;

        const allowedFiles = ['experience.json', 'game-servers.json', 'shop.json', 'motd.json'];
        if (!allowedFiles.includes(fileName)) {
            return res.status(403).json({ success: false, error: 'Access to this file is not allowed' });
        }

        if (typeof content !== 'object') {
            return res.status(400).json({ success: false, error: 'Content must be a valid JSON object' });
        }

        const filePath = path.join(__dirname, '../../config', fileName);
        const tempPath = filePath + '.tmp';

        fs.writeFileSync(tempPath, JSON.stringify(content, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);

        await AuditService.logConfigFileChange(
            req.user.accountId,
            req.user.displayName,
            fileName,
            req.ip
        );

        LoggerService.log('info', `Config file ${fileName} updated by ${req.user.displayName}`);

        res.json({ success: true, message: `${fileName} updated successfully` });
    } catch (error) {
        LoggerService.log('error', `Update config file error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/stats/server', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const memUsage = process.memoryUsage();

        res.json({
            success: true,
            stats: {
                version: ConfigManager.get('version', '1.0.0'),
                apiVersion: ConfigManager.get('apiVersion', '1.0'),
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: Math.floor(process.uptime()),
                uptimeFormatted: WebService.formatUptime(process.uptime()),
                memory: {
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                    rss: Math.round(memUsage.rss / 1024 / 1024),
                    external: Math.round(memUsage.external / 1024 / 1024)
                },
                system: {
                    totalMem: Math.round(os.totalmem() / 1024 / 1024),
                    freeMem: Math.round(os.freemem() / 1024 / 1024),
                    cpus: os.cpus().length,
                    loadAvg: os.loadavg()
                }
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get server stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/stats/database', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const dataDir = path.join(__dirname, '../../data');
        const users = await DatabaseManager.getAllAccounts();

        const files = {};
        const dataFiles = ['clients.json', 'tickets.json', 'creator-codes.json', 'audit-log.json'];
        for (const file of dataFiles) {
            const filePath = path.join(dataDir, file);
            if (fs.existsSync(filePath)) {
                files[file] = {
                    size: fs.statSync(filePath).size,
                    sizeFormatted: WebService.formatBytes(fs.statSync(filePath).size)
                };
            }
        }

        res.json({
            success: true,
            stats: {
                type: ConfigManager.get('databaseType', 'json'),
                backupEnabled: ConfigManager.get('databaseBackup', true),
                backupInterval: ConfigManager.get('databaseBackupInterval', 60),
                totalUsers: users.length,
                files
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get database stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/ssl/status', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const protocol = ConfigManager.get('protocol', 'http');
        const certPath = path.resolve(ConfigManager.get('sslCertPath', 'config/ssl/cert.pem'));
        const keyPath = path.resolve(ConfigManager.get('sslKeyPath', 'config/ssl/key.pem'));

        const certExists = fs.existsSync(certPath);
        const keyExists = fs.existsSync(keyPath);

        let certInfo = null;
        if (certExists) {
            const certStat = fs.statSync(certPath);
            certInfo = {
                path: certPath,
                size: certStat.size,
                modified: certStat.mtime.toISOString()
            };
        }

        res.json({
            success: true,
            ssl: {
                protocol,
                httpsActive: protocol === 'https',
                secureCookies: ConfigManager.get('secureCookies', false),
                certificate: {
                    path: certPath,
                    exists: certExists,
                    info: certInfo
                },
                key: {
                    path: keyPath,
                    exists: keyExists
                }
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get SSL status error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/plugins/:pluginName/files', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const { pluginName } = req.params;

        // Security: only alphanumeric + dash/underscore plugin names
        if (!/^[\w-]+$/.test(pluginName)) {
            return res.status(400).json({ success: false, error: 'Invalid plugin name' });
        }

        const pluginDir = path.join(__dirname, '../../plugins', pluginName);
        if (!fs.existsSync(pluginDir)) {
            return res.status(404).json({ success: false, error: 'Plugin directory not found' });
        }

        // Only expose JSON config files
        const files = fs.readdirSync(pluginDir)
            .filter(f => f.endsWith('.json') && !f.startsWith('.'));

        res.json({ success: true, pluginName, files });
    } catch (error) {
        LoggerService.log('error', `Get plugin files error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/plugins/:pluginName/files/:fileName', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const { pluginName, fileName } = req.params;

        if (!/^[\w-]+$/.test(pluginName) || !/^[\w.-]+\.json$/.test(fileName)) {
            return res.status(400).json({ success: false, error: 'Invalid plugin name or file name' });
        }

        const filePath = path.join(__dirname, '../../plugins', pluginName, fileName);

        // Prevent path traversal
        const resolved = path.resolve(filePath);
        const pluginDir = path.resolve(path.join(__dirname, '../../plugins', pluginName));
        if (!resolved.startsWith(pluginDir)) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json({ success: true, pluginName, fileName, content });
    } catch (error) {
        LoggerService.log('error', `Get plugin file error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/dev/plugins/:pluginName/files/:fileName', verifyToken, requireDeveloper, csrfProtection, async (req, res) => {
    try {
        const { pluginName, fileName } = req.params;
        const { content } = req.body;

        if (!/^[\w-]+$/.test(pluginName) || !/^[\w.-]+\.json$/.test(fileName)) {
            return res.status(400).json({ success: false, error: 'Invalid plugin name or file name' });
        }

        if (typeof content !== 'object') {
            return res.status(400).json({ success: false, error: 'Content must be a valid JSON object' });
        }

        const filePath = path.join(__dirname, '../../plugins', pluginName, fileName);
        const resolved = path.resolve(filePath);
        const pluginDir = path.resolve(path.join(__dirname, '../../plugins', pluginName));
        if (!resolved.startsWith(pluginDir)) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const tempPath = filePath + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(content, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);

        LoggerService.log('info', `Plugin config ${pluginName}/${fileName} updated by ${req.user.displayName}`);
        res.json({ success: true, message: `${fileName} saved successfully` });
    } catch (error) {
        LoggerService.log('error', `Save plugin file error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/system/tests', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const XmppManager       = require('../../src/manager/xmpp-manager');
        const MatchmakerManager = require('../../src/manager/matchmaker-manager');
        const ShopManager       = require('../../src/manager/shop-manager');
        const PluginManager     = require('../../src/manager/plugin-manager');
        const RedisManager      = require('../../src/manager/redis-manager');
        const PlayerStatsService = require('../../src/service/api/player-stats-service');

        const runCheck = async (id, name, fn) => {
            const t0 = performance.now();
            try {
                const result = await fn();
                const ms = Math.round(performance.now() - t0);
                return { id, name, status: result.status || 'ok', ms, message: result.message || 'Operational' };
            } catch (err) {
                const ms = Math.round(performance.now() - t0);
                return { id, name, status: 'error', ms, message: err.message };
            }
        };

        const checks = await Promise.all([
            runCheck('http', 'HTTP Server', () => ({ status: 'ok', message: 'Online' })),
            runCheck('database', 'Database', async () => {
                const accounts = await DatabaseManager.getAllAccounts();
                const type = DatabaseManager.getDatabaseType ? DatabaseManager.getDatabaseType() : 'unknown';
                return { status: 'ok', message: `${accounts.length} accounts (${type})` };
            }),
            runCheck('xmpp', 'XMPP Service', () => {
                if (!ConfigManager.get('xmppEnable')) return { status: 'disabled', message: 'Disabled in config' };
                if (XmppManager.startError) return { status: 'error', message: XmppManager.startError };
                if (!XmppManager.wss) return { status: 'error', message: 'Not running' };
                const count = (XmppManager.clients || []).length;
                return { status: 'ok', message: `${count} connected` };
            }),
            runCheck('matchmaking', 'Matchmaking', () => {
                if (!ConfigManager.get('xmppEnable')) return { status: 'disabled', message: 'Disabled in config' };
                if (XmppManager.startError) return { status: 'disabled', message: 'XMPP failed to start' };
                const stats = MatchmakerManager.getStats ? MatchmakerManager.getStats() : { connectedClients: 0 };
                return { status: 'ok', message: `${stats.connectedClients || 0} clients` };
            }),
            runCheck('shop', 'Shop System', () => {
                if (!ConfigManager.get('autoShopRotation')) return { status: 'disabled', message: 'Disabled in config' };
                if (ShopManager.startError) return { status: 'error', message: ShopManager.startError };
                if (!ShopManager.isInitialized) return { status: 'error', message: 'Not initialized' };
                return { status: 'ok', message: 'Initialized' };
            }),
            runCheck('plugins', 'Plugin System', () => {
                const plugins = PluginManager.getPlugins ? PluginManager.getPlugins() : [];
                return { status: 'ok', message: `${plugins.length} loaded` };
            }),
            runCheck('redis', 'Redis Cache', () => {
                if (!RedisManager.enabled) return { status: 'disabled', message: 'Not enabled' };
                if (!RedisManager.connected) return { status: 'error', message: 'Disconnected' };
                return { status: 'ok', message: 'Connected' };
            }),
            runCheck('auth', 'Auth Service', () => ({ status: 'ok', message: 'Token valid' })),
        ]);

        const passing  = checks.filter(c => c.status === 'ok').length;
        const disabled = checks.filter(c => c.status === 'disabled').length;
        const failing  = checks.filter(c => c.status === 'error').length;
        const total    = checks.length;

        // Record system check result for history
        PlayerStatsService.record(0, 0, 0, { passing, total: total - disabled }).catch(() => {});

        res.json({ success: true, checks, summary: { total, passing, disabled, failing } });
    } catch (error) {
        LoggerService.log('error', `System tests error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/system/history', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const PlayerStatsService = require('../../src/service/api/player-stats-service');
        const hours = Math.min(72, parseInt(req.query.hours) || 24);
        const history = await PlayerStatsService.getSystemHistory(hours);
        res.json({ success: true, history });
    } catch (error) {
        LoggerService.log('error', `System history error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
