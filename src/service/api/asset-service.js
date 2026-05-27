const fs = require('fs');
const path = require('path');
const LoggerService = require('../logger/logger-service');
const ConfigManager = require('../../manager/config-manager');

const INDEX_PATH = path.join(__dirname, '..', '..', '..', 'content', 'assets-index.json');
const PUBLIC_DIR = path.join(__dirname, '..', '..', '..', 'public');

class AssetService {
    static index = null;
    static indexMtimeMs = 0;
    static missingWarned = new Set();

    static loadIndex() {
        try {
            if (!fs.existsSync(INDEX_PATH)) {
                if (this.index === null) {
                    LoggerService.log('warn', 'assets-index.json not found - all /images/* requests will 404 unless the file exists locally');
                    this.index = { version: 1, alwaysLocal: [], assets: {} };
                }
                return this.index;
            }

            const stat = fs.statSync(INDEX_PATH);
            if (this.index && stat.mtimeMs === this.indexMtimeMs) {
                return this.index;
            }

            const raw = fs.readFileSync(INDEX_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            this.index = {
                version: parsed.version || 1,
                alwaysLocal: Array.isArray(parsed.alwaysLocal) ? parsed.alwaysLocal : [],
                assets: parsed.assets && typeof parsed.assets === 'object' ? parsed.assets : {}
            };
            this.indexMtimeMs = stat.mtimeMs;
            this.missingWarned.clear();
            LoggerService.log('info', `Asset index loaded: ${Object.keys(this.index.assets).length} entries, ${this.index.alwaysLocal.length} alwaysLocal rules`);
            return this.index;
        } catch (error) {
            LoggerService.log('error', `Failed to load assets-index.json: ${error.message} - falling back to empty index`);
            if (this.index === null) {
                this.index = { version: 1, alwaysLocal: [], assets: {} };
            }
            return this.index;
        }
    }

    static matchesGlob(pattern, value) {
        const re = '^' + pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials
            .replace(/\*\*/g, '§§DOUBLESTAR§§')
            .replace(/\*/g, '[^/]*')
            .replace(/§§DOUBLESTAR§§/g, '.*') + '$';
        return new RegExp(re).test(value);
    }

    static isAlwaysLocal(relativePath) {
        const index = this.loadIndex();
        return index.alwaysLocal.some(pattern => this.matchesGlob(pattern, relativePath));
    }

    static resolve(relativePath) {
        const mode = ConfigManager.get('assetsMode', 'online');
        const index = this.loadIndex();
        const entry = index.assets[relativePath];

        // 1) alwaysLocal - always serve from disk, never redirect.
        if (this.isAlwaysLocal(relativePath)) {
            return { action: 'static' };
        }

        // 2) Local mode - prefer the local file, fall back to CDN with a warning.
        if (mode === 'local') {
            const onDisk = path.join(PUBLIC_DIR, relativePath);
            if (fs.existsSync(onDisk)) {
                return { action: 'static' };
            }
            if (entry && entry.cdn) {
                if (!this.missingWarned.has(relativePath)) {
                    LoggerService.log('warn', `Missing local asset: ${relativePath} - falling back to remote (${entry.cdn})`);
                    this.missingWarned.add(relativePath);
                }
                return { action: 'redirect', target: entry.cdn };
            }
            return { action: 'notfound', reason: 'not in assets-index.json and not present locally' };
        }

        // 3) Online mode - redirect to the CDN listed in the index.
        if (entry && entry.cdn) {
            return { action: 'redirect', target: entry.cdn };
        }

        // 4) Unknown asset in online mode - try a local fallback before giving up,
        //    so user-dropped files in public/images/ still work without an index entry.
        const onDisk = path.join(PUBLIC_DIR, relativePath);
        if (fs.existsSync(onDisk)) {
            return { action: 'static' };
        }

        return { action: 'notfound', reason: 'not in assets-index.json' };
    }

    static diagnose(relativePath) {
        const mode = ConfigManager.get('assetsMode', 'online');
        const index = this.loadIndex();
        const entry = index.assets[relativePath] || null;
        const onDisk = path.join(PUBLIC_DIR, relativePath);
        const exists = fs.existsSync(onDisk);

        return {
            path: relativePath,
            mode,
            alwaysLocal: this.isAlwaysLocal(relativePath),
            indexEntry: entry,
            localExists: exists,
            localPath: exists ? onDisk : null,
            resolution: this.resolve(relativePath)
        };
    }

    static getMissingAssets() {
        const index = this.loadIndex();
        const missing = [];
        for (const [relativePath, entry] of Object.entries(index.assets)) {
            const onDisk = path.join(PUBLIC_DIR, relativePath);
            if (!fs.existsSync(onDisk)) {
                missing.push({ path: relativePath, entry });
            }
        }
        return missing;
    }

    static getPresentManagedAssets() {
        const index = this.loadIndex();
        const present = [];
        for (const relativePath of Object.keys(index.assets)) {
            const onDisk = path.join(PUBLIC_DIR, relativePath);
            if (fs.existsSync(onDisk)) {
                present.push({ path: relativePath, fullPath: onDisk });
            }
        }
        return present;
    }
}

module.exports = AssetService;
