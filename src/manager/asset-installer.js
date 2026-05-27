const fs = require('fs');
const path = require('path');
const LoggerService = require('../service/logger/logger-service');
const colors = require('../utils/colors');
const PluginInstaller = require('./plugin-installer');
const AssetService = require('../service/api/asset-service');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

class AssetInstaller {
    static REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/Aorux01/Neodyme-Plugins/refs/heads/main/data/assets.json';

    static remoteManifest = null;
    static lastFetchTime = 0;
    static CACHE_DURATION_MS = 5 * 60 * 1000;

    static async fetchRemoteManifest(forceRefresh = false) {
        const ConfigManager = require('./config-manager');
        const url = ConfigManager.get('assetsManifestUrl', this.REMOTE_MANIFEST_URL);

        const now = Date.now();
        if (!forceRefresh && this.remoteManifest && (now - this.lastFetchTime < this.CACHE_DURATION_MS)) {
            return this.remoteManifest;
        }

        try {
            const data = await PluginInstaller.fetchWithProgress(url);
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed.assets)) {
                throw new Error('Remote manifest does not contain an `assets` array');
            }
            this.remoteManifest = parsed;
            this.lastFetchTime = now;
            return parsed;
        } catch (error) {
            throw new Error(`Failed to fetch remote assets manifest: ${error.message}`);
        }
    }

    static async resolveDownloadList(opts = {}) {
        const remote = await this.fetchRemoteManifest();
        const localIndex = AssetService.loadIndex();
        const remoteByPath = new Map(remote.assets.map(a => [a.path, a]));

        // The local index is the source of truth for which assets are "owned" by Neodyme.
        // We only download what is in BOTH the local index and the remote manifest.
        const candidates = [];
        for (const [relPath, entry] of Object.entries(localIndex.assets)) {
            if (opts.singlePath && relPath !== opts.singlePath) continue;
            if (opts.tags && opts.tags.length > 0) {
                const entryTags = entry.tags || [];
                const matches = opts.tags.every(t => entryTags.includes(t));
                if (!matches) continue;
            }
            const remoteEntry = remoteByPath.get(relPath);
            if (!remoteEntry) {
                LoggerService.log('warn', `[Assets] ${relPath} is in the local index but not in the remote manifest - skipping`);
                continue;
            }
            candidates.push({
                path: relPath,
                url: remoteEntry.url,
                size: remoteEntry.size || entry.size || 0,
                name: path.basename(relPath)
            });
        }
        return candidates;
    }

    static async downloadAssets(entries, opts = {}) {
        const toDownload = [];
        let skipped = 0;
        for (const entry of entries) {
            const dest = path.join(PUBLIC_DIR, entry.path);
            if (!opts.force && fs.existsSync(dest)) {
                skipped++;
                continue;
            }
            toDownload.push({ ...entry, dest });
        }

        if (toDownload.length === 0) {
            LoggerService.log('info', `Nothing to download - ${skipped} asset(s) already present locally.`);
            return { downloaded: 0, skipped };
        }

        if (skipped > 0) {
            LoggerService.log('info', `Skipping ${skipped} asset(s) already present locally.`);
        }

        // Resolve total size: per-entry size first, HEAD probe for the rest.
        const unknownSizeEntries = toDownload.filter(e => !e.size || e.size <= 0);
        if (unknownSizeEntries.length > 0) {
            LoggerService.log('info', `Probing size for ${unknownSizeEntries.length} asset(s) without declared size...`);
            const probed = await Promise.all(unknownSizeEntries.map(e => PluginInstaller.headContentLength(e.url)));
            unknownSizeEntries.forEach((e, i) => { e.size = probed[i]; });
        }
        const knownTotal = toDownload.reduce((sum, e) => sum + (e.size || 0), 0);

        LoggerService.log('info', `Downloading ${toDownload.length} asset(s)...`);

        await PluginInstaller.downloadFilesWithGlobalProgress(toDownload, knownTotal, 'Assets');

        // Invalidate cached missing list so subsequent /assets status reflects the new state.
        AssetService.missingWarned.clear();

        // Post-download size validation. We tolerate small discrepancies (GitHub Raw sometimes
        // serves slightly compressed responses) but warn on big mismatches and on zero-byte files.
        const SIZE_TOLERANCE_BYTES = 1024;
        const sizeMismatches = [];
        const zeroByte = [];
        for (const entry of toDownload) {
            try {
                const actual = fs.statSync(entry.dest).size;
                if (actual === 0) {
                    zeroByte.push({ path: entry.path });
                    continue;
                }
                if (entry.size && entry.size > 0) {
                    const delta = Math.abs(actual - entry.size);
                    if (delta > SIZE_TOLERANCE_BYTES) {
                        sizeMismatches.push({ path: entry.path, expected: entry.size, actual });
                    }
                }
            } catch (_) {}
        }
        if (zeroByte.length > 0) {
            LoggerService.log('warn', `${zeroByte.length} downloaded file(s) are ZERO bytes - likely corrupted, consider re-running:`);
            for (const z of zeroByte.slice(0, 10)) LoggerService.log('warn', `  - ${z.path}`);
        }
        if (sizeMismatches.length > 0) {
            LoggerService.log('warn', `${sizeMismatches.length} file(s) have a size differing from the manifest (> ${SIZE_TOLERANCE_BYTES} bytes):`);
            for (const m of sizeMismatches.slice(0, 10)) {
                LoggerService.log('warn', `  - ${m.path}: expected ${m.expected} B, got ${m.actual} B`);
            }
        }

        LoggerService.log('success', `Downloaded ${toDownload.length} asset(s)`);
        return {
            downloaded: toDownload.length,
            skipped,
            zeroByte: zeroByte.length,
            sizeMismatches: sizeMismatches.length
        };
    }

    static async installAllMissing() {
        const list = await this.resolveDownloadList();
        const missingOnly = list.filter(e => !fs.existsSync(path.join(PUBLIC_DIR, e.path)));
        if (missingOnly.length === 0) {
            LoggerService.log('success', 'All indexed assets are already present locally.');
            return { downloaded: 0, skipped: list.length };
        }
        return this.downloadAssets(missingOnly);
    }

    static async installOne(relativePath) {
        const list = await this.resolveDownloadList({ singlePath: relativePath });
        if (list.length === 0) {
            throw new Error(`Asset '${relativePath}' is not in the local index or not in the remote manifest`);
        }
        return this.downloadAssets(list);
    }

    static async uninstallAll() {
        const present = AssetService.getPresentManagedAssets();
        let removed = 0;
        for (const { fullPath, path: relPath } of present) {
            if (AssetService.isAlwaysLocal(relPath)) continue;
            try {
                fs.unlinkSync(fullPath);
                removed++;
            } catch (error) {
                LoggerService.log('warn', `[Assets] Failed to remove ${relPath}: ${error.message}`);
            }
        }
        this.removeEmptyDirs(PUBLIC_DIR);
        LoggerService.log('success', `Removed ${removed} local asset(s)`);
        return { removed };
    }

    static async uninstallOne(relativePath) {
        if (AssetService.isAlwaysLocal(relativePath)) {
            throw new Error(`Cannot remove '${relativePath}' - it matches an alwaysLocal rule`);
        }
        const fullPath = path.join(PUBLIC_DIR, relativePath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Asset '${relativePath}' is not present locally`);
        }
        fs.unlinkSync(fullPath);
        this.removeEmptyDirs(PUBLIC_DIR);
        LoggerService.log('success', `Removed local asset: ${relativePath}`);
        return { removed: 1 };
    }

    static async verify(sizeTolerance = 1024) {
        const index = AssetService.loadIndex();
        const report = {
            mode: require('./config-manager').get('assetsMode', 'online'),
            checked: 0,
            ok: 0,
            missing: [],
            zeroByte: [],
            sizeMismatch: [],
            orphans: []
        };

        // 1) Each indexed asset -> check presence + size.
        for (const [key, entry] of Object.entries(index.assets)) {
            if (AssetService.isAlwaysLocal(key)) continue;
            report.checked++;
            const full = path.join(PUBLIC_DIR, key);
            if (!fs.existsSync(full)) {
                report.missing.push(key);
                continue;
            }
            const size = fs.statSync(full).size;
            if (size === 0) {
                report.zeroByte.push(key);
                continue;
            }
            if (entry.size && entry.size > 0) {
                const delta = Math.abs(size - entry.size);
                if (delta > sizeTolerance) {
                    report.sizeMismatch.push({ key, expected: entry.size, actual: size });
                    continue;
                }
            }
            report.ok++;
        }

        // 2) Disk -> flag files not in the index, scoped to managed type segments only
        //    (so unrelated public/ subtrees like audio/ or fonts/ are never reported).
        const indexedKeys = new Set(Object.keys(index.assets));
        const managedSegments = this.getManagedTypeSegments(index);
        const walk = (dir, relPrefix = '') => {
            if (!fs.existsSync(dir)) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) walk(full, rel);
                else if (entry.isFile()) {
                    if (AssetService.isAlwaysLocal(rel)) continue;
                    if (!indexedKeys.has(rel)) report.orphans.push(rel);
                }
            }
        };
        for (const segment of managedSegments) {
            walk(path.join(PUBLIC_DIR, segment), segment);
        }

        return report;
    }

    static getManagedTypeSegments(index) {
        const segments = new Set();
        for (const key of Object.keys(index.assets)) {
            const first = key.split('/')[0];
            if (first) segments.add(first);
        }
        for (const pattern of index.alwaysLocal) {
            const first = pattern.split('/')[0];
            if (first) segments.add(first);
        }
        return segments;
    }

    static async cleanOrphans() {
        const index = AssetService.loadIndex();
        const indexedPaths = new Set(Object.keys(index.assets));
        const managedSegments = this.getManagedTypeSegments(index);
        const orphans = [];

        const walk = (dir, relPrefix = '') => {
            if (!fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    walk(full, rel);
                } else if (entry.isFile()) {
                    if (AssetService.isAlwaysLocal(rel)) continue;
                    if (!indexedPaths.has(rel)) orphans.push({ path: rel, fullPath: full });
                }
            }
        };
        // Scope walk to managed type segments (e.g. images/, videos/...) so unrelated
        // static assets in public/ (audio, fonts, etc.) are never touched.
        for (const segment of managedSegments) {
            walk(path.join(PUBLIC_DIR, segment), segment);
        }

        for (const orphan of orphans) {
            try { fs.unlinkSync(orphan.fullPath); } catch (_) {}
        }
        // Same scope for empty-dir cleanup.
        for (const segment of managedSegments) {
            this.removeEmptyDirs(path.join(PUBLIC_DIR, segment));
        }

        LoggerService.log('success', `Removed ${orphans.length} orphan asset(s)`);
        return { removed: orphans.length, orphans: orphans.map(o => o.path) };
    }

    static removeEmptyDirs(root) {
        if (!fs.existsSync(root)) return;
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const sub = path.join(root, entry.name);
            this.removeEmptyDirs(sub);
            try {
                if (fs.readdirSync(sub).length === 0) {
                    fs.rmdirSync(sub);
                }
            } catch (_) {}
        }
    }

}

module.exports = AssetInstaller;
