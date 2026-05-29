const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const ConfigManager = require('../../src/manager/config-manager');
const DatabaseManager = require('../../src/manager/database-manager');
const LoggerService = require('../../src/service/logger/logger-service');
const AuditService = require('../../src/service/api/audit-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { requireDeveloper } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;
const dev = [verifyToken, requireDeveloper];
const devWrite = [verifyToken, requireDeveloper, csrfProtection];

const CONFIG_DIR = path.join(__dirname, '../../config');
const PLUGINS_DIR = path.join(__dirname, '../../plugins');
const CLOUDSTORAGE_SYSTEM_DIR = path.join(__dirname, '../../data/cloudstorage/system');

const EDITABLE_CONFIG_FILES = ['experience.json', 'game-servers.json', 'shop.json', 'motd.json', 'playlists.json'];
const EDITABLE_INI_FILES = ['DefaultGame.ini', 'DefaultRuntimeOptions.ini'];

const EDITABLE_CONFIG_KEYS = new Set([
    'globalDebug', 'debug', 'debugRequests', 'debugResponses', 'debugIps', 'databaseLogging',
    'maintenanceMode', 'maintenanceMessage', 'maintenanceEstimatedDowntime',
    'rateLimiting', 'maxRequestsPerMinute', 'rateLimitWindowMinutes',
    'authMaxAttempts', 'authWindowMinutes', 'authSkipSuccessfulRequests',
    'expensiveMaxRequests', 'expensiveWindowMinutes', 'webMaxRequests', 'webWindowMinutes',
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
]);

// Atomic write: write to a temp file then rename so a crash can't leave a half-written file.
const writeFileAtomic = (filePath, data) => {
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, data, 'utf8');
    fs.renameSync(tempPath, filePath);
};

// ---- Live config (server.properties keys) ----

router.get('/neodyme/api/dev/config', ...dev, async (req, res) => {
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
                expensiveWindowMinutes: ConfigManager.get('expensiveWindowMinutes', 5),
                webMaxRequests: ConfigManager.get('webMaxRequests', 600),
                webWindowMinutes: ConfigManager.get('webWindowMinutes', 1)
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
        return WebResponse.ok(res, { config });
    } catch (error) {
        return WebResponse.serverError(res, 'get config', error);
    }
});

router.put('/neodyme/api/dev/config/:key', ...devWrite, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (!EDITABLE_CONFIG_KEYS.has(key)) {
            return WebResponse.forbidden(res, 'This configuration key cannot be modified.');
        }

        const oldValue = ConfigManager.get(key);
        const saved = await ConfigManager.save(key, value);

        await AuditService.logConfigChange(req.user.accountId, req.user.displayName, key, oldValue, value, req.ip);
        LoggerService.log('info', `Config ${key} changed from ${oldValue} to ${value} by ${req.user.displayName}`);

        return WebResponse.ok(res, {
            message: `Configuration ${key} updated.`,
            saved,
            warning: saved ? null : 'Failed to persist to server.properties.'
        });
    } catch (error) {
        return WebResponse.serverError(res, 'update config', error);
    }
});

// ---- Editable JSON config files ----

router.get('/neodyme/api/dev/config/files', ...dev, async (req, res) => {
    try {
        const files = fs.readdirSync(CONFIG_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: path.join(CONFIG_DIR, f),
                size: fs.statSync(path.join(CONFIG_DIR, f)).size
            }));
        return WebResponse.ok(res, { files });
    } catch (error) {
        return WebResponse.serverError(res, 'get config files', error);
    }
});

router.get('/neodyme/api/dev/config/files/:fileName', ...dev, async (req, res) => {
    try {
        const { fileName } = req.params;
        if (!EDITABLE_CONFIG_FILES.includes(fileName)) {
            return WebResponse.forbidden(res, 'Access to this file is not allowed.');
        }

        const filePath = path.join(CONFIG_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            return WebResponse.notFound(res, 'File not found.');
        }
        return WebResponse.ok(res, { fileName, content: JSON.parse(fs.readFileSync(filePath, 'utf8')) });
    } catch (error) {
        return WebResponse.serverError(res, 'get config file', error);
    }
});

router.put('/neodyme/api/dev/config/files/:fileName', ...devWrite, async (req, res) => {
    try {
        const { fileName } = req.params;
        const { content } = req.body;

        if (!EDITABLE_CONFIG_FILES.includes(fileName)) {
            return WebResponse.forbidden(res, 'Access to this file is not allowed.');
        }
        if (typeof content !== 'object' || content === null) {
            return WebResponse.badRequest(res, 'Content must be a valid JSON object.');
        }

        writeFileAtomic(path.join(CONFIG_DIR, fileName), JSON.stringify(content, null, 2));
        await AuditService.logConfigFileChange(req.user.accountId, req.user.displayName, fileName, req.ip);
        LoggerService.log('info', `Config file ${fileName} updated by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `${fileName} updated successfully.` });
    } catch (error) {
        return WebResponse.serverError(res, 'update config file', error);
    }
});

// ---- Editable cloud-storage INI files ----

router.get('/neodyme/api/dev/ini-files/:fileName', ...dev, async (req, res) => {
    try {
        const { fileName } = req.params;
        if (!EDITABLE_INI_FILES.includes(fileName)) {
            return WebResponse.forbidden(res, 'Access to this file is not allowed.');
        }

        const filePath = path.join(CLOUDSTORAGE_SYSTEM_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            return WebResponse.notFound(res, 'File not found.');
        }
        return WebResponse.ok(res, { fileName, content: fs.readFileSync(filePath, 'utf8') });
    } catch (error) {
        return WebResponse.serverError(res, 'get ini file', error);
    }
});

router.put('/neodyme/api/dev/ini-files/:fileName', ...devWrite, async (req, res) => {
    try {
        const { fileName } = req.params;
        const { content } = req.body;

        if (!EDITABLE_INI_FILES.includes(fileName)) {
            return WebResponse.forbidden(res, 'Access to this file is not allowed.');
        }
        if (typeof content !== 'string') {
            return WebResponse.badRequest(res, 'Content must be a string.');
        }

        writeFileAtomic(path.join(CLOUDSTORAGE_SYSTEM_DIR, fileName), content);
        await AuditService.logConfigFileChange(req.user.accountId, req.user.displayName, fileName, req.ip);
        LoggerService.log('info', `INI file ${fileName} updated by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `${fileName} updated successfully.` });
    } catch (error) {
        return WebResponse.serverError(res, 'update ini file', error);
    }
});

// ---- Server / database stats ----

router.get('/neodyme/api/dev/stats/server', ...dev, async (req, res) => {
    try {
        const mem = process.memoryUsage();
        return WebResponse.ok(res, {
            stats: {
                version: ConfigManager.get('version', '1.0.0'),
                apiVersion: ConfigManager.get('apiVersion', '1.0'),
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: Math.floor(process.uptime()),
                uptimeFormatted: WebService.formatUptime(process.uptime()),
                memory: {
                    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
                    rss: Math.round(mem.rss / 1024 / 1024),
                    external: Math.round(mem.external / 1024 / 1024)
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
        return WebResponse.serverError(res, 'get server stats', error);
    }
});

router.get('/neodyme/api/dev/stats/database', ...dev, async (req, res) => {
    try {
        const dataDir = path.join(__dirname, '../../data');
        const users = await DatabaseManager.getAllAccounts();

        const files = {};
        for (const file of ['clients.json', 'tickets.json', 'creator-codes.json', 'audit-log.json']) {
            const filePath = path.join(dataDir, file);
            if (fs.existsSync(filePath)) {
                const size = fs.statSync(filePath).size;
                files[file] = { size, sizeFormatted: WebService.formatBytes(size) };
            }
        }

        return WebResponse.ok(res, {
            stats: {
                type: ConfigManager.get('databaseType', 'json'),
                backupEnabled: ConfigManager.get('databaseBackup', true),
                backupInterval: ConfigManager.get('databaseBackupInterval', 60),
                totalUsers: users.length,
                files
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get database stats', error);
    }
});

router.get('/neodyme/api/dev/ssl/status', ...dev, async (req, res) => {
    try {
        const protocol = ConfigManager.get('protocol', 'http');
        const certPath = path.resolve(ConfigManager.get('sslCertPath', 'config/ssl/cert.pem'));
        const keyPath = path.resolve(ConfigManager.get('sslKeyPath', 'config/ssl/key.pem'));
        const certExists = fs.existsSync(certPath);

        return WebResponse.ok(res, {
            ssl: {
                protocol,
                httpsActive: protocol === 'https',
                secureCookies: ConfigManager.get('secureCookies', false),
                certificate: {
                    path: certPath,
                    exists: certExists,
                    info: certExists ? {
                        path: certPath,
                        size: fs.statSync(certPath).size,
                        modified: fs.statSync(certPath).mtime.toISOString()
                    } : null
                },
                key: { path: keyPath, exists: fs.existsSync(keyPath) }
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get ssl status', error);
    }
});

// ---- Plugin config files ----

router.get('/neodyme/api/dev/plugins/:pluginName/files', ...dev, async (req, res) => {
    try {
        const { pluginName } = req.params;
        if (!/^[\w-]+$/.test(pluginName)) {
            return WebResponse.badRequest(res, 'Invalid plugin name.');
        }

        const pluginDir = path.join(PLUGINS_DIR, pluginName);
        if (!fs.existsSync(pluginDir)) {
            return WebResponse.notFound(res, 'Plugin directory not found.');
        }

        const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
        return WebResponse.ok(res, { pluginName, files });
    } catch (error) {
        return WebResponse.serverError(res, 'get plugin files', error);
    }
});

router.get('/neodyme/api/dev/plugins/:pluginName/files/:fileName', ...dev, async (req, res) => {
    try {
        const { pluginName, fileName } = req.params;
        if (!/^[\w-]+$/.test(pluginName) || !/^[\w.-]+\.json$/.test(fileName)) {
            return WebResponse.badRequest(res, 'Invalid plugin name or file name.');
        }

        const pluginDir = path.resolve(path.join(PLUGINS_DIR, pluginName));
        const filePath = path.resolve(path.join(pluginDir, fileName));
        if (!filePath.startsWith(pluginDir)) {
            return WebResponse.forbidden(res, 'Access denied.');
        }
        if (!fs.existsSync(filePath)) {
            return WebResponse.notFound(res, 'File not found.');
        }
        return WebResponse.ok(res, { pluginName, fileName, content: JSON.parse(fs.readFileSync(filePath, 'utf8')) });
    } catch (error) {
        return WebResponse.serverError(res, 'get plugin file', error);
    }
});

router.put('/neodyme/api/dev/plugins/:pluginName/files/:fileName', ...devWrite, async (req, res) => {
    try {
        const { pluginName, fileName } = req.params;
        const { content } = req.body;

        if (!/^[\w-]+$/.test(pluginName) || !/^[\w.-]+\.json$/.test(fileName)) {
            return WebResponse.badRequest(res, 'Invalid plugin name or file name.');
        }
        if (typeof content !== 'object' || content === null) {
            return WebResponse.badRequest(res, 'Content must be a valid JSON object.');
        }

        const pluginDir = path.resolve(path.join(PLUGINS_DIR, pluginName));
        const filePath = path.resolve(path.join(pluginDir, fileName));
        if (!filePath.startsWith(pluginDir)) {
            return WebResponse.forbidden(res, 'Access denied.');
        }
        if (!fs.existsSync(filePath)) {
            return WebResponse.notFound(res, 'File not found.');
        }

        writeFileAtomic(filePath, JSON.stringify(content, null, 2));
        LoggerService.log('info', `Plugin config ${pluginName}/${fileName} updated by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `${fileName} saved successfully.` });
    } catch (error) {
        return WebResponse.serverError(res, 'save plugin file', error);
    }
});

// ---- System self-tests ----

router.get('/neodyme/api/dev/system/tests', ...dev, async (req, res) => {
    try {
        const XmppManager = require('../../src/manager/xmpp-manager');
        const MatchmakerManager = require('../../src/manager/matchmaker-manager');
        const ShopManager = require('../../src/manager/shop-manager');
        const PluginManager = require('../../src/manager/plugin-manager');
        const RedisManager = require('../../src/manager/redis-manager');
        const PlayerStatsService = require('../../src/service/api/player-stats-service');

        const runCheck = async (id, name, fn) => {
            const t0 = performance.now();
            try {
                const result = await fn();
                return { id, name, status: result.status || 'ok', ms: Math.round(performance.now() - t0), message: result.message || 'Operational' };
            } catch (err) {
                return { id, name, status: 'error', ms: Math.round(performance.now() - t0), message: err.message };
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
                return { status: 'ok', message: `${(XmppManager.clients || []).length} connected` };
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

        const passing = checks.filter(c => c.status === 'ok').length;
        const disabled = checks.filter(c => c.status === 'disabled').length;
        const failing = checks.filter(c => c.status === 'error').length;
        const total = checks.length;

        PlayerStatsService.record(0, 0, 0, { passing, total: total - disabled }).catch(() => {});

        return WebResponse.ok(res, { checks, summary: { total, passing, disabled, failing } });
    } catch (error) {
        return WebResponse.serverError(res, 'system tests', error);
    }
});

router.get('/neodyme/api/dev/system/history', ...dev, async (req, res) => {
    try {
        const PlayerStatsService = require('../../src/service/api/player-stats-service');
        const hours = Math.min(72, parseInt(req.query.hours, 10) || 24);
        return WebResponse.ok(res, { history: await PlayerStatsService.getSystemHistory(hours) });
    } catch (error) {
        return WebResponse.serverError(res, 'system history', error);
    }
});

module.exports = router;
