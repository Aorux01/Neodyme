const os = require('os');
const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');
const DatabaseManager = require('../manager/database-manager');
const TokenService = require('../service/token/token-service');
const PluginManager = require('../manager/plugin-manager');

function register(CM) {
    CM.register('/diagnostic', async () => {
        try {
            const uptimeSeconds = Math.floor((Date.now() - CM.startTime) / 1000);
            const mem = process.memoryUsage();
            const totalMem = os.totalmem();
            const freeMem  = os.freemem();
            const usedMem  = totalMem - freeMem;
            const cpus     = os.cpus();
            const tokenStats = TokenService.getTokenStats();
            const plugins = PluginManager.getPlugins();
            let accountCount = 0;

            try {
                const accounts = await DatabaseManager.getAllAccounts();
                accountCount = accounts.length;
            } catch (_) {}

            LoggerService.log('info', colors.cyan('━'.repeat(60)));
            LoggerService.log('info', colors.cyan('  NEODYME SERVER DIAGNOSTIC REPORT'));
            LoggerService.log('info', colors.cyan('━'.repeat(60)));

            LoggerService.log('info', `\n${colors.yellow('[ SYSTEM ]')}`);
            LoggerService.log('info', `  OS:           ${os.type()} ${os.release()} (${os.arch()})`);
            LoggerService.log('info', `  Hostname:     ${os.hostname()}`);
            LoggerService.log('info', `  CPUs:         ${cpus.length}x ${cpus[0]?.model || 'Unknown'}`);
            LoggerService.log('info', `  Total RAM:    ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`);
            LoggerService.log('info', `  Used RAM:     ${(usedMem  / 1024 / 1024 / 1024).toFixed(2)} GB (${Math.round(usedMem / totalMem * 100)}%)`);
            LoggerService.log('info', `  Free RAM:     ${(freeMem  / 1024 / 1024 / 1024).toFixed(2)} GB`);
            LoggerService.log('info', `  Node.js:      ${process.version} | PID: ${process.pid}`);

            LoggerService.log('info', `\n${colors.yellow('[ SERVER ]')}`);
            LoggerService.log('info', `  Version:      ${ConfigManager.get('version') || 'unknown'}`);
            LoggerService.log('info', `  Uptime:       ${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`);
            LoggerService.log('info', `  Port:         ${ConfigManager.get('port')}`);
            LoggerService.log('info', `  Protocol:     ${ConfigManager.get('protocol', 'http').toUpperCase()}`);
            LoggerService.log('info', `  Debug Mode:   ${ConfigManager.get('debug') ? colors.green('ON') : colors.red('OFF')}`);
            LoggerService.log('info', `  Web UI:       ${ConfigManager.get('webInterface') !== false ? colors.green('Enabled') : colors.red('Disabled')}`);

            LoggerService.log('info', `\n${colors.yellow('[ PROCESS MEMORY ]')}`);
            LoggerService.log('info', `  Heap Used:    ${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
            LoggerService.log('info', `  Heap Total:   ${Math.round(mem.heapTotal / 1024 / 1024)} MB`);
            LoggerService.log('info', `  RSS:          ${Math.round(mem.rss / 1024 / 1024)} MB`);
            LoggerService.log('info', `  External:     ${Math.round(mem.external / 1024 / 1024)} MB`);

            LoggerService.log('info', `\n${colors.yellow('[ DATABASE ]')}`);
            LoggerService.log('info', `  Type:         ${ConfigManager.get('databaseType') || 'json'}`);
            LoggerService.log('info', `  Accounts:     ${accountCount}`);
            LoggerService.log('info', `  Backup:       ${ConfigManager.get('databaseBackup') ? colors.green('Enabled') : colors.red('Disabled')}`);
            LoggerService.log('info', `  Redis:        ${ConfigManager.get('redisEnabled') ? colors.green('Enabled') : colors.gray('Disabled')}`);

            LoggerService.log('info', `\n${colors.yellow('[ SERVICES ]')}`);
            LoggerService.log('info', `  XMPP:         ${ConfigManager.get('xmppEnable') ? colors.green('Enabled') : colors.red('Disabled')}`);
            LoggerService.log('info', `  Shop:         ${ConfigManager.get('autoShopRotation') ? colors.green('Auto-rotation') : colors.yellow('Manual')}`);
            LoggerService.log('info', `  Plugins:      ${ConfigManager.get('plugins') ? colors.green(`${plugins.length} loaded`) : colors.red('Disabled')}`);
            LoggerService.log('info', `  Rate Limit:   ${ConfigManager.get('rateLimiting') ? colors.green('Enabled') : colors.red('Disabled')}`);
            LoggerService.log('info', `  Maintenance:  ${ConfigManager.get('maintenanceMode') ? colors.yellow('ACTIVE') : colors.green('Off')}`);

            LoggerService.log('info', `\n${colors.yellow('[ TOKENS ]')}`);
            LoggerService.log('info', `  Access:       ${tokenStats.accessTokens}`);
            LoggerService.log('info', `  Refresh:      ${tokenStats.refreshTokens}`);
            LoggerService.log('info', `  Client:       ${tokenStats.clientTokens}`);
            LoggerService.log('info', `  Total:        ${tokenStats.total}`);

            if (plugins.length > 0) {
                LoggerService.log('info', `\n${colors.yellow('[ PLUGINS ]')}`);
                plugins.forEach(p => {
                    LoggerService.log('info', `  - ${colors.cyan(p.name)} v${p.version || '?'}`);
                });
            }

            LoggerService.log('info', colors.cyan('━'.repeat(60)));
        } catch (error) {
            LoggerService.log('error', `Diagnostic failed: ${error.message}`);
        }
    });
}

module.exports = { register };
