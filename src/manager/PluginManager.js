const fs = require('fs');
const path = require('path');

const LoggerService = require('../service/logger/LoggerService');
const ConfigManager = require('./ConfigManager');

class PluginManager {
    static async load() {
        const pluginsDir = path.join(__dirname, '..', '..', 'plugins');
        if (!fs.existsSync(pluginsDir)) {
            LoggerService.log('warn', 'Plugins directory does not exist. Skipping plugin loading.');
            fs.mkdirSync(pluginsDir, {recursive: true});
            LoggerService.log('info', 'Created plugins directory.');
            return;
        }

        const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
        this.plugins = [];

        try {
            for (const file of files) {
                const pluginPath = path.join(pluginsDir, file);
                delete require.cache[require.resolve(pluginPath)];
                const PluginClass = require(pluginPath);
                const plugin = new PluginClass();

                if (plugin.name && plugin.init) {
                    const success = await plugin.init(this);
                    if (success) {
                        this.plugins.push(plugin);
                        LoggerService.log('success', `Loaded plugin: ${plugin.name} v${plugin.version || '1.0.0'}`);
                        if (ConfigManager.get('discordBot')) {
                            LoggerService.log('info', `Plugin ${plugin.name} initialized with Discord bot support.`);
                        }
                        if (ConfigManager.get('discordWebhook')) {
                            LoggerService.log('info', `Plugin ${plugin.name} initialized with Discord Webhook support.`);
                        }
                    } else {
                        LoggerService.log('error', `Failed to initialize plugin: ${plugin.name}`);
                    }
                } else {
                    LoggerService.log('error', `Invalid plugin structure in file (invalid format): ${file}`);
                }
            }

            if (this.plugins.length === 0) {
                LoggerService.log('info', 'No plugin load.');
            }
            else {
                LoggerService.log('success', `Total plugins loaded: ${this.plugins.length}`);
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load plugins: ${error.message}`);
        }
    }

    static async loadPlugin(pluginName) {
        const pluginsDir = path.join(__dirname, '..', '..', 'plugins');
        const pluginFile = `${pluginName}.js`;
        const pluginPath = path.join(pluginsDir, pluginFile);

        if (!fs.existsSync(pluginPath)) {
            LoggerService.log('error', `Plugin file does not exist: ${pluginFile}`);
            return false;
        }

        try {
            delete require.cache[require.resolve(pluginPath)];
            const PluginClass = require(pluginPath);
            const plugin = new PluginClass();

            if (plugin.name && plugin.init) {
                const success = await plugin.init(this);
                if (success) {
                    this.plugins.push(plugin);
                    LoggerService.log('success', `Loaded plugin: ${plugin.name} v${plugin.version || '1.0.0'}`);
                    return true;
                } else {
                    LoggerService.log('error', `Failed to initialize plugin: ${plugin.name}`);
                    return false;
                }
            } else {
                LoggerService.log('error', `Invalid plugin structure in file (invalid format): ${pluginFile}`);
                return false;
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load plugin ${pluginFile}: ${error.message}`);
            return false;
        }
    }

    static async reloadPlugin(pluginName) {
        const pluginIndex = this.plugins.findIndex(p => p.name === pluginName);
        if (pluginIndex === -1) {
            LoggerService.log('error', `Plugin not found: ${pluginName}`);
            return false;
        }

        const plugin = this.plugins[pluginIndex];
        if (plugin.shutdown) {
            try {
                await plugin.shutdown();
                LoggerService.log('info', `Unloaded plugin: ${plugin.name}`);
            } catch (error) {
                LoggerService.log('error', `Error unloading plugin ${plugin.name}: ${error.message}`);
            }
        }

        this.plugins.splice(pluginIndex, 1);
        return await this.loadPlugin(pluginName);
    }

    static async reload() {
        await this.unload();
        await this.load();
    }

    static getPlugins() {
        return this.plugins || [];
    }

    static async unload() {
        if (this.plugins && this.plugins.length > 0) {
            for (const plugin of this.plugins) {
                if (plugin.shutdown) {
                    try {
                        await plugin.shutdown();
                        LoggerService.log('info', `Unloaded plugin: ${plugin.name}`);
                    } catch (error) {
                        LoggerService.log('error', `Error unloading plugin ${plugin.name}: ${error.message}`);
                    }
                }
            }
            this.plugins = [];
        }
    }

    static async unloadAll() {
        await this.unload();
    }
}

module.exports = PluginManager;