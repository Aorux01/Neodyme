const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const TestRegistry = require('../test-registry');
const ConfigManager = require('../../../manager/config-manager');
const DatabaseManager = require('../../../manager/database-manager');
const TokenService = require('../../token/token-service');

const register = (id, group, title, run) => TestRegistry.register({ id, group, title, kind: 'health', run });

register('http', 'server', 'HTTP Server', () => new Promise((resolve, reject) => {
    const secure = ConfigManager.get('protocol', 'http') === 'https';
    const request = (secure ? https : http).get({
        host: '127.0.0.1',
        port: ConfigManager.get('port'),
        path: '/neodyme/api/status',
        rejectUnauthorized: false,
        timeout: 2500
    }, res => {
        res.resume();
        if (res.statusCode === 200) return resolve({ message: 'Online' });
        if (res.statusCode === 429) return resolve({ status: 'degraded', message: 'Rate limited' });
        reject(new Error(`Unexpected status ${res.statusCode}`));
    });
    request.on('timeout', () => request.destroy(new Error('No answer from the HTTP server')));
    request.on('error', err => reject(new Error(`Not reachable: ${err.message}`)));
}));

register('advisor', 'server', 'Configuration Advice', async () => {
    const ConfigAdvisor = require('../../setup/config-advisor');
    const advice = await ConfigAdvisor.collect();
    if (advice.length === 0) return { message: 'No conflicting settings' };
    return { status: 'degraded', message: `${advice.length} point(s): ${advice[0]}` };
});

register('config', 'server', 'Configuration', () => {
    if (!ConfigManager.get('version')) throw new Error('version is not set');
    if (!ConfigManager.get('port')) throw new Error('port is not set');
    return { message: `v${ConfigManager.get('version')} on port ${ConfigManager.get('port')}` };
});

register('memory', 'server', 'Memory', () => {
    const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (heapMb > 1024) throw new Error(`Heap usage too high: ${heapMb}MB`);
    if (heapMb > 768) return { status: 'degraded', message: `${heapMb}MB heap in use` };
    return { message: `${heapMb}MB heap in use` };
});

register('tokens', 'server', 'Token Store', () => {
    const stats = TokenService.getTokenStats();
    if (typeof stats.total !== 'number') throw new Error('Token statistics are invalid');
    return { message: `${stats.total} active tokens` };
});

register('auth', 'server', 'Auth Service', () => {
    const secret = TokenService.getJwtSecret();
    if (!secret) throw new Error('JWT secret is not loaded');
    const probe = jwt.sign({ probe: true }, secret, { expiresIn: '10s' });
    if (!jwt.verify(probe, secret).probe) throw new Error('Token signature check failed');
    return { message: 'Token signing works' };
});

register('database', 'database', 'Database', async () => {
    const accounts = await DatabaseManager.getAllAccounts();
    if (!Array.isArray(accounts)) throw new Error('getAllAccounts did not return a list');
    return { message: `${accounts.length} accounts (${DatabaseManager.getDatabaseType()})` };
});

register('accounts', 'account', 'Account Data', async () => {
    const accounts = await DatabaseManager.getAllAccounts();
    const emails = new Set();
    const names = new Set();
    const duplicates = [];

    for (const account of accounts) {
        const email = String(account.email || '').toLowerCase();
        const name = String(account.displayName || '').toLowerCase();
        if (emails.has(email) || names.has(name)) duplicates.push(account.displayName);
        emails.add(email);
        names.add(name);
    }

    if (duplicates.length > 0) {
        return { status: 'degraded', message: `Duplicate email or name: ${duplicates.slice(0, 3).join(', ')}` };
    }
    return { message: `${accounts.length} accounts, no duplicates` };
});

register('friends', 'account', 'Friends', async () => {
    const [probe] = await DatabaseManager.getAllAccounts();
    if (!probe) return { message: 'No account to probe' };
    const list = await DatabaseManager.getFriendsList(probe.accountId);
    if (!Array.isArray(list)) throw new Error('Friends list is not readable');
    return { message: 'Friends data readable' };
});

register('xmpp', 'services', 'XMPP Service', () => {
    const XmppManager = require('../../../manager/xmpp-manager');
    if (!ConfigManager.get('xmppEnable')) return { status: 'disabled', message: 'Disabled in config' };
    if (XmppManager.startError) throw new Error(XmppManager.startError);
    if (!XmppManager.wss) throw new Error('Not running');
    return { message: `${(XmppManager.clients || []).length} connected (${XmppManager.scheme()})` };
});

register('matchmaking', 'services', 'Matchmaking', () => {
    const XmppManager = require('../../../manager/xmpp-manager');
    const MatchmakerManager = require('../../../manager/matchmaker-manager');
    if (!ConfigManager.get('xmppEnable')) return { status: 'disabled', message: 'Disabled in config' };
    if (XmppManager.startError) return { status: 'disabled', message: 'XMPP failed to start' };
    const stats = MatchmakerManager.getStats ? MatchmakerManager.getStats() : { connectedClients: 0 };
    return { message: `${stats.connectedClients || 0} clients` };
});

register('shop', 'services', 'Shop System', async () => {
    const ShopManager = require('../../../manager/shop-manager');
    if (!ConfigManager.get('autoShopRotation')) return { status: 'disabled', message: 'Disabled in config' };
    if (ShopManager.startError) throw new Error(ShopManager.startError);
    if (!ShopManager.isInitialized) throw new Error('Not initialized');

    const shopData = await ShopManager.getShopData();
    const hasContent = shopData && typeof shopData === 'object'
        && Object.keys(shopData).some(k => k !== '//' && k !== 'lastRotation');
    if (!hasContent) return { status: 'degraded', message: 'Shop is empty' };
    return { message: 'Initialized' };
});

register('redis', 'services', 'Redis Cache', () => {
    const RedisManager = require('../../../manager/redis-manager');
    if (!RedisManager.enabled) return { status: 'disabled', message: 'Not enabled' };
    if (!RedisManager.connected) throw new Error('Disconnected');
    return { message: 'Connected' };
});

register('plugins', 'plugins', 'Plugin System', () => {
    const PluginManager = require('../../../manager/plugin-manager');
    if (!ConfigManager.get('plugins')) return { status: 'disabled', message: 'Disabled in config' };
    const plugins = PluginManager.getPlugins();
    if (!Array.isArray(plugins)) throw new Error('getPlugins did not return a list');
    return { message: `${plugins.length} loaded` };
});
