const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const FunctionsService = require('../../src/service/api/functions-service');
const DatabaseManager = require('../../src/manager/database-manager');
const ReportService = require('../../src/service/api/report-service');
const LoggerService = require('../../src/service/logger/logger-service');

router.put('/profile/play_region', async (req, res) => {
    res.json({ namespace: 'Fortnite', play_region: 'NA_EAST' });
});

router.get('/region', async (req, res) => {
    res.json({
        continent: { code: "EU", geoname_id: 6255148, names: { en: "Europe" } },
        country: { geoname_id: 3017382, iso_code: "FR", names: { en: "France" } },
        subdivisions: [{ geoname_id: 3012874, iso_code: "IDF", names: { en: "Ile-de-France" } }]
    });
});

router.get('/fortnite/api/game/v2/friendcodes/*/epic', async (req, res) => {
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    res.json([
        { codeId: 'NEODYME',       codeType: 'CodeToken:FounderFriendInvite',       dateCreated: ts },
        { codeId: 'NEODYMEPC',     codeType: 'CodeToken:FounderFriendInvite_XBOX',   dateCreated: ts },
        { codeId: 'NEODYMEMOBILE', codeType: 'CodeToken:MobileInvite',               dateCreated: ts }
    ]);
});

router.get('/fortnite/api/game/v2/enabled_features', async (req, res) => {
    res.json([]);
});

router.post('/fortnite/api/game/v2/grant_access/*', async (req, res) => {
    res.status(204).end();
});

router.post('/api/v1/user/setting', async (req, res) => {
    res.json([]);
});

router.get('/socialban/api/public/v1/*', async (req, res) => {
    res.json({ bans: [], warnings: [] });
});

router.get('/fortnite/api/game/v2/twitch/*', async (req, res) => {
    res.status(200).end();
});

router.get('/presence/api/v1/_/*/last-online', async (req, res) => {
    res.json({});
});

router.get('/fortnite/api/game/v2/world/info', async (req, res) => {
    res.json(FunctionsService.getTheater(req));
});

router.get('/fortnite/api/game/v2/homebase/allowed-name-chars', async (req, res) => {
    res.json({
        ranges: [
            48, 57, 65, 90, 97, 122, 192, 255, 260, 265, 280, 281, 286, 287,
            304, 305, 321, 324, 346, 347, 350, 351, 377, 380, 1024, 1279,
            1536, 1791, 4352, 4607, 11904, 12031, 12288, 12351, 12352, 12543,
            12592, 12687, 12800, 13055, 13056, 13311, 13312, 19903, 19968, 40959,
            43360, 43391, 44032, 55215, 55216, 55295, 63744, 64255, 65072, 65103,
            65281, 65470, 131072, 173791, 194560, 195103
        ],
        singlePoints: [32, 39, 45, 46, 95, 126],
        excludedPoints: [208, 215, 222, 247]
    });
});

router.post('/api/v1/assets/Fortnite/*/*', async (req, res) => {
    if (req.body.hasOwnProperty('FortCreativeDiscoverySurface') && req.body.FortCreativeDiscoverySurface === 0) {
        const discoveryPath = path.join(process.cwd(), 'content', 'athena', 'discovery', 'discovery-api-assets.json');
        if (fs.existsSync(discoveryPath)) {
            return res.json(JSON.parse(fs.readFileSync(discoveryPath, 'utf8')));
        }
    }
    res.json({
        FortCreativeDiscoverySurface: {
            meta: { promotion: req.body.FortCreativeDiscoverySurface || 0 },
            assets: {}
        }
    });
});

router.all('/v1/epic-settings/public/users/*/values', async (req, res) => {
    const epicSettingsPath = path.join(process.cwd(), 'content', 'epic-settings.json');
    if (fs.existsSync(epicSettingsPath)) {
        return res.json(JSON.parse(fs.readFileSync(epicSettingsPath, 'utf8')));
    }
    res.json({});
});

router.get('/fortnite/api/game/v2/br-inventory/account/*', async (req, res) => {
    const accountId = req.params[0];
    const profile = await DatabaseManager.getProfile(accountId, 'athena');
    const globalcash = profile?.stats?.attributes?.stash?.globalcash || 0;
    res.json({ stash: { globalcash } });
});

const feedbackStoragePath = path.join(process.cwd(), 'data', 'feedback');

router.get('/api/v1/access/:namespace/*', (req, res) => {
    const filePath = path.resolve(feedbackStoragePath, req.params[0]);
    if (!filePath.startsWith(feedbackStoragePath)) return res.status(400).end();
    if (fs.existsSync(filePath)) return res.sendFile(filePath);
    res.status(404).end();
});

router.put('/api/v1/access/:namespace/*', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
    const filePath = path.resolve(feedbackStoragePath, req.params[0]);
    if (!filePath.startsWith(feedbackStoragePath)) return res.status(400).end();
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, req.body);
        LoggerService.log('info', `Feedback file saved: ${req.params[0]}`);
    } catch (error) {
        LoggerService.log('error', `Failed to save feedback file: ${error.message}`);
        return res.status(500).end();
    }
    res.status(200).end();
});

router.post('/fortnite/api/feedback/:type', async (req, res) => {
    try {
        const feedbackType = req.params.type;
        const body = req.body || {};

        const accountId = body.accountId || body.account_id || null;
        const comments = body.comments || body.description || body.text || '';
        const category = body.category || feedbackType;

        if (accountId) {
            const account = await DatabaseManager.getAccount(accountId);
            const displayName = account?.displayName || accountId;
            await ReportService.createReport(
                accountId,
                displayName,
                'SYSTEM',
                `[${feedbackType}]`,
                category,
                comments || 'No description provided'
            );
            LoggerService.log('info', `Feedback (${feedbackType}) received from ${displayName}`);
        }
    } catch (error) {
        LoggerService.log('error', `Feedback error: ${error.message}`);
    }
    res.status(200).end();
});

router.get('/fortnite/api/game/v2/clientfeaturekeys/:accountId', (req, res) => {
    res.status(204).end();
});

router.get('/d98eeaac-2bfa-4bf4-8a59-bdc95469c693', async (req, res) => {
    res.json({
        playlist: 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPE1QRCB4bWxucz0idXJuOm1wZWc6ZGFzaDpzY2hlbWE6bXBkOjIwMTEiIHhtbG5zOnhzaT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEtaW5zdGFuY2UiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4c2k6c2NoZW1hTG9jYXRpb249InVybjptcGVnOkRBU0g6c2NoZW1hOk1QRDoyMDExIGh0dHA6Ly9zdGFuZGFyZHMuaXNvLm9yZy9pdHRmL1B1YmxpY2x5QXZhaWxhYmxlU3RhbmRhcmRzL01QRUctREFTSF9zY2hlbWFfZmlsZXMvREFTSC1NUEQueHNkIiBwcm9maWxlcz0idXJuOm1wZWc6ZGFzaDpwcm9maWxlOmlzb2ZmLWxpdmU6MjAxMSIgdHlwZT0ic3RhdGljIiBtZWRpYVByZXNlbnRhdGlvbkR1cmF0aW9uPSJQVDMwLjIxM1MiIG1heFNlZ21lbnREdXJF0aW9uPSJQVDIuMDAwUyIgbWluQnVmZmVyVGltZT0iUFQ0LjEwNlMiPgogIDxCYXNlVVJMPmh0dHBzOi8vZm9ydG5pdGUtcHVibGljLXNlcnZpY2UtcHJvZDExLm9sLmVwaWNnYW1lcy5jb20vYXVkaW8vSmFtVHJhY2tzL09HUmVtaXgvPC9CYXNlVVJMPgogIDxQcm9ncmFtSW5mb3JtYXRpb24+PC9Qcm9ncmFtSW5mb3JtYXRpb24+CiAgPFBlcmlvZCBpZD0iMCIgc3RhcnQ9IlBUMFMiPgogICAgPEFkYXB0YXRpb25TZXQgaWQ9IjAiIGNvbnRlbnRUeXBlPSJhdWRpbyIgc3RhcnRXaXRoU0FQPSIxIiBzZWdtZW50QWxpZ25tZW50PSJ0cnVlIiBiaXRzdHJlYW1Td2l0Y2hpbmc9InRydWUiPgogICAgICA8UmVwcmVzZW50YXRpb24gaWQ9IjAiIGF1ZGlvU2FtcGxpbmdSYXRlPSI0ODAwMCIgYmFuZHdpZHRoPSIxMjgwMDAiIG1pbWVUeXBlPSJhdWRpby9tcDQiIGNvZGVjcz0ibXA0YS40MC4yIj4KICAgICAgICA8U2VnbWVudFRlbXBsYXRlIGR1cmF0aW9uPSIyMDAwMDAwIiB0aW1lc2NhbGU9IjEwMDAwMDAiIGluaXRpYWxpemF0aW9uPSJpbml0XyRSZXByZXNlbnRhdGlvbklEJC5tcDQiIG1lZGlhPSJzZWdtZW50XyRSZXByZXNlbnRhdGlvbklEJF8kTnVtYmVyJC5tNHMiIHN0YXJ0TnVtYmVyPSIxIj48L1NlZ21lbnRUZW1wbGF0ZT4KICAgICAgICA8QXVkaW9DaGFubmVsQ29uZmlndXJhdGlvbiBzY2hlbWVJZFVyaT0idXJuOm1wZWc6ZGFzaDoyMzAwMzozOmF1ZGlvX2NoYW5uZWxfY29uZmlndXJhdGlvbjoyMDExIiB2YWx1ZT0iMiI+PC9BdWRpb0NoYW5uZWxDb25maWd1cmF0aW9uPgogICAgICA8L1JlcHJlc2VudGF0aW9uPgogICAgPC9BZGFwdGF0aW9uU2V0PgogIDwvUGVyaW9kPgo8L01QRD4=',
        playlistType: 'application/dash+xml',
        metadata: {
            assetId: '',
            baseUrls: ['https://fortnite-public-service-prod11.ol.epicgames.com/audio/jamtracks/ogremix/'],
            supportsCaching: true,
            ucp: 'a',
            version: 'f2528fa1-5f30-42ff-8ae5-a03e3b023a0a'
        }
    });
});

module.exports = router;
