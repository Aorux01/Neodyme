const express = require('express');
const router = express.Router();
const TestRegistry = require('../../src/service/test/test-registry');

TestRegistry.loadBuiltInChecks();

const PUBLIC_SERVICES = [
    { key: 'server', checkId: 'http', label: 'Game Server' },
    { key: 'auth', checkId: 'auth', label: 'Authentication' },
    { key: 'accounts', checkId: 'accounts', label: 'Account System' },
    { key: 'friends', checkId: 'friends', label: 'Friends' },
    { key: 'xmpp', checkId: 'xmpp', label: 'Chat (XMPP)' },
    { key: 'matchmaking', checkId: 'matchmaking', label: 'Matchmaking' },
    { key: 'shop', checkId: 'shop', label: 'Item Shop' },
    { key: 'database', checkId: 'database', label: 'Database' }
];

const PUBLIC_STATUS = { ok: 'operational', degraded: 'degraded', error: 'outage' };
const CACHE_MS = 10000;

router.get('/neodyme/api/status', (_req, res) => {
    res.json({ online: true, uptime: Math.floor(process.uptime()) });
});

router.get('/neodyme/api/status/services', async (_req, res) => {
    const results = await TestRegistry.runHealth({ maxAgeMs: CACHE_MS });
    const byId = new Map(results.map(r => [r.id, r]));

    const services = {};
    for (const { key, checkId, label } of PUBLIC_SERVICES) {
        const result = byId.get(checkId);
        if (!result || result.status === 'disabled') continue;
        services[key] = { status: PUBLIC_STATUS[result.status] || 'outage', label };
    }

    const statuses = Object.values(services);
    const total = statuses.length;
    const outages = statuses.filter(s => s.status === 'outage').length;
    const degraded = statuses.filter(s => s.status === 'degraded').length;
    const overall = outages > 0 ? 'outage' : degraded > 0 ? 'degraded' : 'operational';

    res.json({
        success: true,
        overall,
        summary: { total, operational: total - outages - degraded, degraded, outage: outages },
        services,
        checkedAt: new Date().toISOString()
    });
});

module.exports = router;
