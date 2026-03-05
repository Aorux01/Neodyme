const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');
const DatabaseManager = require('../manager/database-manager');
const TokenService = require('../service/token/token-service');
const ShopManager = require('../manager/shop-manager');

const NEODYME_ASCII = `
${colors.cyan('███╗   ██╗███████╗ ██████╗ ██████╗ ██╗   ██╗███╗   ███╗███████╗')}
${colors.cyan('████╗  ██║██╔════╝██╔═══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██╔════╝')}
${colors.cyan('██╔██╗ ██║█████╗  ██║   ██║██║  ██║ ╚████╔╝ ██╔████╔██║█████╗  ')}
${colors.cyan('██║╚██╗██║██╔══╝  ██║   ██║██║  ██║  ╚██╔╝  ██║╚██╔╝██║██╔══╝  ')}
${colors.cyan('██║ ╚████║███████╗╚██████╔╝██████╔╝   ██║   ██║ ╚═╝ ██║███████╗')}
${colors.cyan('╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═════╝    ╚═╝   ╚═╝     ╚═╝╚══════╝')}
`;

function register(CM) {
    CM.register('/help', (args) => {
        const commandsArray = Array.from(CM.commands.keys());
        const totalCommands = commandsArray.length;
        const perPage = 10;
        const totalPages = Math.ceil(totalCommands / perPage);

        const page = parseInt(args[0]) || 1;

        if (page < 1 || page > totalPages) {
            LoggerService.log('warn', `Invalid page number. Available pages: 1-${totalPages}`);
            return;
        }

        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage;
        const pageCommands = commandsArray.slice(startIndex, endIndex);

        LoggerService.log('info', `Available commands (Page ${page}/${totalPages}):`);
        pageCommands.forEach(cmd => {
            LoggerService.log('info', `  ${colors.cyan(cmd)}`);
        });

        if (page < totalPages) {
            LoggerService.log('info', `Type ${colors.cyan(`/help ${page + 1}`)} for more commands`);
        }
    });

    CM.register('/uptime', () => {
        const uptimeSeconds = Math.floor((Date.now() - CM.startTime) / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        LoggerService.log('info', `Server Uptime: ${hours}h ${minutes}m ${seconds}s`);
    });

    CM.register('/memory', () => {
        LoggerService.log('info', `Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    });

    CM.register('/version', () => {
        const version = ConfigManager.get('version') || 'unknown';
        LoggerService.log('info', `Neodyme Version: ${version}`);
    });

    CM.register('/stop', async () => {
        LoggerService.log('info', 'Shutting down server...');
        CM.readline.close();
        await CM.serverStop();
    });

    CM.register('/clear', () => {
        console.clear();
        console.log(NEODYME_ASCII);
    });

    CM.register('/health', async () => {
        try {
            const uptimeSeconds = Math.floor((Date.now() - CM.startTime) / 1000);
            const memoryUsage = process.memoryUsage();
            const tokenStats = TokenService.getTokenStats();

            LoggerService.log('info', 'Server Health Check:');
            LoggerService.log('info', `  Status: ${colors.green('HEALTHY')}`);
            LoggerService.log('info', `  Uptime: ${colors.cyan(Math.floor(uptimeSeconds / 3600) + 'h ' + Math.floor((uptimeSeconds % 3600) / 60) + 'm ' + (uptimeSeconds % 60) + 's')}`);
            LoggerService.log('info', `  Memory (Heap): ${colors.cyan(Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB')} / ${colors.cyan(Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB')}`);
            LoggerService.log('info', `  Memory (RSS): ${colors.cyan(Math.round(memoryUsage.rss / 1024 / 1024) + ' MB')}`);
            LoggerService.log('info', `  Active tokens: ${colors.cyan(tokenStats.total)}`);
            LoggerService.log('info', `  Node.js: ${colors.cyan(process.version)}`);
            LoggerService.log('info', `  Platform: ${colors.cyan(process.platform + ' ' + process.arch)}`);
        } catch (error) {
            LoggerService.log('error', `Health check failed: ${error.message}`);
        }
    });

    CM.register('/ready', async () => {
        try {
            const checks = {
                database: true,
                tokens: true,
                shop: ShopManager.isInitialized || false,
                config: ConfigManager.get('version') !== undefined
            };

            const allReady = Object.values(checks).every(v => v);

            if (allReady) {
                LoggerService.log('info', `Server Ready: ${colors.green('YES')}`);
                LoggerService.log('info', 'All services operational:');
            } else {
                LoggerService.log('warn', `Server Ready: ${colors.red('NO')}`);
                LoggerService.log('info', 'Service status:');
            }

            Object.entries(checks).forEach(([service, status]) => {
                const statusText = status ? colors.green('OK') : colors.red('NOT READY');
                LoggerService.log('info', `  ${service}: ${statusText}`);
            });
        } catch (error) {
            LoggerService.log('error', `Ready check failed: ${error.message}`);
        }
    });

    CM.register('/unlock', async (args) => {
        if (args.length < 1) {
            LoggerService.log('info', `Usage: ${colors.cyan('/unlock <username>')}`);
            return;
        }

        try {
            const username = args[0];
            const account = await DatabaseManager.getAccountByDisplayName(username);

            if (!account) {
                LoggerService.log('error', `Player "${username}" not found`);
                return;
            }

            const lockStatus = await DatabaseManager.isAccountLocked(account.accountId);
            if (!lockStatus.locked) {
                LoggerService.log('info', `Player "${username}" is not locked`);
                return;
            }

            await DatabaseManager.resetFailedAttempts(account.accountId);
            LoggerService.log('success', `Player "${username}" has been unlocked`);
        } catch (error) {
            LoggerService.log('error', `Failed to unlock account: ${error.message}`);
        }
    });
}

module.exports = { register };
