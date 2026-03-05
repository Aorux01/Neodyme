const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const PluginManager = require('../manager/plugin-manager');
const PluginInstaller = require('../manager/plugin-installer');

function register(CM) {
    CM.register('/plugins', async (args) => {
        const subCommand = args[0]?.toLowerCase();
        const pluginName = args[1];

        switch (subCommand) {
            case 'store':
                const storeCmd = args[1]?.toLowerCase();
                const storeArg = args[2];

                switch (storeCmd) {
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
}

module.exports = { register };
