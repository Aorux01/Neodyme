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

                    if (onProgress) {
                        // Always emit chunk delta; totalSize may be 0 (unknown).
                        // Callers handle global aggregation themselves.
                        onProgress(chunk.length, downloadedSize, totalSize);
                    }
                });

                response.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });

                response.on('error', reject);
            }).on('error', reject);
        });
    }

    /**
     * Convenience wrapper for callers that want a UTF-8 string
     * (e.g. JSON manifests). Don't use this for images / binaries.
     */
    static async fetchTextWithProgress(url, onProgress = null) {
        const buf = await this.fetchWithProgress(url, onProgress);
        return buf.toString('utf8');
    }

    static async headContentLength(url) {
        return new Promise((resolve) => {
            try {
                const req = https.request(url, { method: 'HEAD' }, (response) => {
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        return this.headContentLength(response.headers.location).then(resolve);
                    }
                    const len = parseInt(response.headers['content-length'] || '0', 10);
                    resolve(Number.isFinite(len) ? len : 0);
                });
                req.on('error', () => resolve(0));
                req.end();
            } catch (_) {
                resolve(0);
            }
        });
    }

    static async fetchPluginsList(forceRefresh = false) {
        const now = Date.now();

        if (!forceRefresh && this.pluginsCache && this.lastCacheFetch && (now - this.lastCacheFetch < this.CACHE_DURATION)) {
            return this.pluginsCache;
        }

        try {
            const data = await this.fetchTextWithProgress(this.PLUGINS_STORE_URL);
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
            const data = await this.fetchTextWithProgress(manifestUrl);
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to fetch plugin manifest: ${error.message}`);
        }
    }

    static compareVersions(a, b) {
        const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
        const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const ai = pa[i] || 0, bi = pb[i] || 0;
            if (ai > bi) return 1;
            if (ai < bi) return -1;
        }
        return 0;
    }

    static resolveBestVersion(manifest, backendVersion, requestedVersion = null) {
        // ---- 1) New schema: `versions` object ----
        if (manifest.versions && typeof manifest.versions === 'object' && !Array.isArray(manifest.versions)) {
            const all = Object.entries(manifest.versions)
                .map(([v, payload]) => ({
                    version: v,
                    minBackendVersion: payload.minBackendVersion || manifest.minBackendVersion || '0.0.0',
                    files: payload.files || [],
                    totalSize: typeof payload.totalSize === 'number' ? payload.totalSize : 0
                }))
                .sort((a, b) => this.compareVersions(b.version, a.version)); // newest first

            if (all.length === 0) {
                throw new Error('Plugin manifest has no versions declared');
            }

            if (requestedVersion) {
                const exact = all.find(v => v.version === requestedVersion);
                if (!exact) {
                    const available = all.map(v => v.version).join(', ');
                    throw new Error(`Version '${requestedVersion}' does not exist. Available: ${available}`);
                }
                if (this.compareVersions(backendVersion, exact.minBackendVersion) < 0) {
                    throw new Error(
                        `Plugin version ${requestedVersion} requires backend ${exact.minBackendVersion} or higher (current: ${backendVersion})`
                    );
                }
                return exact;
            }

            const compatible = all.find(v => this.compareVersions(backendVersion, v.minBackendVersion) >= 0);
            if (!compatible) {
                const newest = all[0];
                throw new Error(
                    `No plugin version compatible with backend ${backendVersion}. Newest version ${newest.version} requires ${newest.minBackendVersion}.`
                );
            }
            return compatible;
        }

        // ---- 2) Legacy schema: flat `files[]` with optional per-file `version` ----
        if (Array.isArray(manifest.files) && manifest.files.length > 0) {
            // Group files by their `version` field (or by manifest.version if uniform).
            const byVersion = new Map();
            for (const f of manifest.files) {
                const v = f.version || manifest.version || '1.0.0';
                if (!byVersion.has(v)) byVersion.set(v, []);
                byVersion.get(v).push(f);
            }

            // Pick the highest minBackendVer for each group as its requirement.
            const all = Array.from(byVersion.entries())
                .map(([version, files]) => {
                    const minFromFiles = files.reduce((max, f) => {
                        const cur = f.minBackendVer || manifest.minBackendVersion || '0.0.0';
                        return this.compareVersions(cur, max) > 0 ? cur : max;
                    }, '0.0.0');
                    return {
                        version,
                        minBackendVersion: minFromFiles,
                        files,
                        totalSize: 0
                    };
                })
                .sort((a, b) => this.compareVersions(b.version, a.version));

            if (requestedVersion) {
                const exact = all.find(v => v.version === requestedVersion);
                if (!exact) {
                    const available = all.map(v => v.version).join(', ');
                    throw new Error(`Version '${requestedVersion}' does not exist. Available: ${available}`);
                }
                if (this.compareVersions(backendVersion, exact.minBackendVersion) < 0) {
                    throw new Error(
                        `Plugin version ${requestedVersion} requires backend ${exact.minBackendVersion} or higher (current: ${backendVersion})`
                    );
                }
                return exact;
            }

            const compatible = all.find(v => this.compareVersions(backendVersion, v.minBackendVersion) >= 0);
            if (!compatible) {
                const newest = all[0];
                throw new Error(
                    `No plugin version compatible with backend ${backendVersion}. Newest version ${newest.version} requires ${newest.minBackendVersion}.`
                );
            }
            return compatible;
        }

        throw new Error('Plugin manifest is missing `versions` or `files`');
    }

    static async downloadFile(fileUrl, destinationPath, onProgress = null) {
        const dir = path.dirname(destinationPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write raw bytes — binary-safe (jpg, png, otf, ...).
        // Text files (json, js, md) are also fine: they end up byte-identical to the source.
        const buffer = await this.fetchWithProgress(fileUrl, onProgress);
        fs.writeFileSync(destinationPath, buffer);
    }

    static async downloadFilesWithGlobalProgress(entries, knownTotal, label = 'Download') {
        const totalFiles = entries.length;
        if (totalFiles === 0) return;

        let totalDownloaded = 0;
        let projectedTotal = knownTotal; // grows if real bytes exceed our estimate
        let currentIndex = 0;
        let lastRender = 0;
        const renderEveryMs = 100;

        // Maximum width for the current-file name (basename only) shown after the bar.
        // Long paths are truncated with an ellipsis prefix so the bar layout stays stable.
        const MAX_NAME_LEN = 40;
        const shortenName = (name) => {
            if (!name) return '';
            // Keep only the basename — full paths are noisy.
            const base = name.split(/[\\/]/).pop() || name;
            if (base.length <= MAX_NAME_LEN) return base;
            return '…' + base.slice(-(MAX_NAME_LEN - 1));
        };

        const render = (currentName, force = false) => {
            const now = Date.now();
            if (!force && now - lastRender < renderEveryMs) return;
            lastRender = now;

            // When total is unknown, show indeterminate "?" and only the downloaded count.
            const hasTotal = projectedTotal > 0;
            const pct = hasTotal
                ? Math.min(100, Math.round((totalDownloaded / projectedTotal) * 100))
                : 0;
            const bar = this.createProgressBar(pct, 30);
            const counter = colors.gray(`[${currentIndex}/${totalFiles}]`);
            const sizeStr = hasTotal
                ? `${this.formatBytes(totalDownloaded)} / ${this.formatBytes(projectedTotal)}`
                : `${this.formatBytes(totalDownloaded)}`;
            const pctStr = hasTotal ? `${pct}%`.padStart(4) : ' ...';
            const shortened = shortenName(currentName);
            const nameStr = shortened ? colors.cyan(shortened.padEnd(MAX_NAME_LEN, ' ')) : ''.padEnd(MAX_NAME_LEN, ' ');

            const line = `  ${label} ${counter} ${bar} ${pctStr} (${sizeStr})  ${nameStr}`;
            process.stdout.write(`\r\x1b[2K${line}`);
        };

        for (const entry of entries) {
            currentIndex++;
            render(entry.name, true);

            await this.downloadFile(entry.url, entry.dest, (chunkBytes, _downloadedFile, totalFromHeader) => {
                totalDownloaded += chunkBytes;

                // If the actual bytes go past our estimate (e.g. HEAD lied or wasn't available),
                // grow the projected total so the bar never goes above 100%.
                if (projectedTotal > 0 && totalDownloaded > projectedTotal) {
                    projectedTotal = totalDownloaded;
                }
                // Discover the total lazily when we had no estimate up front.
                if (projectedTotal === 0 && totalFromHeader > 0) {
                    // We don't know the other files' size, so just project on this one.
                    projectedTotal = Math.max(totalDownloaded, totalFromHeader);
                }

                render(entry.name);
            });
        }

        // Final 100% snapshot, then newline.
        if (projectedTotal === 0) projectedTotal = totalDownloaded;
        totalDownloaded = projectedTotal;
        render('', true);
        process.stdout.write('\n');
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

    static async installPlugin(pluginId, PluginManager, opts = {}) {
        const requestedVersion = opts.version || null;
        const trail = opts.trail || new Set();

        if (trail.has(pluginId)) {
            LoggerService.log('warn', `Skipping '${pluginId}' (already in install chain, possible dependency cycle)`);
            return true;
        }
        trail.add(pluginId);

        try {
            const pluginInfo = await this.getPluginById(pluginId);
            if (!pluginInfo) {
                throw new Error(`Plugin '${pluginId}' not found in store`);
            }

            // Fetch plugin manifest
            LoggerService.log('info', 'Fetching plugin manifest...');
            const manifest = await this.fetchPluginManifest(pluginInfo.manifestUrl);

            const backendVersion = PluginManager.getBackendVersion();

            // Pick the version (explicit or best-compatible).
            const resolved = this.resolveBestVersion(manifest, backendVersion, requestedVersion);

            LoggerService.log('info', `Installing plugin: ${colors.cyan(pluginInfo.name)} ${colors.gray('v' + resolved.version)}`);
            LoggerService.log('info', `Author: ${pluginInfo.author}`);
            LoggerService.log('info', `Description: ${pluginInfo.description}`);
            LoggerService.log('info', `Requires backend: ${colors.yellow('>=' + resolved.minBackendVersion)} (current: ${backendVersion})`);

            if (this.isPluginInstalled(pluginId)) {
                LoggerService.log('warn', `Plugin '${pluginId}' is already installed. Use '/plugins store update ${pluginId}' to update.`);
                return false;
            }

            // ---- Resolve plugin-to-plugin dependencies first ----
            const pluginDeps = manifest.dependencies?.plugins || [];
            if (pluginDeps.length > 0) {
                LoggerService.log('info', `Resolving ${pluginDeps.length} plugin dependency(ies)...`);
                for (const dep of pluginDeps) {
                    // Accept either a plain id string or an object { id, version? }.
                    const depId = typeof dep === 'string' ? dep : dep.id;
                    const depVersion = typeof dep === 'object' ? (dep.version || null) : null;

                    if (this.isPluginInstalled(depId)) {
                        LoggerService.log('info', `Dependency '${depId}' already installed`);
                        continue;
                    }

                    LoggerService.log('info', `Installing dependency '${depId}'${depVersion ? ' v' + depVersion : ''}`);
                    const depOk = await this.installPlugin(depId, PluginManager, {
                        version: depVersion,
                        trail,
                        asDependency: true
                    });
                    if (!depOk) {
                        throw new Error(`Failed to install dependency '${depId}'`);
                    }
                }
            }

            // ---- Download files for the resolved version ----
            const pluginsDir = path.join(process.cwd(), 'plugins');
            const totalFiles = resolved.files.length;

            if (totalFiles === 0) {
                throw new Error(`Plugin version ${resolved.version} has no files declared`);
            }

            LoggerService.log('info', `Downloading ${totalFiles} file(s)...`);

            // Resolve total size up front so the global progress bar is accurate.
            // Priority: per-file `size` > resolved.totalSize > manifest.totalSize > HEAD probe > unknown (bar grows live).
            const fileSizes = resolved.files.map(file =>
                (typeof file.size === 'number' && file.size > 0) ? file.size : 0
            );

            let knownTotal = fileSizes.reduce((sum, s) => sum + s, 0);

            if (knownTotal === 0 && resolved.totalSize > 0) {
                knownTotal = resolved.totalSize;
            }
            if (knownTotal === 0 && typeof manifest.totalSize === 'number' && manifest.totalSize > 0) {
                knownTotal = manifest.totalSize;
            }

            if (knownTotal === 0) {
                // No size info in the manifest - probe each file with a HEAD in parallel.
                const probed = await Promise.all(resolved.files.map(file => this.headContentLength(file.url)));
                probed.forEach((size, i) => { if (size > 0) fileSizes[i] = size; });
                knownTotal = probed.reduce((sum, s) => sum + s, 0);
            }

            await this.downloadFilesWithGlobalProgress(
                resolved.files.map((file, i) => ({
                    url: file.url,
                    dest: path.join(pluginsDir, file.path),
                    name: path.basename(file.path),
                    size: fileSizes[i]
                })),
                knownTotal,
                'Plugin'
            );

            LoggerService.log('success', `Downloaded ${totalFiles} file(s)`);

            // Install npm dependencies if any
            if (manifest.dependencies?.npm && manifest.dependencies.npm.length > 0) {
                LoggerService.log('info', 'Installing npm dependencies...');
                await this.installNpmDependencies(manifest.dependencies.npm);
            }

            LoggerService.log('info', 'Loading plugin...');
            const loadSuccess = await PluginManager.loadPlugin(pluginId);

            if (loadSuccess) {
                LoggerService.log('success', `Plugin '${colors.cyan(pluginInfo.name)}' v${resolved.version} installed and loaded successfully!`);
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

    static async uninstallPlugin(pluginId, PluginManager) {
        try {
            if (!this.isPluginInstalled(pluginId)) {
                LoggerService.log('error', `Plugin '${pluginId}' is not installed`);
                return false;
            }

            const plugin = PluginManager.getPlugin(pluginId);
            if (plugin) {
                LoggerService.log('info', 'Unloading plugin...');
                await PluginManager.unloadPlugin(pluginId);
            }

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

    static createProgressBar(percentage, length = 30) {
        const filled = Math.round((percentage / 100) * length);
        const empty = length - filled;
        return colors.green('█'.repeat(filled)) + colors.gray('░'.repeat(empty));
    }

    static formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    static async updatePlugin(pluginId, PluginManager, opts = {}) {
        try {
            if (!this.isPluginInstalled(pluginId)) {
                LoggerService.log('error', `Plugin '${pluginId}' is not installed`);
                return false;
            }

            LoggerService.log('info', `Updating plugin: ${pluginId}${opts.version ? ' -> v' + opts.version : ''}`);

            await this.uninstallPlugin(pluginId, PluginManager);

            return await this.installPlugin(pluginId, PluginManager, { version: opts.version || null });

        } catch (error) {
            LoggerService.log('error', `Failed to update plugin: ${error.message}`);
            return false;
        }
    }
}

module.exports = PluginInstaller;
