const fs = require('fs');
const path = require('path');
const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');
const AssetService = require('../service/api/asset-service');
const AssetInstaller = require('../manager/asset-installer');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'public', 'images');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (Math.round(bytes / Math.pow(k, i) * 100) / 100) + ' ' + sizes[i];
}

function computeLocalDiskUsage() {
    // Walk public/ and sum file sizes. Cheap enough (a few thousand files at most).
    let total = 0;
    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile()) {
                try { total += fs.statSync(full).size; } catch (_) {}
            }
        }
    }
    walk(PUBLIC_DIR);
    return total;
}

function register(CM) {
    CM.register('/assets', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'status': {
                const mode = ConfigManager.get('assetsMode', 'online');
                const index = AssetService.loadIndex();
                const indexCount = Object.keys(index.assets).length;
                const missing = AssetService.getMissingAssets();
                const present = AssetService.getPresentManagedAssets();
                const diskUsage = computeLocalDiskUsage();

                LoggerService.log('info', `Asset pipeline status:`);
                LoggerService.log('info', `  Mode:                ${colors.cyan(mode)}`);
                LoggerService.log('info', `  Index entries:       ${colors.cyan(indexCount)}`);
                LoggerService.log('info', `  alwaysLocal rules:   ${colors.cyan(index.alwaysLocal.length)} (${index.alwaysLocal.join(', ') || 'none'})`);
                LoggerService.log('info', `  Present locally:     ${colors.green(present.length)} / ${indexCount} indexed assets`);
                LoggerService.log('info', `  Missing locally:     ${missing.length > 0 ? colors.yellow(missing.length) : colors.green(0)}`);
                LoggerService.log('info', `  Local disk usage:    ${colors.cyan(formatBytes(diskUsage))} (everything under public/)`);

                if (mode === 'local' && missing.length > 0) {
                    const totalMissingSize = missing.reduce((sum, m) => sum + (m.entry.size || 0), 0);
                    LoggerService.log('warn', `${missing.length} asset(s) are missing locally (~${formatBytes(totalMissingSize)}) - they fall back to the CDN on request.`);
                    LoggerService.log('info', `Use ${colors.cyan('/assets install')} to download them.`);
                }
                break;
            }

            case 'mode': {
                const target = args[1]?.toLowerCase();
                if (target !== 'online' && target !== 'local') {
                    LoggerService.log('info', `Usage: ${colors.cyan('/assets mode <online|local>')}`);
                    LoggerService.log('info', `Current mode: ${colors.cyan(ConfigManager.get('assetsMode', 'online'))}`);
                    return;
                }

                const previous = ConfigManager.get('assetsMode', 'online');
                if (target === previous) {
                    LoggerService.log('info', `Asset mode is already ${colors.cyan(target)}, nothing to do.`);
                    return;
                }

                await ConfigManager.save('assetsMode', target);
                LoggerService.log('success', `Asset mode changed: ${colors.gray(previous)} -> ${colors.cyan(target)}`);

                if (target === 'local') {
                    const missing = AssetService.getMissingAssets();
                    if (missing.length === 0) {
                        LoggerService.log('success', 'All indexed assets are already present locally.');
                    } else {
                        const totalSize = missing.reduce((sum, m) => sum + (m.entry.size || 0), 0);
                        LoggerService.log('info', `${missing.length} asset(s) missing locally (~${formatBytes(totalSize)}). Auto-downloading...`);
                        try {
                            await AssetInstaller.installAllMissing();
                        } catch (error) {
                            LoggerService.log('error', `Auto-download failed: ${error.message}`);
                            LoggerService.log('info', `You can retry later with ${colors.cyan('/assets install')}`);
                        }
                    }
                } else {
                    const present = AssetService.getPresentManagedAssets();
                    const removablePresent = present.filter(p => !AssetService.isAlwaysLocal(p.path));
                    if (removablePresent.length > 0) {
                        LoggerService.log('warn', `${removablePresent.length} local asset(s) are still on disk but will no longer be served (online mode redirects to the CDN).`);
                        LoggerService.log('info', `They will be re-used automatically if you switch back to local. To remove them, use ${colors.cyan('/assets uninstall')}.`);
                    }
                }
                break;
            }

            case 'diagnose': {
                const target = args[1];
                if (!target) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/assets diagnose <relative-path>')}`);
                    LoggerService.log('info', `Example: ${colors.cyan('/assets diagnose unrealengine-cdn2/fortnite/RUS-Axe.png')}`);
                    return;
                }

                const report = AssetService.diagnose(target);
                LoggerService.log('info', `Diagnose: ${colors.cyan(report.path)}`);
                LoggerService.log('info', `  Mode:               ${colors.cyan(report.mode)}`);
                LoggerService.log('info', `  alwaysLocal:        ${report.alwaysLocal ? colors.green('yes') : 'no'}`);
                LoggerService.log('info', `  In index:           ${report.indexEntry ? colors.green('yes') : colors.yellow('no')}`);
                if (report.indexEntry) {
                    LoggerService.log('info', `  CDN URL:            ${colors.gray(report.indexEntry.cdn)}`);
                    if (report.indexEntry.tags?.length) {
                        LoggerService.log('info', `  Tags:               ${report.indexEntry.tags.map(t => colors.cyan(t)).join(', ')}`);
                    }
                }
                LoggerService.log('info', `  Local file exists:  ${report.localExists ? colors.green('yes') : colors.yellow('no')}`);
                if (report.localPath) {
                    LoggerService.log('info', `  Local path:         ${colors.gray(report.localPath)}`);
                }

                const r = report.resolution;
                const actionLabel = {
                    static: colors.green('serve local file (static)'),
                    redirect: colors.cyan('redirect to CDN'),
                    notfound: colors.red('404 not found')
                }[r.action] || r.action;
                LoggerService.log('info', `  Resolution:         ${actionLabel}`);
                if (r.target) LoggerService.log('info', `  Redirect target:    ${colors.gray(r.target)}`);
                if (r.reason)  LoggerService.log('info', `  Reason:             ${colors.gray(r.reason)}`);
                break;
            }

            case 'reload': {
                AssetService.index = null;
                AssetService.loadIndex();
                LoggerService.log('success', 'Asset index reloaded from disk.');
                break;
            }

            case 'list': {
                try {
                    LoggerService.log('info', 'Fetching remote assets manifest...');
                    const remote = await AssetInstaller.fetchRemoteManifest();
                    const localIndex = AssetService.loadIndex();
                    const localPaths = new Set(Object.keys(localIndex.assets));

                    LoggerService.log('info', `Remote manifest version: ${colors.gray(remote.version)} | Last updated: ${colors.gray(new Date(remote.lastUpdated).toLocaleString())}`);
                    LoggerService.log('info', `Total remote assets: ${colors.cyan(remote.assets.length)} (~${formatBytes(remote.totalSize || 0)})`);
                    LoggerService.log('info', `Indexed locally:     ${colors.cyan(localPaths.size)}`);
                    LoggerService.log('info', '');

                    // Optional tag filter: /assets list --tag <tag>
                    const tagIdx = args.indexOf('--tag');
                    const tagFilter = tagIdx > 0 ? args[tagIdx + 1] : null;

                    const seenTags = new Map();
                    let shown = 0;
                    const max = 30;
                    for (const asset of remote.assets) {
                        const indexEntry = localIndex.assets[asset.path];
                        const tags = indexEntry?.tags || [];
                        if (tagFilter && !tags.includes(tagFilter)) {
                            for (const t of tags) seenTags.set(t, (seenTags.get(t) || 0) + 1);
                            continue;
                        }
                        for (const t of tags) seenTags.set(t, (seenTags.get(t) || 0) + 1);

                        if (shown >= max) { shown++; continue; }
                        const installed = fs.existsSync(path.join(ASSETS_DIR, asset.path));
                        const indexed   = localPaths.has(asset.path);
                        const flags = [
                            installed ? colors.green('[INSTALLED]') : colors.gray('[remote]'),
                            indexed ? '' : colors.yellow('[not-in-local-index]')
                        ].filter(Boolean).join(' ');
                        LoggerService.log('info', `  ${flags} ${colors.cyan(asset.path)} (${formatBytes(asset.size || 0)})`);
                        shown++;
                    }

                    if (shown > max) {
                        LoggerService.log('info', `  ... and ${shown - max} more (use --tag to filter)`);
                    }

                    if (seenTags.size > 0 && !tagFilter) {
                        const tagList = Array.from(seenTags.entries())
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 12)
                            .map(([t, n]) => `${colors.cyan(t)}(${n})`)
                            .join(', ');
                        LoggerService.log('info', '');
                        LoggerService.log('info', `Top tags: ${tagList}`);
                        LoggerService.log('info', `Filter with ${colors.cyan('/assets list --tag <tag>')}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to list assets: ${error.message}`);
                }
                break;
            }

            case 'info': {
                const target = args[1];
                if (!target) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/assets info <relative-path>')}`);
                    return;
                }
                try {
                    const localIndex = AssetService.loadIndex();
                    const localEntry = localIndex.assets[target] || null;
                    let remoteEntry = null;
                    try {
                        const remote = await AssetInstaller.fetchRemoteManifest();
                        remoteEntry = remote.assets.find(a => a.path === target) || null;
                    } catch (e) {
                        LoggerService.log('warn', `Remote manifest unavailable: ${e.message}`);
                    }

                    const fullPath = path.join(ASSETS_DIR, target);
                    const localExists = fs.existsSync(fullPath);

                    LoggerService.log('info', `Asset: ${colors.cyan(target)}`);
                    LoggerService.log('info', `  alwaysLocal:        ${AssetService.isAlwaysLocal(target) ? colors.green('yes') : 'no'}`);
                    LoggerService.log('info', `  In local index:     ${localEntry ? colors.green('yes') : colors.yellow('no')}`);
                    if (localEntry) {
                        LoggerService.log('info', `  CDN URL:            ${colors.gray(localEntry.cdn)}`);
                        if (localEntry.tags?.length) {
                            LoggerService.log('info', `  Tags:               ${localEntry.tags.map(t => colors.cyan(t)).join(', ')}`);
                        }
                    }
                    LoggerService.log('info', `  In remote manifest: ${remoteEntry ? colors.green('yes') : colors.yellow('no')}`);
                    if (remoteEntry) {
                        LoggerService.log('info', `  Download URL:       ${colors.gray(remoteEntry.url)}`);
                        LoggerService.log('info', `  Download size:      ${colors.cyan(formatBytes(remoteEntry.size || 0))}`);
                    }
                    LoggerService.log('info', `  Local file exists:  ${localExists ? colors.green('yes') : colors.yellow('no')}`);
                    if (localExists) {
                        const stat = fs.statSync(fullPath);
                        LoggerService.log('info', `  Local size:         ${colors.cyan(formatBytes(stat.size))}`);
                        LoggerService.log('info', `  Local mtime:        ${colors.gray(stat.mtime.toISOString())}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to get asset info: ${error.message}`);
                }
                break;
            }

            case 'install': {
                const target = args[1];
                try {
                    if (target) {
                        await AssetInstaller.installOne(target);
                    } else {
                        await AssetInstaller.installAllMissing();
                    }
                } catch (error) {
                    LoggerService.log('error', `Install failed: ${error.message}`);
                }
                break;
            }

            case 'uninstall': {
                const target = args[1];
                try {
                    if (target) {
                        // Single-file: direct removal, no confirm needed (small blast radius).
                        await AssetInstaller.uninstallOne(target);
                    } else {
                        // Bulk: confirmation flow.
                        const present = AssetService.getPresentManagedAssets()
                            .filter(p => !AssetService.isAlwaysLocal(p.path));
                        if (present.length === 0) {
                            LoggerService.log('info', 'No managed local assets to remove.');
                            return;
                        }
                        const totalSize = present.reduce((sum, p) => {
                            try { return sum + require('fs').statSync(p.fullPath).size; } catch { return sum; }
                        }, 0);
                        LoggerService.log('warn', `About to remove ${colors.yellow(present.length)} local asset(s) (~${formatBytes(totalSize)}). alwaysLocal preserved.`);
                        LoggerService.log('warn', `Run ${colors.cyan('/confirm assets-uninstall')} to proceed, or ${colors.cyan('/cancel')} to abort.`);
                        CM.pendingAssetUninstall = { count: present.length, size: totalSize };
                    }
                } catch (error) {
                    LoggerService.log('error', `Uninstall failed: ${error.message}`);
                }
                break;
            }

            case 'clean': {
                try {
                    // Dry-run: reuse verify()'s scoped orphan detection so audio/, fonts/, etc.
                    // are never reported.
                    const report = await AssetInstaller.verify();
                    const orphans = report.orphans;

                    if (orphans.length === 0) {
                        LoggerService.log('info', 'No orphan assets found.');
                        return;
                    }

                    LoggerService.log('warn', `About to remove ${colors.yellow(orphans.length)} orphan asset(s) (files on disk but not in assets-index.json):`);
                    for (const p of orphans.slice(0, 20)) {
                        LoggerService.log('info', `  - ${colors.gray(p)}`);
                    }
                    if (orphans.length > 20) {
                        LoggerService.log('info', `  ... and ${orphans.length - 20} more`);
                    }
                    LoggerService.log('warn', `Run ${colors.cyan('/confirm assets-clean')} to proceed, or ${colors.cyan('/cancel')} to abort.`);
                    CM.pendingAssetClean = { count: orphans.length };
                } catch (error) {
                    LoggerService.log('error', `Clean failed: ${error.message}`);
                }
                break;
            }

            case 'refresh': {
                try {
                    LoggerService.log('info', 'Refreshing remote assets manifest...');
                    await AssetInstaller.fetchRemoteManifest(true);
                    LoggerService.log('success', 'Remote manifest refreshed.');
                } catch (error) {
                    LoggerService.log('error', `Refresh failed: ${error.message}`);
                }
                break;
            }

            case 'verify': {
                try {
                    LoggerService.log('info', 'Verifying local assets against the index...');
                    const report = await AssetInstaller.verify();
                    LoggerService.log('info', `Verification report (mode: ${colors.cyan(report.mode)}):`);
                    LoggerService.log('info', `  Checked:        ${colors.cyan(report.checked)}`);
                    LoggerService.log('info', `  OK:             ${colors.green(report.ok)}`);
                    LoggerService.log('info', `  Missing:        ${report.missing.length > 0 ? colors.yellow(report.missing.length) : colors.green(0)}`);
                    LoggerService.log('info', `  Zero-byte:      ${report.zeroByte.length > 0 ? colors.red(report.zeroByte.length) : colors.green(0)}`);
                    LoggerService.log('info', `  Size mismatch:  ${report.sizeMismatch.length > 0 ? colors.yellow(report.sizeMismatch.length) : colors.green(0)}`);
                    LoggerService.log('info', `  Orphans:        ${report.orphans.length > 0 ? colors.yellow(report.orphans.length) : colors.green(0)}`);

                    if (report.missing.length > 0) {
                        LoggerService.log('warn', 'Missing local files (indexed but not on disk):');
                        for (const k of report.missing.slice(0, 15)) LoggerService.log('warn', `  - ${k}`);
                        if (report.missing.length > 15) LoggerService.log('warn', `  ... and ${report.missing.length - 15} more`);
                    }
                    if (report.zeroByte.length > 0) {
                        LoggerService.log('error', 'Zero-byte files (likely corrupted):');
                        for (const k of report.zeroByte.slice(0, 15)) LoggerService.log('error', `  - ${k}`);
                    }
                    if (report.sizeMismatch.length > 0) {
                        LoggerService.log('warn', 'Size mismatches vs index:');
                        for (const m of report.sizeMismatch.slice(0, 15)) {
                            LoggerService.log('warn', `  - ${m.key}: expected ${m.expected} B, got ${m.actual} B`);
                        }
                    }
                    if (report.orphans.length > 0) {
                        LoggerService.log('info', `Orphans (on disk, not indexed): use ${colors.cyan('/assets clean')} to remove`);
                    }

                    if (report.missing.length === 0 && report.zeroByte.length === 0 && report.sizeMismatch.length === 0 && report.orphans.length === 0) {
                        LoggerService.log('success', 'All local assets are healthy.');
                    } else {
                        LoggerService.log('info', `Tip: re-run ${colors.cyan('/assets install')} to repair missing or corrupted files.`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Verify failed: ${error.message}`);
                }
                break;
            }

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/assets <subcommand>')}`);
                LoggerService.log('info', 'Inspection:');
                LoggerService.log('info', `  ${colors.cyan('status')}                          - Show mode, disk usage, missing assets`);
                LoggerService.log('info', `  ${colors.cyan('list [--tag <tag>]')}              - List remote assets, optionally filtered by tag`);
                LoggerService.log('info', `  ${colors.cyan('info <path>')}                     - Show local + remote details for an asset`);
                LoggerService.log('info', `  ${colors.cyan('diagnose <path>')}                 - Explain how a /images/ path resolves`);
                LoggerService.log('info', 'Configuration:');
                LoggerService.log('info', `  ${colors.cyan('mode <online|local>')}             - Change serving mode (auto-downloads on online->local)`);
                LoggerService.log('info', `  ${colors.cyan('reload')}                          - Force-reload content/assets-index.json from disk`);
                LoggerService.log('info', `  ${colors.cyan('refresh')}                         - Force-refresh the remote manifest cache`);
                LoggerService.log('info', 'Storage:');
                LoggerService.log('info', `  ${colors.cyan('install [path]')}                  - Download missing assets (or one specific asset)`);
                LoggerService.log('info', `  ${colors.cyan('uninstall [path]')}                - Remove local managed assets (or one specific asset)`);
                LoggerService.log('info', `  ${colors.cyan('clean')}                           - Remove orphan local files no longer indexed`);
                LoggerService.log('info', `  ${colors.cyan('verify')}                          - Audit local files against the index (missing, zero-byte, size mismatches)`);
                break;
        }
    });
}

module.exports = { register };
