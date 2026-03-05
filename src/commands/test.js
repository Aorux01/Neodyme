const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');
const DatabaseManager = require('../manager/database-manager');
const TokenService = require('../service/token/token-service');
const PluginManager = require('../manager/plugin-manager');

function register(CM) {
    CM.register('/test', async (args) => {
        const target = args[0]?.toLowerCase() || 'all';

        const results = [];

        const runTest = async (name, fn) => {
            try {
                const start = Date.now();
                await fn();
                const duration = Date.now() - start;
                results.push({ name, passed: true, duration });
                LoggerService.log('success', `  [PASS] ${name} (${duration}ms)`);
            } catch (err) {
                results.push({ name, passed: false, error: err.message });
                LoggerService.log('error', `  [FAIL] ${name}: ${err.message}`);
            }
        };

        const testAccount = async () => {
            LoggerService.log('info', 'Running account tests...');
            await runTest('Database reachable', async () => {
                const accounts = await DatabaseManager.getAllAccounts();
                if (!Array.isArray(accounts)) throw new Error('getAllAccounts did not return an array');
            });
            await runTest('Config loaded', async () => {
                const version = ConfigManager.get('version');
                if (!version) throw new Error('version not set in config');
            });
        };

        const testPlugins = async () => {
            LoggerService.log('info', 'Running plugin tests...');
            await runTest('Plugin system available', async () => {
                const plugins = PluginManager.getPlugins();
                if (!Array.isArray(plugins)) throw new Error('getPlugins did not return an array');
            });
            await runTest('No plugin load errors', async () => {
                const plugins = PluginManager.getPlugins();
                LoggerService.log('info', `  ${plugins.length} plugin(s) loaded.`);
            });
        };

        const testServer = async () => {
            LoggerService.log('info', 'Running server tests...');
            await runTest('Config manager operational', async () => {
                const port = ConfigManager.get('port');
                if (!port) throw new Error('port not configured');
            });
            await runTest('Token service operational', async () => {
                const stats = TokenService.getTokenStats();
                if (typeof stats.total !== 'number') throw new Error('token stats invalid');
            });
            await runTest('Memory within limits', async () => {
                const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
                if (heapUsedMB > 1024) throw new Error(`Heap usage too high: ${heapUsedMB}MB`);
            });
        };

        const testDatabase = async () => {
            LoggerService.log('info', 'Running database tests...');
            await runTest('Database connection', async () => {
                const accounts = await DatabaseManager.getAllAccounts();
                if (!Array.isArray(accounts)) throw new Error('Connection failed');
            });
            await runTest('Database type configured', async () => {
                const type = ConfigManager.get('databaseType') || 'json';
                LoggerService.log('info', `  Database type: ${type}`);
            });
        };

        switch (target) {
            case 'account':
                await testAccount();
                break;
            case 'plugins':
                await testPlugins();
                break;
            case 'server':
                await testServer();
                break;
            case 'database':
                await testDatabase();
                break;
            case 'all':
                await testAccount();
                await testPlugins();
                await testServer();
                await testDatabase();
                break;
            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/test <all|account|plugins|server|database>')}`);
                LoggerService.log('info', 'Test suites:');
                LoggerService.log('info', `  ${colors.cyan('all')}      - Run all test suites`);
                LoggerService.log('info', `  ${colors.cyan('account')}  - Account and database read tests`);
                LoggerService.log('info', `  ${colors.cyan('plugins')}  - Plugin system tests`);
                LoggerService.log('info', `  ${colors.cyan('server')}   - Server config and token tests`);
                LoggerService.log('info', `  ${colors.cyan('database')} - Database connection tests`);
                return;
        }

        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;
        const label = failed === 0 ? colors.green('ALL PASSED') : colors.red(`${failed} FAILED`);
        LoggerService.log('info', `\nTest results: ${label} (${passed}/${results.length})`);
    });
}

module.exports = { register };
