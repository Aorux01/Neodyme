const fs = require('fs');
const path = require('path');

const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('./config-manager');

class PluginManager {
    static backendVersion = null;

    static getBackendVersion() {
        if (this.backendVersion) return this.backendVersion;

        try {
            const packagePath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            this.backendVersion = packageJson.version || '1.0.0';
        } catch (error) {
            LoggerService.log('warn', 'Could not read backend version from package.json, defaulting to 1.0.0');
            this.backendVersion = '1.0.0';
        }

        return this.backendVersion;
    }

    static compareVersions(version1, version2) {
        const v1Parts = version1.split('.').map(Number);
        const v2Parts = version2.split('.').map(Number);

        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1 = v1Parts[i] || 0;
            const v2 = v2Parts[i] || 0;

            if (v1 > v2) return 1;
            if (v1 < v2) return -1;
        }

        return 0;
    }

    static isVersionCompatible(minVersion, currentVersion) {
        if (!minVersion) return true;
        return this.compareVersions(currentVersion, minVersion) >= 0;
    }

    static async load() {
        const pluginsDir = path.join(__dirname, '..', '..', 'plugins');
        const backendVersion = this.getBackendVersion();

        LoggerService.log('info', `Backend version: ${backendVersion}`);

        if (!fs.existsSync(pluginsDir)) {
            LoggerService.log('warn', 'Plugins directory does not exist. Skipping plugin loading.');
            fs.mkdirSync(pluginsDir, {recursive: true});
            LoggerService.log('info', 'Created plugins directory.');
            return;
        }

        const pluginPaths = [];
        const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.js')) {
                pluginPaths.push(path.join(pluginsDir, entry.name));
            } else if (entry.isDirectory()) {
                const indexPath = path.join(pluginsDir, entry.name, 'index.js');
                if (fs.existsSync(indexPath)) {
                    pluginPaths.push(indexPath);
                }
            }
        }

        this.plugins = [];

        try {
            for (const pluginPath of pluginPaths) {
                delete require.cache[require.resolve(pluginPath)];
                const PluginClass = require(pluginPath);
                const plugin = new PluginClass();

                if (plugin.name && plugin.init) {
                    // Check version compatibility
                    if (plugin.minBackendVersion) {
                        if (!this.isVersionCompatible(plugin.minBackendVersion, backendVersion)) {
                            LoggerService.log('error', `Plugin ${plugin.name} requires backend version ${plugin.minBackendVersion} or higher (current: ${backendVersion})`);
                            continue;
                        }
                    }

                    // Store plugin path for info command
                    plugin._pluginPath = pluginPath;

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
                    LoggerService.log('error', `Invalid plugin structure in file: ${pluginPath}`);
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
        const backendVersion = this.getBackendVersion();

        // Check for direct .js file
        let pluginPath = path.join(pluginsDir, `${pluginName}.js`);

        // Check for subdirectory with index.js
        if (!fs.existsSync(pluginPath)) {
            pluginPath = path.join(pluginsDir, pluginName, 'index.js');
        }

        if (!fs.existsSync(pluginPath)) {
            LoggerService.log('error', `Plugin not found: ${pluginName}`);
            return false;
        }

        try {
            delete require.cache[require.resolve(pluginPath)];
            const PluginClass = require(pluginPath);
            const plugin = new PluginClass();

            if (plugin.name && plugin.init) {
                // Check version compatibility
                if (plugin.minBackendVersion) {
                    if (!this.isVersionCompatible(plugin.minBackendVersion, backendVersion)) {
                        LoggerService.log('error', `Plugin ${plugin.name} requires backend version ${plugin.minBackendVersion} or higher (current: ${backendVersion})`);
                        return false;
                    }
                }

                plugin._pluginPath = pluginPath;

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
                LoggerService.log('error', `Invalid plugin structure in file: ${pluginName}`);
                return false;
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load plugin ${pluginName}: ${error.message}`);
            return false;
        }
    }

    static async reloadPlugin(pluginName) {
        const pluginIndex = this.plugins.findIndex(p => p.name.toLowerCase() === pluginName.toLowerCase());
        if (pluginIndex === -1) {
            LoggerService.log('error', `Plugin not found: ${pluginName}`);
            return false;
        }

        const plugin = this.plugins[pluginIndex];
        const pluginPath = plugin._pluginPath;

        if (plugin.shutdown) {
            try {
                await plugin.shutdown();
                LoggerService.log('info', `Unloaded plugin: ${plugin.name}`);
            } catch (error) {
                LoggerService.log('error', `Error unloading plugin ${plugin.name}: ${error.message}`);
            }
        }

        this.plugins.splice(pluginIndex, 1);

        // Reload from the stored path
        if (pluginPath) {
            const backendVersion = this.getBackendVersion();

            try {
                delete require.cache[require.resolve(pluginPath)];
                const PluginClass = require(pluginPath);
                const newPlugin = new PluginClass();

                if (newPlugin.minBackendVersion) {
                    if (!this.isVersionCompatible(newPlugin.minBackendVersion, backendVersion)) {
                        LoggerService.log('error', `Plugin ${newPlugin.name} requires backend version ${newPlugin.minBackendVersion} or higher (current: ${backendVersion})`);
                        return false;
                    }
                }

                newPlugin._pluginPath = pluginPath;

                const success = await newPlugin.init(this);
                if (success) {
                    this.plugins.push(newPlugin);
                    LoggerService.log('success', `Reloaded plugin: ${newPlugin.name} v${newPlugin.version || '1.0.0'}`);
                    return true;
                }
            } catch (error) {
                LoggerService.log('error', `Failed to reload plugin: ${error.message}`);
            }
        }

        return false;
    }

    static async reload() {
        await this.unload();
        await this.load();
    }

    static getPlugins() {
        return this.plugins || [];
    }

    static getPlugin(name) {
        if (!this.plugins) return null;
        return this.plugins.find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
    }

    static getPluginInfo(name) {
        const plugin = this.getPlugin(name);
        if (!plugin) return null;

        // Handle dependencies - can be array or object {npm: [], plugins: []}
        let npmDeps = [];
        let pluginDeps = [];

        if (plugin.dependencies) {
            if (Array.isArray(plugin.dependencies)) {
                npmDeps = plugin.dependencies;
            } else if (typeof plugin.dependencies === 'object') {
                npmDeps = plugin.dependencies.npm || [];
                pluginDeps = plugin.dependencies.plugins || [];
            }
        }

        return {
            name: plugin.name,
            version: plugin.version || '1.0.0',
            description: plugin.description || 'No description',
            author: plugin.author || 'Unknown',
            license: plugin.license || 'Unknown',
            repository: plugin.repository || null,
            minBackendVersion: plugin.minBackendVersion || 'Any',
            dependencies: {
                npm: npmDeps,
                plugins: pluginDeps
            },
            path: plugin._pluginPath || 'Unknown',
            homepage: plugin.homepage || null,
            bugs: plugin.bugs || null
        };
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
