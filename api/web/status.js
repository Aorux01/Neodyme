const express = require('express');
const router = express.Router();

router.get('/api/web/status', (_req, res) => {
    res.json({ online: true, uptime: Math.floor(process.uptime()) });
});

router.get('/api/public/status', async (_req, res) => {
    const checks = {
        server:      { status: 'operational', label: 'Game Server' },
        auth:        { status: 'operational', label: 'Authentication' },
        accounts:    { status: 'operational', label: 'Account System' },
        friends:     { status: 'operational', label: 'Friends' },
        xmpp:        { status: 'outage',      label: 'Chat (XMPP)' },
        matchmaking: { status: 'outage',      label: 'Matchmaking' },
        shop:        { status: 'outage',      label: 'Item Shop' },
        database:    { status: 'outage',      label: 'Database' },
    };

    try {
        const XmppManager = require('../../src/manager/xmpp-manager');
        checks.xmpp.status = XmppManager.wss ? 'operational' : 'outage';
    } catch (_) {}

    try {
        const MatchmakerManager = require('../../src/manager/matchmaker-manager');
        checks.matchmaking.status = MatchmakerManager.clients != null ? 'operational' : 'outage';
    } catch (_) {}

    try {
        const DatabaseManager = require('../../src/manager/database-manager');
        const dbType     = DatabaseManager.getDatabaseType();
        const dbInstance = dbType ? DatabaseManager.getDatabaseInstance() : null;
        checks.database.label  = `Database (${dbType || 'unknown'})`;
        checks.database.status = dbInstance ? 'operational' : 'outage';
    } catch (_) {}

    try {
        const ShopManager = require('../../src/manager/shop-manager');
        if (!ShopManager.isInitialized) {
            checks.shop.status = 'outage';
        } else {
            try {
                const shopData   = await ShopManager.getShopData();
                const hasContent = shopData && typeof shopData === 'object'
                    && Object.keys(shopData).some(k => k !== '//' && k !== 'lastRotation');
                checks.shop.status = hasContent ? 'operational' : 'degraded';
            } catch (_) {
                checks.shop.status = 'degraded';
            }
        }
    } catch (_) {}

    const statuses = Object.values(checks);
    const total    = statuses.length;
    const outages  = statuses.filter(s => s.status === 'outage').length;
    const degraded = statuses.filter(s => s.status === 'degraded').length;
    const overall  = outages > 0 ? 'outage' : degraded > 0 ? 'degraded' : 'operational';

    res.json({
        success: true,
        overall,
        summary: { total, operational: total - outages - degraded, degraded, outage: outages },
        services: checks,
        checkedAt: new Date().toISOString()
    });
});

module.exports = router;
