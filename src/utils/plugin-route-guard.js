const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');
const { RESERVED_PREFIXES } = require('../middleware/page-routes-middleware');

const MODES = ['warn', 'block', 'off'];

function mode() {
    const value = String(ConfigManager.get('pluginRouteGuard', 'warn')).toLowerCase();
    return MODES.includes(value) ? value : 'warn';
}

function isReserved(routePath) {
    const paths = Array.isArray(routePath) ? routePath : [routePath];
    return paths.some(p => typeof p === 'string' && RESERVED_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/')));
}

function conflicts(layer) {
    if (layer.route) return isReserved(layer.route.path) ? [layer.route.path] : [];
    if (layer.handle && Array.isArray(layer.handle.stack)) return layer.handle.stack.flatMap(conflicts);
    return [];
}

function stackOf(app) {
    return (app && app._router && app._router.stack) || [];
}

class PluginRouteGuard {
    static snapshot(app) {
        return new Set(stackOf(app));
    }

    static check(app, before, pluginName) {
        const current = mode();
        if (current === 'off' || !app) return [];

        const found = [];
        const stack = stackOf(app);
        for (const layer of [...stack]) {
            if (before.has(layer)) continue;
            const paths = conflicts(layer);
            if (paths.length === 0) continue;
            found.push(...paths);
            if (current === 'block') stack.splice(stack.indexOf(layer), 1);
        }

        if (found.length > 0) {
            const list = found.map(String).join(', ');
            if (current === 'block') {
                LoggerService.log('error', `Plugin ${pluginName} registered routes on website paths, they were removed: ${list}`);
            } else {
                LoggerService.log('warn', `Plugin ${pluginName} registered routes on website paths (${list}). This can break website pages, use /plugins/${pluginName}/... instead.`);
            }
        }
        return found;
    }
}

module.exports = PluginRouteGuard;
