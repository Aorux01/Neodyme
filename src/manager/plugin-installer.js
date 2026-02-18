const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const LoggerService = require('../service/logger/logger-service');
const colors = require('../utils/colors');

class PluginInstaller {
    static PLUGINS_STORE_URL = 'https://raw.githubusercontent.com/Aorux01/Neodyme-Plugins/refs/heads/main/data/plugins.json';
    static pluginsCache = null;
    static lastCacheFetch = null;
    static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    static async fetchWithProgress(url, onProgress = null) {
        return new Promise((resolve, reject) => {
            https.get(url, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return this.fetchWithProgress(response.headers.location, onProgress)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                }

                const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                let downloadedSize = 0;
                const chunks = [];

                response.on('data', (chunk) => {
                    chunks.push(chunk);
                    downloadedSize += chunk.length;

                    if (onProgress && totalSize > 0) {
                        const progress = Math.round((downloadedSize / totalSize) * 100);
                        onProgress(progress, downloadedSize, totalSize);
                    }
                });

                response.on('end', () => {
                    const data = Buffer.concat(chunks).toString('utf8');
                    resolve(data);
                });

                response.on('error', reject);
            }).on('error', reject);
        });
    }

    static async fetchPluginsList(forceRefresh = false) {
        const now = Date.now();

        if (!forceRefresh && this.pluginsCache && this.lastCacheFetch && (now - this.lastCacheFetch < this.CACHE_DURATION)) {
            return this.pluginsCache;
        }

        try {
            const data = await this.fetchWithProgress(this.PLUGINS_STORE_URL);
            this.pluginsCache = JSON.parse(data);
            this.lastCacheFetch = now;
            return this.pluginsCache;
        } catch (error) {
            throw new Error(`Failed to fetch plugins list: ${error.message}`);
        }
    }

    static async searchPlugins(query) {
        const pluginsList = await this.fetchPluginsList();
        const searchLower = query.toLowerCase();

        return pluginsList.plugins.filter(plugin => {
            return plugin.name.toLowerCase().includes(searchLower) ||
                   plugin.description.toLowerCase().includes(searchLower) ||
                   plugin.author.toLowerCase().includes(searchLower) ||
                   plugin.tags?.some(tag => tag.toLowerCase().includes(searchLower));
        });
    }

    static async getPluginById(pluginId) {
        const pluginsList = await this.fetchPluginsList();
        return pluginsList.plugins.find(p => p.id === pluginId);
    }

    static async fetchPluginManifest(manifestUrl) {
        try {
            const data = await this.fetchWithProgress(manifestUrl);
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to fetch plugin manifest: ${error.message}`);
        }
    }

    static async downloadFile(fileUrl, destinationPath, onProgress = null) {
        const dir = path.dirname(destinationPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const content = await this.fetchWithProgress(fileUrl, onProgress);
        fs.writeFileSync(destinationPath, content, 'utf8');
    }

    static async installNpmDependencies(dependencies) {
        if (!dependencies || dependencies.length === 0) {
            return true;
        }

        return new Promise((resolve, reject) => {
            LoggerService.log('info', `Installing npm dependencies: ${dependencies.join(', ')}`);

            const isWindows = process.platform === 'win32';
            const npm = isWindows ? 'npm' : 'npm';
            const child = spawn(npm, ['install', '--save', ...dependencies], {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true  // Important pour Windows
            });

            let output = '';
            let errorOutput = '';

            child.stdout.on('data', (data) => {
                output += data.toString();
                // Show npm progress
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        LoggerService.log('info', `  ${colors.gray(line.trim())}`);
                    }
                });
            });

            child.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    LoggerService.log('success', 'Dependencies installed successfully');
                    resolve(true);
                } else {
                    LoggerService.log('error', `npm install failed with code ${code}`);
                    if (errorOutput) {
                        const errorLines = errorOutput.split('\n').filter(line => line.trim());
                        errorLines.slice(0, 5).forEach(line => {
                            LoggerService.log('error', `  ${line.trim()}`);
                        });
                    }
                    reject(new Error(`npm install failed with code ${code}`));
                }
            });

            child.on('error', (error) => {
                LoggerService.log('error', `Failed to run npm: ${error.message}`);
                LoggerService.log('error', 'Make sure npm is installed and accessible in your PATH');
                LoggerService.log('error', 'Try running "npm --version" in your terminal to verify');
                reject(error);
            });
        });
    }

    static isPluginInstalled(pluginId) {
        const pluginsDir = path.join(process.cwd(), 'plugins');
        const pluginDir = path.join(pluginsDir, pluginId);
        return fs.existsSync(pluginDir);
    }

    static async installPlugin(pluginId, PluginManager) {
        try {
            // Get plugin info from store
            const pluginInfo = await this.getPluginById(pluginId);
            if (!pluginInfo) {
                throw new Error(`Plugin '${pluginId}' not found in store`);
            }

            LoggerService.log('info', `Installing plugin: ${colors.cyan(pluginInfo.name)} v${pluginInfo.version}`);
            LoggerService.log('info', `Author: ${pluginInfo.author}`);
            LoggerService.log('info', `Description: ${pluginInfo.description}`);

            // Check if already installed
            if (this.isPluginInstalled(pluginId)) {
                LoggerService.log('warn', `Plugin '${pluginId}' is already installed. Use '/plugins store update ${pluginId}' to update.`);
                return false;
            }

            // Fetch plugin manifest
            LoggerService.log('info', 'Fetching plugin manifest...');
            const manifest = await this.fetchPluginManifest(pluginInfo.manifestUrl);

            // Check backend version compatibility
            const backendVersion = PluginManager.getBackendVersion();
            if (manifest.minBackendVersion) {
                if (!PluginManager.isVersionCompatible(manifest.minBackendVersion, backendVersion)) {
                    throw new Error(`Plugin requires backend version ${manifest.minBackendVersion} or higher (current: ${backendVersion})`);
                }
            }

            const pluginsDir = path.join(process.cwd(), 'plugins');
            const totalFiles = manifest.files.length;
            let downloadedFiles = 0;

            LoggerService.log('info', `Downloading ${totalFiles} file(s)...`);

            // Download all files
            for (const file of manifest.files) {
                const destinationPath = path.join(pluginsDir, file.path);
                const fileName = path.basename(file.path);

                let lastProgress = 0;
                await this.downloadFile(file.url, destinationPath, (progress, downloaded, total) => {
                    if (progress >= lastProgress + 10 || progress === 100) {
                        const bar = this.createProgressBar(progress, 30);
                        const sizeStr = this.formatBytes(downloaded) + ' / ' + this.formatBytes(total);
                        process.stdout.write(`\r  ${colors.cyan(fileName)}: ${bar} ${progress}% (${sizeStr})`);
                        lastProgress = progress;
                    }
                });

                downloadedFiles++;
                process.stdout.write('\n'); // New line after progress bar
                LoggerService.log('success', `  ✓ Downloaded: ${fileName} (${downloadedFiles}/${totalFiles})`);
            }

            // Install npm dependencies if any
            if (manifest.dependencies?.npm && manifest.dependencies.npm.length > 0) {
                LoggerService.log('info', 'Installing npm dependencies...');
                await this.installNpmDependencies(manifest.dependencies.npm);
            }

            // Load the plugin
            LoggerService.log('info', 'Loading plugin...');
            const loadSuccess = await PluginManager.loadPlugin(pluginId);

            if (loadSuccess) {
                LoggerService.log('success', `✓ Plugin '${colors.cyan(pluginInfo.name)}' installed and loaded successfully!`);
                return true;
            } else {
                LoggerService.log('error', `Plugin files downloaded but failed to load. Check the plugin structure.`);
                return false;
            }

        } catch (error) {
            LoggerService.log('error', `Failed to install plugin: ${error.message}`);
            return false;
        }
    }

    /**
     * Uninstall a plugin
     */
    static async uninstallPlugin(pluginId, PluginManager) {
        try {
            if (!this.isPluginInstalled(pluginId)) {
                LoggerService.log('error', `Plugin '${pluginId}' is not installed`);
                return false;
            }

            // Unload plugin if loaded
            const plugin = PluginManager.getPlugin(pluginId);
            if (plugin) {
                LoggerService.log('info', 'Unloading plugin...');
                await PluginManager.unloadPlugin(pluginId);
            }

            // Delete plugin directory
            const pluginsDir = path.join(process.cwd(), 'plugins');
            const pluginDir = path.join(pluginsDir, pluginId);

            this.deleteFolderRecursive(pluginDir);
            LoggerService.log('success', `Plugin '${pluginId}' uninstalled successfully`);
            return true;

        } catch (error) {
            LoggerService.log('error', `Failed to uninstall plugin: ${error.message}`);
            return false;
        }
    }

    /**
     * Delete folder recursively
     */
    static deleteFolderRecursive(folderPath) {
        if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach((file) => {
                const curPath = path.join(folderPath, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    this.deleteFolderRecursive(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(folderPath);
        }
    }

    /**
     * Create a progress bar string
     */
    static createProgressBar(percentage, length = 30) {
        const filled = Math.round((percentage / 100) * length);
        const empty = length - filled;
        return colors.green('█'.repeat(filled)) + colors.gray('░'.repeat(empty));
    }

    /**
     * Format bytes to human readable
     */
    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Update a plugin
     */
    static async updatePlugin(pluginId, PluginManager) {
        try {
            if (!this.isPluginInstalled(pluginId)) {
                LoggerService.log('error', `Plugin '${pluginId}' is not installed`);
                return false;
            }

            LoggerService.log('info', `Updating plugin: ${pluginId}`);

            // Uninstall old version
            await this.uninstallPlugin(pluginId, PluginManager);

            // Install new version
            return await this.installPlugin(pluginId, PluginManager);

        } catch (error) {
            LoggerService.log('error', `Failed to update plugin: ${error.message}`);
            return false;
        }
    }
}

module.exports = PluginInstaller;
