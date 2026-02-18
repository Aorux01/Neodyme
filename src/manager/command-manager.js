const readline = require('readline');
const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('./config-manager');
const DatabaseManager = require('./database-manager')

const EndpointManager = require('./endpoint-manager');
const PluginManager = require('./plugin-manager');
const PluginInstaller = require('./plugin-installer');
const ShopManager = require('./shop-manager');
const BackupManager = require('./backup-manager');

const TokenService = require('../service/token/token-service')
const XMPPManager = require('./xmpp-manager')

const NEODYME_ASCII = `
${colors.cyan('███╗   ██╗███████╗ ██████╗ ██████╗ ██╗   ██╗███╗   ███╗███████╗')}
${colors.cyan('████╗  ██║██╔════╝██╔═══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██╔════╝')}
${colors.cyan('██╔██╗ ██║█████╗  ██║   ██║██║  ██║ ╚████╔╝ ██╔████╔██║█████╗  ')}
${colors.cyan('██║╚██╗██║██╔══╝  ██║   ██║██║  ██║  ╚██╔╝  ██║╚██╔╝██║██╔══╝  ')}
${colors.cyan('██║ ╚████║███████╗╚██████╔╝██████╔╝   ██║   ██║ ╚═╝ ██║███████╗')}
${colors.cyan('╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═════╝    ╚═╝   ╚═╝     ╚═╝╚══════╝')}
`;

class CommandManager {
    static readline = null;
    static commands = new Map();
    static startTime = Date.now();

    static async load() {
        this.readline = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            //prompt: colors.green('Neodyme> ')
        });

        this.registerDefaultCommands();

        this.readline.on('line', (input) => {
            const [command, ...args] = input.trim().split(' ');

            if (command) {
                this.execute(command, args);
            }

            //this.readline.prompt();
        });

        //setTimeout(() => this.readline.prompt(), 1000);

        LoggerService.log('success', 'Command system ready.');
    }

    static async serverStop() {
        try {
            //if (ConfigManager.get('discordBot') || ConfigManager.get('discordWebhook')) {
            //    LoggerService.log('info', 'Stopping Discord integration...');
            //    await DiscordManager.onServerShutdown();
            //}

            if (ConfigManager.get('plugins')) {
                LoggerService.log('info', 'Unloading plugins...');
                await PluginManager.unloadAll();
            }
    
            if (ConfigManager.get('xmppEnable')) {
                LoggerService.log('info', 'Stopping XMPP server...');
                await XMPPManager.stop();
            }

            if (ConfigManager.get('databaseBackup')) {
                LoggerService.log('info', 'Shutting down backup system...');
                await BackupManager.shutdown();
            }

            LoggerService.log('info', 'Shutting down API server...');
            if (this.serverInstance?.httpServer) {
                this.serverInstance.httpServer.close(() => {
                    LoggerService.log('info', 'API server closed.');
                });
            }

            LoggerService.log('success', 'Server stopped successfully.');
            LoggerService.log('info', 'Goodbye!');
            process.exit(0);
        } catch (error) {
            LoggerService.log('error', 'Error during server shutdown:', { error: error.message });
            process.exit(1);
        }
    }

    static register(name, handler) {
        this.commands.set(name.toLowerCase(), handler);
    }

    static execute(command, args = []) {
        const handler = this.commands.get(command.toLowerCase());
        if (handler) {
            try {
                handler(args);
            } catch (error) {
                LoggerService.log('error', `Error executing command '${command}': ${error.message}`);
            }
        } else {
            LoggerService.log('warn', `Unknown command: '${command}'. Type '/help' for a list of commands.`);
        }
    }

    static registerDefaultCommands() {
        this.register('/help', (args) => {
            const commandsArray = Array.from(this.commands.keys());
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

        this.register('/uptime', () => {
            const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const hours = Math.floor(uptimeSeconds / 3600);
            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
            const seconds = uptimeSeconds % 60;
            LoggerService.log('info', `Server Uptime: ${hours}h ${minutes}m ${seconds}s`);
        });

        this.register('/memory', () => {
            LoggerService.log('info', `Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        });

        this.register('/version', () => {
            const version = ConfigManager.get('version') || 'unknown';
            LoggerService.log('info', `Neodyme Version: ${version}`);
        });

        this.register('/reload', async () => {
            LoggerService.log('info', 'Reloading configuration...');
            await ConfigManager.load();
            LoggerService.log('success', 'Configuration reloaded successfully');
        });

        this.register('/stop', async () => {
            LoggerService.log('info', 'Shutting down server...');
            this.readline.close();
            await this.serverStop();
        });

        this.register('/clear', () => {
            console.clear();
            console.log(NEODYME_ASCII);
        });

        this.register('/plugins', async (args) => {
            const subCommand = args[0]?.toLowerCase();
            const pluginName = args[1];

            switch(subCommand) {
                case 'store':
                    const storeCmd = args[1]?.toLowerCase();
                    const storeArg = args[2];

                    switch(storeCmd) {
                        case 'list':
                            try {
                                const page = parseInt(args[2]) || 1;
                                const perPage = 10;

                                LoggerService.log('info', 'Fetching plugins from store...');
                                const pluginsList = await PluginInstaller.fetchPluginsList();
                                const totalPlugins = pluginsList.plugins.length;
                                const totalPages = Math.ceil(totalPlugins / perPage);

                                if (page < 1 || page > totalPages) {
                                    LoggerService.log('warn', `Invalid page. Available: 1-${totalPages}`);
                                    return;
                                }

                                const startIndex = (page - 1) * perPage;
                                const pagePlugins = pluginsList.plugins.slice(startIndex, startIndex + perPage);

                                LoggerService.log('info', `Available plugins in store (Page ${page}/${totalPages}) - Total: ${colors.cyan(totalPlugins)}`);
                                LoggerService.log('info', `Store version: ${colors.gray(pluginsList.version)} | Last updated: ${colors.gray(new Date(pluginsList.lastUpdated).toLocaleString())}\n`);

                                pagePlugins.forEach((plugin, index) => {
                                    const num = startIndex + index + 1;
                                    const installed = PluginInstaller.isPluginInstalled(plugin.id) ? colors.green('[INSTALLED]') : '';
                                    LoggerService.log('info', `${num}. ${colors.cyan(plugin.name)} ${colors.gray('v' + plugin.version)} ${installed}`);
                                    LoggerService.log('info', `   ${colors.gray(plugin.description)}`);
                                    LoggerService.log('info', `   Author: ${colors.yellow(plugin.author)} | Category: ${colors.magenta(plugin.category)} | Downloads: ${colors.green(plugin.downloads)}`);
                                    LoggerService.log('info', `   ID: ${colors.gray(plugin.id)}\n`);
                                });

                                if (page < totalPages) {
                                    LoggerService.log('info', `Type ${colors.cyan(`/plugins store list ${page + 1}`)} for more`);
                                }

                                LoggerService.log('info', `Use ${colors.cyan('/plugins store install <plugin-id>')} to install a plugin`);
                                LoggerService.log('info', `Use ${colors.cyan('/plugins store info <plugin-id>')} for detailed information`);

                            } catch (error) {
                                LoggerService.log('error', `Failed to fetch plugins: ${error.message}`);
                            }
                            break;

                        case 'search':
                            if (!storeArg) {
                                LoggerService.log('info', `Usage: ${colors.cyan('/plugins store search <query>')}`);
                                return;
                            }

                            try {
                                LoggerService.log('info', `Searching for: "${storeArg}"...`);
                                const results = await PluginInstaller.searchPlugins(storeArg);

                                if (results.length === 0) {
                                    LoggerService.log('info', `No plugins found matching "${storeArg}"`);
                                    return;
                                }

                                LoggerService.log('info', `Found ${colors.cyan(results.length)} plugin(s):\n`);
                                results.forEach((plugin, index) => {
                                    const installed = PluginInstaller.isPluginInstalled(plugin.id) ? colors.green('[INSTALLED]') : '';
                                    LoggerService.log('info', `${index + 1}. ${colors.cyan(plugin.name)} ${colors.gray('v' + plugin.version)} ${installed}`);
                                    LoggerService.log('info', `   ${colors.gray(plugin.description)}`);
                                    LoggerService.log('info', `   ID: ${colors.gray(plugin.id)}\n`);
                                });

                            } catch (error) {
                                LoggerService.log('error', `Search failed: ${error.message}`);
                            }
                            break;

                        case 'info':
                            if (!storeArg) {
                                LoggerService.log('info', `Usage: ${colors.cyan('/plugins store info <plugin-id>')}`);
                                return;
                            }

                            try {
                                const pluginInfo = await PluginInstaller.getPluginById(storeArg);
                                if (!pluginInfo) {
                                    LoggerService.log('error', `Plugin '${storeArg}' not found in store`);
                                    return;
                                }

                                const manifest = await PluginInstaller.fetchPluginManifest(pluginInfo.manifestUrl);
                                const installed = PluginInstaller.isPluginInstalled(pluginInfo.id);

                                LoggerService.log('info', `${colors.cyan(pluginInfo.name)} ${colors.gray('v' + pluginInfo.version)}`);                
                                LoggerService.log('info', `Description:        ${pluginInfo.description}`);
                                LoggerService.log('info', `Author:             ${colors.yellow(pluginInfo.author)}`);
                                LoggerService.log('info', `Category:           ${colors.magenta(pluginInfo.category)}`);
                                LoggerService.log('info', `Version:            ${colors.green(pluginInfo.version)}`);
                                LoggerService.log('info', `Min Backend:        ${colors.yellow(manifest.minBackendVersion || 'Any')}`);
                                LoggerService.log('info', `License:            ${manifest.license || 'Unknown'}`);
                                LoggerService.log('info', `Downloads:          ${colors.green(pluginInfo.downloads)}`);
                                LoggerService.log('info', `Rating:             ${colors.yellow('★'.repeat(Math.round(pluginInfo.rating)))} ${pluginInfo.rating}/5`);
                                LoggerService.log('info', `Status:             ${installed ? colors.green('INSTALLED') : colors.gray('Not installed')}`);

                                if (pluginInfo.tags && pluginInfo.tags.length > 0) {
                                    LoggerService.log('info', `Tags:               ${pluginInfo.tags.map(t => colors.cyan(t)).join(', ')}`);
                                }

                                if (manifest.dependencies?.npm && manifest.dependencies.npm.length > 0) {
                                    LoggerService.log('info', `NPM Dependencies:   ${manifest.dependencies.npm.join(', ')}`);
                                }

                                LoggerService.log('info', `Files:              ${manifest.files.length} file(s)`);

                                if (manifest.repository) {
                                    LoggerService.log('info', `Repository:         ${manifest.repository}`);
                                }

                                //LoggerService.log('info', `${colors.cyan('━'.repeat(60))}\n`);

                                if (!installed) {
                                    LoggerService.log('info', `Install with: ${colors.cyan(`/plugins store install ${pluginInfo.id}`)}`);
                                } else {
                                    LoggerService.log('info', `Update with: ${colors.cyan(`/plugins store update ${pluginInfo.id}`)}`);
                                }

                            } catch (error) {
                                LoggerService.log('error', `Failed to get plugin info: ${error.message}`);
                            }
                            break;

                        case 'install':
                            if (!storeArg) {
                                LoggerService.log('info', `Usage: ${colors.cyan('/plugins store install <plugin-id>')}`);
                                return;
                            }

                            await PluginInstaller.installPlugin(storeArg, PluginManager);
                            break;

                        case 'uninstall':
                            if (!storeArg) {
                                LoggerService.log('info', `Usage: ${colors.cyan('/plugins store uninstall <plugin-id>')}`);
                                return;
                            }

                            await PluginInstaller.uninstallPlugin(storeArg, PluginManager);
                            break;

                        case 'update':
                            if (!storeArg) {
                                LoggerService.log('info', `Usage: ${colors.cyan('/plugins store update <plugin-id>')}`);
                                return;
                            }

                            await PluginInstaller.updatePlugin(storeArg, PluginManager);
                            break;

                        case 'refresh':
                            try {
                                LoggerService.log('info', 'Refreshing plugins store cache...');
                                await PluginInstaller.fetchPluginsList(true);
                                LoggerService.log('success', 'Store cache refreshed successfully');
                            } catch (error) {
                                LoggerService.log('error', `Failed to refresh cache: ${error.message}`);
                            }
                            break;

                        default:
                            LoggerService.log('info', `Usage: ${colors.cyan('/plugins store <list|search|info|install|uninstall|update|refresh>')}`);
                            LoggerService.log('info', 'Store commands:');
                            LoggerService.log('info', `  ${colors.cyan('list [page]')}           - List available plugins from store`);
                            LoggerService.log('info', `  ${colors.cyan('search <query>')}        - Search plugins`);
                            LoggerService.log('info', `  ${colors.cyan('info <plugin-id>')}      - Show detailed plugin information`);
                            LoggerService.log('info', `  ${colors.cyan('install <plugin-id>')}   - Download and install a plugin`);
                            LoggerService.log('info', `  ${colors.cyan('uninstall <plugin-id>')} - Uninstall a plugin`);
                            LoggerService.log('info', `  ${colors.cyan('update <plugin-id>')}    - Update an installed plugin`);
                            LoggerService.log('info', `  ${colors.cyan('refresh')}               - Refresh store cache`);
                            break;
                    }
                    break;

                case 'list':
                    const plugins = PluginManager.getPlugins();
                    if (plugins.length === 0) {
                        LoggerService.log('info', 'No plugins loaded.');
                    } else {
                        LoggerService.log('info', `Loaded plugins (${plugins.length}):`);
                        plugins.forEach(plugin => {
                            LoggerService.log('info', `  - ${colors.cyan(plugin.name)} v${plugin.version || '1.0.0'}`);
                        });
                    }
                    break;

                case 'load':
                    if (args[1] === 'all') {
                        LoggerService.log('info', 'Loading all plugins...');
                        await PluginManager.load();
                        LoggerService.log('success', 'All plugins loaded successfully');
                    } else if (pluginName) {
                        LoggerService.log('info', `Loading plugin: ${pluginName}...`);
                        const loadSuccess = await PluginManager.loadPlugin(pluginName);
                        if (loadSuccess) {
                            LoggerService.log('success', `Plugin '${pluginName}' loaded successfully`);
                        } else {
                            LoggerService.log('error', `Failed to load plugin '${pluginName}'`);
                        }
                    } else {
                        LoggerService.log('info', `Usage: ${colors.cyan('/plugins load <pluginName|all>')}`);
                    }
                    break;

                case 'unload':
                    if (args[1] === 'all') {
                        LoggerService.log('info', 'Unloading all plugins...');
                        await PluginManager.unloadAll();
                        LoggerService.log('success', 'All plugins unloaded successfully');
                    } else if (pluginName) {
                        LoggerService.log('info', `Unloading plugin: ${pluginName}...`);
                        const unloadSuccess = await PluginManager.unloadPlugin(pluginName);
                        if (unloadSuccess) {
                            LoggerService.log('success', `Plugin '${pluginName}' unloaded successfully`);
                        } else {
                            LoggerService.log('error', `Failed to unload plugin '${pluginName}'`);
                        }
                    } else {
                        LoggerService.log('info', `Usage: ${colors.cyan('/plugins unload <pluginName|all>')}`);
                    }
                    break;

                case 'reload':
                    if (args[1] === 'all') {
                        LoggerService.log('info', 'Reloading all plugins...');
                        await PluginManager.reload();
                        LoggerService.log('success', 'All plugins reloaded successfully');
                    } else if (pluginName) {
                        LoggerService.log('info', `Reloading plugin: ${pluginName}...`);
                        const reloadSuccess = await PluginManager.reloadPlugin(pluginName);
                        if (reloadSuccess) {
                            LoggerService.log('success', `Plugin '${pluginName}' reloaded successfully`);
                        } else {
                            LoggerService.log('error', `Failed to reload plugin '${pluginName}'`);
                        }
                    } else {
                        LoggerService.log('info', `Usage: ${colors.cyan('/plugins reload <pluginName|all>')}`);
                    }
                    break;

                case 'info':
                    if (pluginName) {
                        const pluginInfo = PluginManager.getPluginInfo(pluginName);
                        if (pluginInfo) {
                            LoggerService.log('info', `Plugin Information: ${colors.cyan(pluginInfo.name)}`);
                            LoggerService.log('info', `  Version:            ${colors.green(pluginInfo.version)}`);
                            LoggerService.log('info', `  Description:        ${pluginInfo.description}`);
                            LoggerService.log('info', `  Author:             ${pluginInfo.author}`);
                            LoggerService.log('info', `  License:            ${pluginInfo.license}`);
                            LoggerService.log('info', `  Min Backend Ver:    ${colors.yellow(pluginInfo.minBackendVersion)}`);

                            if (pluginInfo.dependencies.npm && pluginInfo.dependencies.npm.length > 0) {
                                LoggerService.log('info', `  NPM Dependencies:   ${pluginInfo.dependencies.npm.join(', ')}`);
                            } else {
                                LoggerService.log('info', `  NPM Dependencies:   None`);
                            }

                            if (pluginInfo.dependencies.plugins && pluginInfo.dependencies.plugins.length > 0) {
                                LoggerService.log('info', `  Plugin Dependencies: ${pluginInfo.dependencies.plugins.join(', ')}`);
                            }

                            LoggerService.log('info', `  Path:               ${pluginInfo.path}`);

                            if (pluginInfo.repository) {
                                LoggerService.log('info', `  Repository:         ${pluginInfo.repository}`);
                            }
                            if (pluginInfo.homepage) {
                                LoggerService.log('info', `  Homepage:           ${pluginInfo.homepage}`);
                            }
                        } else {
                            LoggerService.log('error', `Plugin '${pluginName}' not found. Use '/plugins list' to see loaded plugins.`);
                        }
                    } else {
                        LoggerService.log('info', `Usage: ${colors.cyan('/plugins info <pluginName>')}`);
                    }
                    break;

                default:
                    LoggerService.log('info', `Usage: ${colors.cyan('/plugins <store|list|info|load|unload|reload>')}`);
                    LoggerService.log('info', 'Subcommands:');
                    LoggerService.log('info', `  ${colors.cyan('store')}  - Plugin store commands (list, search, install, etc.)`);
                    LoggerService.log('info', `  ${colors.cyan('list')}   - List all loaded plugins`);
                    LoggerService.log('info', `  ${colors.cyan('info')}   - Show plugin details (usage: /plugins info <pluginName>)`);
                    LoggerService.log('info', `  ${colors.cyan('load')}   - Load a plugin (usage: /plugins load <pluginName|all>)`);
                    LoggerService.log('info', `  ${colors.cyan('unload')} - Unload a plugin (usage: /plugins unload <pluginName|all>)`);
                    LoggerService.log('info', `  ${colors.cyan('reload')} - Reload a plugin (usage: /plugins reload <pluginName|all>)`);
                    LoggerService.log('info', '');
                    LoggerService.log('info', `Type ${colors.cyan('/plugins store')} to see store commands`);
                    break;
            }
        });

        this.register('/account', async (args) => {
            const subCommand = args[0]?.toLowerCase();

            switch (subCommand) {
                case 'create':
                    if (args.length < 4) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/account create <email> <password> <displayName>')}`);
                        return;
                    }

                    try {
                        const [, email, password, ...displayNameParts] = args;
                        const displayName = displayNameParts.join(' ');

                        const account = await DatabaseManager.createAccount(email, password, displayName);
                        LoggerService.log('success', `Account created successfully!`);
                        LoggerService.log('info', `  Email: ${colors.cyan(account.email)}`);
                        LoggerService.log('info', `  Display Name: ${colors.cyan(account.displayName)}`);
                        LoggerService.log('info', `  Account ID: ${colors.cyan(account.accountId)}`);
                    } catch (error) {
                        LoggerService.log('error', `Failed to create account: ${error.message}`);
                    }
                    break;

                case 'info':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/account info <username>')}`);
                        return;
                    }

                    try {
                        const username = args[1];
                        const account = await DatabaseManager.getAccountByDisplayName(username);

                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }

                        const vbucks = await DatabaseManager.getVbucksBalance(account.accountId);
                        const roleName = DatabaseManager.getRoleName(account.clientType || 0);

                        LoggerService.log('info', `Player information for "${username}":`);
                        LoggerService.log('info', `  Account ID: ${colors.cyan(account.accountId)}`);
                        LoggerService.log('info', `  Email: ${colors.cyan(account.email || 'N/A')}`);
                        LoggerService.log('info', `  Role: ${colors.cyan(roleName)}`);
                        LoggerService.log('info', `  Banned: ${account.ban?.banned ? colors.red('YES') : colors.green('NO')}`);
                        LoggerService.log('info', `  V-Bucks: ${colors.green(vbucks)}`);
                        LoggerService.log('info', `  Last login: ${colors.cyan(new Date(account.lastLogin).toLocaleString())}`);
                        LoggerService.log('info', `  Created: ${colors.cyan(new Date(account.created).toLocaleString())}`);

                        if (account.ban?.banned && account.ban.banReasons?.length > 0) {
                            LoggerService.log('info', `  Ban reasons: ${colors.red(account.ban.banReasons.join(', '))}`);
                        }
                    } catch (error) {
                        LoggerService.log('error', `Failed to get player info: ${error.message}`);
                    }
                    break;

                case 'list':
                    try {
                        const allAccounts = await DatabaseManager.getAllAccounts();
                        const page = parseInt(args[1]) || 1;
                        const perPage = 10;
                        const totalPages = Math.ceil(allAccounts.length / perPage);

                        if (page < 1 || page > totalPages) {
                            LoggerService.log('warn', `Invalid page. Available: 1-${totalPages}`);
                            return;
                        }

                        const startIndex = (page - 1) * perPage;
                        const pageAccounts = allAccounts.slice(startIndex, startIndex + perPage);

                        LoggerService.log('info', `Accounts (Page ${page}/${totalPages}) - Total: ${colors.cyan(allAccounts.length)}`);
                        pageAccounts.forEach((account, index) => {
                            const num = startIndex + index + 1;
                            LoggerService.log('info', `  ${num}. ${colors.cyan(account.displayName)} - ${account.email}`);
                        });

                        if (page < totalPages) {
                            LoggerService.log('info', `Type ${colors.cyan(`/account list ${page + 1}`)} for more`);
                        }
                    } catch (error) {
                        LoggerService.log('error', `Failed to list accounts: ${error.message}`);
                    }
                    break;

                default:
                    LoggerService.log('info', `Usage: ${colors.cyan('/account <create|info|list>')}`);
                    LoggerService.log('info', 'Subcommands:');
                    LoggerService.log('info', `  ${colors.cyan('create')} - Create a new account (usage: /account create <email> <password> <displayName>)`);
                    LoggerService.log('info', `  ${colors.cyan('info')}   - View account details (usage: /account info <username>)`);
                    LoggerService.log('info', `  ${colors.cyan('list')}   - List all accounts (usage: /account list [page])`);
                    break;
            }
        });

        this.register('/shop', async (args) => {
            const subCommand = args[0]?.toLowerCase();
    
            switch (subCommand) {
                case 'rotate':
                    try {
                        LoggerService.log('info', 'Forcing shop rotation...');
                        await ShopManager.forceRotation();
                        LoggerService.log('success', 'Shop has been rotated successfully!');
                    } catch (error) {
                        LoggerService.log('error', `Failed to rotate shop: ${error.message}`);
                    }
                    break;
    
                case 'info':
                    try {
                        const shopData = await ShopManager.getShopData();
                        const items = Object.keys(shopData).filter(key => !key.startsWith('//'));
                        
                        LoggerService.log('info', `Current shop contains ${colors.cyan(items.length)} items:`);
                        
                        const dailyItems = items.filter(key => key.startsWith('daily'));
                        const featuredItems = items.filter(key => key.startsWith('featured'));
                        
                        LoggerService.log('info', `  Daily items: ${colors.cyan(dailyItems.length)}`);
                        LoggerService.log('info', `  Featured items: ${colors.cyan(featuredItems.length)}`);
    
                        if (dailyItems.length > 0) {
                            LoggerService.log('info', '\nDaily Items:');
                            dailyItems.slice(0, 3).forEach(key => {
                                const item = shopData[key];
                                const itemName = item.itemGrants[0]?.split(':')[1] || 'Unknown';
                                LoggerService.log('info', `  • ${itemName} - ${colors.green(item.price)} V-Bucks`);
                            });
                            if (dailyItems.length > 3) {
                                LoggerService.log('info', `  ... and ${dailyItems.length - 3} more`);
                            }
                        }
    
                        if (featuredItems.length > 0) {
                            LoggerService.log('info', '\nFeatured Items:');
                            featuredItems.slice(0, 3).forEach(key => {
                                const item = shopData[key];
                                const itemName = item.itemGrants[0]?.split(':')[1] || 'Unknown';
                                LoggerService.log('info', `  • ${itemName} - ${colors.green(item.price)} V-Bucks`);
                            });
                            if (featuredItems.length > 3) {
                                LoggerService.log('info', `  ... and ${featuredItems.length - 3} more`);
                            }
                        }
                    } catch (error) {
                        LoggerService.log('error', `Failed to retrieve shop info: ${error.message}`);
                    }
                    break;
    
                case 'status':
                    try {
                        const state = await ShopManager.getShopState();
                        
                        if (state.lastRotation) {
                            const lastRotation = new Date(state.lastRotation);
                            LoggerService.log('info', `Last rotation: ${colors.cyan(lastRotation.toLocaleString())}`);
                        } else {
                            LoggerService.log('info', 'Last rotation: Never');
                        }
    
                        if (state.nextRotation) {
                            const nextRotation = new Date(state.nextRotation);
                            const now = new Date();
                            const timeUntil = nextRotation.getTime() - now.getTime();
                            const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
                            const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
                            
                            LoggerService.log('info', `Next rotation: ${colors.cyan(nextRotation.toLocaleString())}`);
                            LoggerService.log('info', `Time until next rotation: ${colors.cyan(`${hoursUntil}h ${minutesUntil}m`)}`);
                        } else {
                            LoggerService.log('info', 'Next rotation: Not scheduled');
                        }
                    } catch (error) {
                        LoggerService.log('error', `Failed to retrieve shop status: ${error.message}`);
                    }
                    break;
    
                default:
                    LoggerService.log('info', `Usage: ${colors.cyan('/shop <rotate|info|status>')}`);
                    LoggerService.log('info', 'Subcommands:');
                    LoggerService.log('info', `  ${colors.cyan('rotate')} - Force shop rotation`);
                    LoggerService.log('info', `  ${colors.cyan('info')}   - Display current shop items`);
                    LoggerService.log('info', `  ${colors.cyan('status')} - Show shop rotation status`);
                    break;
            }
        });

        this.register('/ban', async (args) => {
            const subCommand = args[0]?.toLowerCase();
        
            switch (subCommand) {
                case 'add':
                    if (args.length < 3) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/ban add <username> <reason> [duration]')}`);
                        LoggerService.log('info', 'Examples:');
                        LoggerService.log('info', `  ${colors.cyan('/ban add Player123 Cheating')} - Permanent ban`);
                        LoggerService.log('info', `  ${colors.cyan('/ban add Player123 Toxicity 7d')} - 7 days ban`);
                        LoggerService.log('info', `  ${colors.cyan('/ban add Player123 Spamming 2h')} - 2 hours ban`);
                        return;
                    }
        
                    try {
                        const username = args[1];
                        const reason = args[2];
                        const duration = args[3] || 'permanent';
        
                        const account = await DatabaseManager.getAccountByDisplayName(username);
                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }
        
                        const isBanned = await DatabaseManager.AccountIsBanned(account.accountId);
                        if (isBanned) {
                            LoggerService.log('warn', `Player "${username}" is already banned. Use ${colors.cyan('/ban info ' + username)} to view details.`);
                            return;
                        }
        
                        let expiresAt = null;
                        if (duration !== 'permanent') {
                            const durationMatch = duration.match(/^(\d+)([hdm])$/);
                            if (!durationMatch) {
                                LoggerService.log('error', 'Invalid duration format. Use: 2h, 7d, 30d, etc.');
                                return;
                            }
        
                            const amount = parseInt(durationMatch[1]);
                            const unit = durationMatch[2];
                            let milliseconds = 0;
        
                            switch (unit) {
                                case 'h': milliseconds = amount * 60 * 60 * 1000; break;
                                case 'd': milliseconds = amount * 24 * 60 * 60 * 1000; break;
                                case 'm': milliseconds = amount * 30 * 24 * 60 * 60 * 1000; break;
                            }
        
                            expiresAt = new Date(Date.now() + milliseconds);
                        }
        
                        await DatabaseManager.banAccount(account.accountId, [reason], expiresAt);
        
                        const banType = expiresAt ? `until ${expiresAt.toLocaleString()}` : 'PERMANENTLY';
                        LoggerService.log('success', `Player "${username}" has been banned ${banType} for: ${reason}`);
        
                    } catch (error) {
                        LoggerService.log('error', `Failed to ban player: ${error.message}`);
                    }
                    break;
        
                case 'remove':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/ban remove <username>')}`);
                        return;
                    }
        
                    try {
                        const username = args[1];
        
                        const account = await DatabaseManager.getAccountByDisplayName(username);
                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }
        
                        const isBanned = await DatabaseManager.AccountIsBanned(account.accountId);
                        if (!isBanned) {
                            LoggerService.log('warn', `Player "${username}" is not banned`);
                            return;
                        }
        
                        await DatabaseManager.unbanAccount(account.accountId);
                        LoggerService.log('success', `Player "${username}" has been unbanned`);
        
                    } catch (error) {
                        LoggerService.log('error', `Failed to unban player: ${error.message}`);
                    }
                    break;
        
                case 'info':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/ban info <username>')}`);
                        return;
                    }
        
                    try {
                        const username = args[1];
        
                        const account = await DatabaseManager.getAccountByDisplayName(username);
                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }
        
                        const banInfo = await DatabaseManager.getBanInfo(account.accountId);
                        if (!banInfo || !banInfo.banned) {
                            LoggerService.log('info', `Player "${username}" is not banned`);
                            return;
                        }
        
                        LoggerService.log('info', `Ban information for "${username}":`);
                        LoggerService.log('info', `  Account ID: ${colors.cyan(account.accountId)}`);
                        LoggerService.log('info', `  Banned: ${colors.red('YES')}`);
                        LoggerService.log('info', `  Banned at: ${colors.cyan(new Date(banInfo.bannedAt).toLocaleString())}`);
                        
                        if (banInfo.expiresAt) {
                            const now = new Date();
                            const expires = new Date(banInfo.expiresAt);
                            const timeLeft = expires.getTime() - now.getTime();
                            const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
                            
                            LoggerService.log('info', `  Expires: ${colors.cyan(expires.toLocaleString())}`);
                            LoggerService.log('info', `  Time left: ${colors.cyan(`${daysLeft} days`)}`);
                        } else {
                            LoggerService.log('info', `  Expires: ${colors.red('PERMANENT')}`);
                        }
        
                        LoggerService.log('info', `  Reasons:`);
                        banInfo.reasons.forEach((reason, index) => {
                            LoggerService.log('info', `    ${index + 1}. ${reason}`);
                        });
        
                    } catch (error) {
                        LoggerService.log('error', `Failed to get ban info: ${error.message}`);
                    }
                    break;
        
                case 'list':
                    try {
                        const allAccounts = await DatabaseManager.getAllAccounts();
                        const bannedAccounts = [];
        
                        for (const account of allAccounts) {
                            const isBanned = await DatabaseManager.AccountIsBanned(account.accountId);
                            if (isBanned) {
                                const banInfo = await DatabaseManager.getBanInfo(account.accountId);
                                bannedAccounts.push({
                                    username: account.displayName,
                                    accountId: account.accountId,
                                    banInfo
                                });
                            }
                        }
        
                        if (bannedAccounts.length === 0) {
                            LoggerService.log('info', 'No banned players found');
                            return;
                        }
        
                        LoggerService.log('info', `Found ${colors.cyan(bannedAccounts.length)} banned player(s):`);
                        bannedAccounts.forEach((player, index) => {
                            const expires = player.banInfo.expiresAt 
                                ? new Date(player.banInfo.expiresAt).toLocaleString() 
                                : colors.red('PERMANENT');
                            
                            LoggerService.log('info', 
                                `${index + 1}. ${colors.cyan(player.username)} - Expires: ${expires}`
                            );
                            LoggerService.log('info', `     Reason: ${colors.gray(player.banInfo.reasons[0] || 'No reason')}`);
                        });
        
                    } catch (error) {
                        LoggerService.log('error', `Failed to list banned players: ${error.message}`);
                    }
                    break;
        
                default:
                    LoggerService.log('info', `Usage: ${colors.cyan('/ban <add|remove|info|list>')}`);
                    LoggerService.log('info', 'Subcommands:');
                    LoggerService.log('info', `  ${colors.cyan('add')}    - Ban a player (usage: /ban add <username> <reason> [duration])`);
                    LoggerService.log('info', `  ${colors.cyan('remove')} - Unban a player (usage: /ban remove <username>)`);
                    LoggerService.log('info', `  ${colors.cyan('info')}   - View ban details (usage: /ban info <username>)`);
                    LoggerService.log('info', `  ${colors.cyan('list')}   - List all banned players`);
                    LoggerService.log('info', '');
                    LoggerService.log('info', 'Duration formats: 2h (hours), 7d (days), 1m (months)');
                    LoggerService.log('info', 'Omit duration for permanent ban');
                    break;
            }
        });
        
        this.register('/admin', async (args) => {
            const subCommand = args[0]?.toLowerCase();

            const ROLES = { PLAYER: 0, MODERATOR: 1, DEVELOPER: 2, ADMIN: 3, OWNER: 4 };
            const ROLE_NAMES = { 0: null, 1: "[MODERATOR]", 2: "[DEVELOPER]", 3: "[ADMIN]", 4: "[OWNER]" };
            const ROLE_COLORS = { 0: null, 1: colors.yellow, 2: colors.cyan, 3: colors.red, 4: colors.magenta };

            switch (subCommand) {
                case 'set':
                    if (args.length < 3) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/admin set <username> <role>')}`);
                        LoggerService.log('info', 'Available roles:');
                        LoggerService.log('info', `  0 - Player (no prefix)`);
                        LoggerService.log('info', `  1 - Moderator ${colors.yellow('[MODERATOR]')}`);
                        LoggerService.log('info', `  2 - Developer ${colors.cyan('[DEVELOPER]')}`);
                        LoggerService.log('info', `  3 - Admin ${colors.red('[ADMIN]')}`);
                        LoggerService.log('info', `  4 - Owner ${colors.magenta('[OWNER]')}`);
                        return;
                    }

                    try {
                        const username = args[1];
                        const roleInput = args[2].toLowerCase();

                        const account = await DatabaseManager.getAccountByDisplayName(username);
                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }

                        const roleMap = { 'player': 0, 'mod': 1, 'moderator': 1, 'dev': 2, 'developer': 2, 'admin': 3, 'owner': 4 };
                        let roleId = !isNaN(roleInput) ? parseInt(roleInput) : roleMap[roleInput];

                        if (roleId === undefined || roleId < 0 || roleId > 4) {
                            LoggerService.log('error', 'Invalid role. Use 0-4 or role name (player, mod, dev, admin, owner)');
                            return;
                        }

                        await DatabaseManager.updateAccountRole(account.accountId, roleId);

                        const roleName = Object.keys(ROLES).find(key => ROLES[key] === roleId);
                        const rolePrefix = ROLE_NAMES[roleId];

                        if (roleId === 0) {
                            LoggerService.log('success', `Player "${username}" is now a regular player`);
                        } else {
                            const colorFunc = ROLE_COLORS[roleId];
                            const displayRole = colorFunc ? colorFunc(rolePrefix) : rolePrefix;
                            LoggerService.log('success', `Player "${username}" is now ${roleName} ${displayRole}`);
                        }

                    } catch (error) {
                        LoggerService.log('error', `Failed to set role: ${error.message}`);
                    }
                    break;

                case 'list':
                    try {
                        const allAccounts = await DatabaseManager.getAllAccounts();
                        const staffAccounts = allAccounts.filter(account => (account.clientType || 0) > 0);

                        if (staffAccounts.length === 0) {
                            LoggerService.log('info', 'No staff members found');
                            return;
                        }

                        LoggerService.log('info', `Found ${colors.cyan(staffAccounts.length)} staff member(s):`);

                        const groupedByRole = {};
                        staffAccounts.forEach(account => {
                            const roleId = account.clientType || 0;
                            if (!groupedByRole[roleId]) groupedByRole[roleId] = [];
                            groupedByRole[roleId].push(account);
                        });

                        [ROLES.OWNER, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.MODERATOR].forEach(roleId => {
                            if (groupedByRole[roleId]) {
                                const rolePrefix = ROLE_NAMES[roleId];
                                const colorFunc = ROLE_COLORS[roleId];
                                const displayRole = colorFunc ? colorFunc(rolePrefix) : rolePrefix;

                                LoggerService.log('info', `\n${displayRole} (${groupedByRole[roleId].length}):`);
                                groupedByRole[roleId].forEach((account, index) => {
                                    LoggerService.log('info', `  ${index + 1}. ${colors.cyan(account.displayName)}`);
                                });
                            }
                        });

                    } catch (error) {
                        LoggerService.log('error', `Failed to list staff: ${error.message}`);
                    }
                    break;

                case 'ban':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/admin ban <username> [reason]')}`);
                        return;
                    }

                    try {
                        const username = args[1];
                        const reason = args.slice(2).join(' ') || null;

                        const account = await DatabaseManager.getAccountByDisplayName(username);
                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }

                        await DatabaseManager.setBanStatus(account.accountId, true, reason);
                        LoggerService.log('success', `Player "${username}" has been ${colors.red('BANNED')}${reason ? ': ' + reason : ''}`);

                    } catch (error) {
                        LoggerService.log('error', `Failed to ban player: ${error.message}`);
                    }
                    break;

                case 'unban':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/admin unban <username>')}`);
                        return;
                    }

                    try {
                        const username = args[1];

                        const account = await DatabaseManager.getAccountByDisplayName(username);
                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }

                        await DatabaseManager.setBanStatus(account.accountId, false);
                        LoggerService.log('success', `Player "${username}" has been ${colors.green('UNBANNED')}`);

                    } catch (error) {
                        LoggerService.log('error', `Failed to unban player: ${error.message}`);
                    }
                    break;

                case 'info':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/admin info <username>')}`);
                        return;
                    }

                    try {
                        const username = args[1];

                        const account = await DatabaseManager.getAccountByDisplayName(username);
                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }

                        const roleId = account.clientType || 0;
                        const roleName = DatabaseManager.getRoleName(roleId);
                        const rolePrefix = ROLE_NAMES[roleId];
                        const colorFunc = ROLE_COLORS[roleId];

                        LoggerService.log('info', `\nPlayer Info: ${colors.cyan(account.displayName)}`);
                        LoggerService.log('info', `  Account ID: ${account.accountId}`);
                        LoggerService.log('info', `  Email: ${account.email || 'N/A'}`);
                        LoggerService.log('info', `  Role: ${rolePrefix ? (colorFunc ? colorFunc(rolePrefix) : rolePrefix) : 'Player'} (${roleName})`);
                        LoggerService.log('info', `  Banned: ${account.banned ? colors.red('Yes') : colors.green('No')}`);
                        if (account.banned && account.banReasons?.length > 0) {
                            LoggerService.log('info', `  Ban Reason: ${account.banReasons.join(', ')}`);
                        }
                        LoggerService.log('info', `  Created: ${account.created || 'Unknown'}`);
                        LoggerService.log('info', `  Last Login: ${account.lastLogin || 'Never'}`);

                    } catch (error) {
                        LoggerService.log('error', `Failed to get player info: ${error.message}`);
                    }
                    break;

                default:
                    LoggerService.log('info', `Usage: ${colors.cyan('/admin <subcommand>')}`);
                    LoggerService.log('info', 'Subcommands:');
                    LoggerService.log('info', `  ${colors.cyan('set <user> <role>')}  - Set a player's role`);
                    LoggerService.log('info', `  ${colors.cyan('list')}               - List all staff members`);
                    LoggerService.log('info', `  ${colors.cyan('ban <user> [reason]')}- Ban a player`);
                    LoggerService.log('info', `  ${colors.cyan('unban <user>')}       - Unban a player`);
                    LoggerService.log('info', `  ${colors.cyan('info <user>')}        - View player information`);
                    break;
            }
        });
        
        this.register('/backup', async (args) => {
            const subCommand = args[0]?.toLowerCase();
        
            switch (subCommand) {
                case 'create':
                    try {
                        LoggerService.log('info', 'Creating manual backup...');
                        const backupInfo = await BackupManager.createBackup(true);
                        const sizeMB = (backupInfo.size / 1024 / 1024).toFixed(2);
                        LoggerService.log('success', `Backup created: ${backupInfo.name} (${backupInfo.fileCount} files, ${sizeMB} MB)`);
                    } catch (error) {
                        LoggerService.log('error', `Failed to create backup: ${error.message}`);
                    }
                    break;
        
                case 'list':
                    try {
                        const backups = await BackupManager.listBackups();
                        if (backups.length === 0) {
                            LoggerService.log('info', 'No backups found');
                        } else {
                            LoggerService.log('info', `Found ${colors.cyan(backups.length)} backup(s):`);
                            backups.forEach((backup, index) => {
                                const sizeMB = (backup.size / 1024 / 1024).toFixed(2);
                                const date = new Date(backup.timestamp).toLocaleString();
                                const status = backup.name === backups[0].name ? colors.green('(LATEST)') : '';
                                LoggerService.log('info', 
                                    `${index + 1}. ${colors.cyan(backup.name)} ${status}`
                                );
                                LoggerService.log('info', `     Size: ${colors.green(sizeMB + ' MB')} | Files: ${colors.cyan(backup.fileCount)} | Date: ${colors.gray(date)}`);
                            });
                        }
                    } catch (error) {
                        LoggerService.log('error', `Failed to list backups: ${error.message}`);
                    }
                    break;
        
                case 'stats':
                    try {
                        const stats = await BackupManager.getBackupStats();
                        LoggerService.log('info', 'Backup Statistics:');
                        LoggerService.log('info', `- Total backups: ${colors.cyan(stats.totalBackups)}`);
                        LoggerService.log('info', `- Total size: ${colors.green(stats.totalSizeMB + ' MB')}`);
                        LoggerService.log('info', `- Backup expiry: ${colors.cyan(stats.expiryDays + ' days')}`);
                        LoggerService.log('info', `- Auto backup interval: ${colors.cyan(ConfigManager.get('databaseBackupInterval') + ' minutes')}`);
                        LoggerService.log('info', `- Next backup: ${colors.cyan(stats.nextBackup ? new Date(stats.nextBackup).toLocaleString() : 'N/A')}`);
                        LoggerService.log('info', `- System status: ${stats.isRunning ? colors.yellow('Backup in progress...') : colors.green('Idle')}`);
                    } catch (error) {
                        LoggerService.log('error', `Failed to get backup stats: ${error.message}`);
                    }
                    break;
        
                case 'cleanup':
                    try {
                        LoggerService.log('info', 'Cleaning up old backups...');
                        await BackupManager.cleanupOldBackups();
                        LoggerService.log('success', 'Backup cleanup completed');
                    } catch (error) {
                        LoggerService.log('error', `Failed to cleanup backups: ${error.message}`);
                    }
                    break;
        
                case 'restore':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/backup restore <backup-name>')}`);
                        LoggerService.log('info', 'Use "/backup list" to see available backups');
                        return;
                    }
                    
                    const backupName = args[1];
                    try {
                        const backups = await BackupManager.listBackups();
                        const backupExists = backups.some(backup => backup.name === backupName);
                        
                        if (!backupExists) {
                            LoggerService.log('error', `Backup "${backupName}" not found`);
                            return;
                        }
        
                        LoggerService.log('warn', `WARNING: You are about to restore backup: ${colors.red(backupName)}`);
                        LoggerService.log('warn', 'This will OVERWRITE all current data with the backup data!');
                        LoggerService.log('warn', 'The server will need to be restarted after restoration.');
                        LoggerService.log('warn', `Type ${colors.cyan('/confirm restore')} to confirm or anything else to cancel.`);
                        
                        this.pendingRestore = backupName;
                        
                    } catch (error) {
                        LoggerService.log('error', `Failed to prepare restore: ${error.message}`);
                    }
                    break;
        
                case 'delete':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/backup delete <backup-name>')}`);
                        LoggerService.log('info', 'Use "/backup list" to see available backups');
                        return;
                    }
                    
                    const backupToDelete = args[1];
                    try {
                        const backups = await BackupManager.listBackups();
                        const backupExists = backups.some(backup => backup.name === backupToDelete);
                        
                        if (!backupExists) {
                            LoggerService.log('error', `Backup "${backupToDelete}" not found`);
                            return;
                        }
        
                        LoggerService.log('warn', `You are about to delete backup: ${colors.red(backupToDelete)}`);
                        LoggerService.log('warn', 'This action cannot be undone!');
                        LoggerService.log('warn', `Type ${colors.cyan('/confirm delete')} to confirm or anything else to cancel.`);
                        
                        this.pendingDelete = backupToDelete;
                        
                    } catch (error) {
                        LoggerService.log('error', `Failed to prepare delete: ${error.message}`);
                    }
                    break;
        
                default:
                    LoggerService.log('info', `Usage: ${colors.cyan('/backup <create|list|stats|restore|delete|cleanup>')}`);
                    LoggerService.log('info', 'Subcommands:');
                    LoggerService.log('info', `  ${colors.cyan('create')}   - Create a manual backup`);
                    LoggerService.log('info', `  ${colors.cyan('list')}     - List all available backups`);
                    LoggerService.log('info', `  ${colors.cyan('stats')}    - Show backup system statistics`);
                    LoggerService.log('info', `  ${colors.cyan('restore')}  - Restore a backup (requires confirmation)`);
                    LoggerService.log('info', `  ${colors.cyan('delete')}   - Delete a backup (requires confirmation)`);
                    LoggerService.log('info', `  ${colors.cyan('cleanup')}  - Force cleanup of old backups`);
                    break;
            }
        });
        
        this.register('/confirm', async (args) => {
            const action = args[0]?.toLowerCase();
        
            switch (action) {
                case 'restore':
                    if (!this.pendingRestore) {
                        LoggerService.log('error', 'No pending restore operation. Use "/backup restore <name>" first.');
                        return;
                    }
        
                    try {
                        LoggerService.log('info', `Starting restore from backup: ${this.pendingRestore}`);
                        await BackupManager.restoreBackup(this.pendingRestore);
                        
                        LoggerService.log('success', `Backup ${this.pendingRestore} restored successfully!`);
                        LoggerService.log('warn', 'Server restart required to apply changes.');
                        LoggerService.log('info', 'Use "/stop" to shutdown the server, then restart it.');
                        
                        this.pendingRestore = null;
                    } catch (error) {
                        LoggerService.log('error', `Restore failed: ${error.message}`);
                        this.pendingRestore = null;
                    }
                    break;
        
                case 'delete':
                    if (!this.pendingDelete) {
                        LoggerService.log('error', 'No pending delete operation. Use "/backup delete <name>" first.');
                        return;
                    }
        
                    try {
                        const backupsDir = path.join(process.cwd(), 'backups', this.pendingDelete);
                        await fs.remove(backupsDir);
                        
                        LoggerService.log('success', `Backup ${this.pendingDelete} deleted successfully!`);
                        this.pendingDelete = null;
                    } catch (error) {
                        LoggerService.log('error', `Delete failed: ${error.message}`);
                        this.pendingDelete = null;
                    }
                    break;
        
                default:
                    LoggerService.log('info', 'Available confirmations:');
                    LoggerService.log('info', `  ${colors.cyan('/confirm restore')} - Confirm backup restoration`);
                    LoggerService.log('info', `  ${colors.cyan('/confirm delete')}  - Confirm backup deletion`);
                    break;
            }
        });
        
        this.register('/cancel', async (args) => {
            if (this.pendingRestore) {
                LoggerService.log('info', `Cancelled pending restore: ${this.pendingRestore}`);
                this.pendingRestore = null;
            } else if (this.pendingDelete) {
                LoggerService.log('info', `Cancelled pending delete: ${this.pendingDelete}`);
                this.pendingDelete = null;
            } else {
                LoggerService.log('info', 'No pending operations to cancel');
            }
        });

        this.register('/tokens', async (args) => {
            const subCommand = args[0]?.toLowerCase();

            switch (subCommand) {
                case 'stats':
                    try {
                        const stats = TokenService.getTokenStats();
                        LoggerService.log('info', 'Token Statistics:');
                        LoggerService.log('info', `  Access tokens: ${colors.cyan(stats.accessTokens)}`);
                        LoggerService.log('info', `  Refresh tokens: ${colors.cyan(stats.refreshTokens)}`);
                        LoggerService.log('info', `  Client tokens: ${colors.cyan(stats.clientTokens)}`);
                        LoggerService.log('info', `  Total: ${colors.green(stats.total)}`);
                    } catch (error) {
                        LoggerService.log('error', `Failed to get token stats: ${error.message}`);
                    }
                    break;

                case 'cleanup':
                    try {
                        LoggerService.log('info', 'Cleaning up expired tokens...');
                        TokenService.cleanupExpiredTokens();
                        const stats = TokenService.getTokenStats();
                        LoggerService.log('success', `Cleanup complete. Remaining tokens: ${stats.total}`);
                    } catch (error) {
                        LoggerService.log('error', `Failed to cleanup tokens: ${error.message}`);
                    }
                    break;

                case 'revoke':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/tokens revoke <username|all>')}`);
                        return;
                    }

                    try {
                        if (args[1].toLowerCase() === 'all') {
                            const count = TokenService.revokeAllTokens();
                            LoggerService.log('success', `Revoked all ${count} tokens`);
                        } else {
                            const username = args[1];
                            const account = await DatabaseManager.getAccountByDisplayName(username);

                            if (!account) {
                                LoggerService.log('error', `Player "${username}" not found`);
                                return;
                            }

                            TokenService.removeAllTokensForAccount(account.accountId);
                            LoggerService.log('success', `Revoked all tokens for "${username}"`);
                        }
                    } catch (error) {
                        LoggerService.log('error', `Failed to revoke tokens: ${error.message}`);
                    }
                    break;

                case 'user':
                    if (args.length < 2) {
                        LoggerService.log('info', `Usage: ${colors.cyan('/tokens user <username>')}`);
                        return;
                    }

                    try {
                        const username = args[1];
                        const account = await DatabaseManager.getAccountByDisplayName(username);

                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }

                        const userTokens = TokenService.getTokensForAccount(account.accountId);
                        LoggerService.log('info', `Tokens for "${username}":`);
                        LoggerService.log('info', `  Access tokens: ${colors.cyan(userTokens.accessTokens.length)}`);
                        LoggerService.log('info', `  Refresh tokens: ${colors.cyan(userTokens.refreshTokens.length)}`);
                    } catch (error) {
                        LoggerService.log('error', `Failed to get user tokens: ${error.message}`);
                    }
                    break;

                default:
                    LoggerService.log('info', `Usage: ${colors.cyan('/tokens <stats|cleanup|revoke|user>')}`);
                    LoggerService.log('info', 'Subcommands:');
                    LoggerService.log('info', `  ${colors.cyan('stats')}   - Show token statistics`);
                    LoggerService.log('info', `  ${colors.cyan('cleanup')} - Clean up expired tokens`);
                    LoggerService.log('info', `  ${colors.cyan('revoke')}  - Revoke tokens (usage: /tokens revoke <username|all>)`);
                    LoggerService.log('info', `  ${colors.cyan('user')}    - Show user's tokens (usage: /tokens user <username>)`);
                    break;
            }
        });

        this.register('/health', async () => {
            try {
                const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
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

        this.register('/ready', async () => {
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

        this.register('/unlock', async (args) => {
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
}

module.exports = CommandManager;
