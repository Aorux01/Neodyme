const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const emptyStats = (accountId) => ({
    startTime: 0,
    endTime: 0,
    stats: {},
    accountId
});

router.get('/fortnite/api/statsv2/account/:accountId', async (req, res) => {
    res.json(emptyStats(req.params.accountId));
});

router.get('/statsproxy/api/statsv2/account/:accountId', async (req, res) => {
    res.json(emptyStats(req.params.accountId));
});

router.get('/fortnite/api/stats/accountId/:accountId/bulk/window/alltime', async (req, res) => {
    res.json(emptyStats(req.params.accountId));
});

router.post('/fortnite/api/statsv2/query', async (req, res) => {
    res.json([]);
});

router.post('/statsproxy/api/statsv2/query', async (req, res) => {
    res.json([]);
});

router.get('/fortnite/api/game/v2/leaderboards/cohort/:accountId', async (req, res) => {
    res.json({
        accountId: req.params.accountId,
        cohortAccounts: [
            req.params.accountId,
            'Neodyme', 'Player1', 'Player2', 'Player3', 'Player4'
        ],
        expiresAt: '9999-12-31T00:00:00.000Z',
        playlist: req.query.playlist
    });
});

router.post('/fortnite/api/leaderboards/type/group/stat/:statName/window/:statWindow', async (req, res) => {
    const entries = [];
    if (Array.isArray(req.body)) {
        for (const accountId of req.body) {
            entries.push({ accountId, value: Math.floor(Math.random() * 100) + 1 });
        }
    }
    res.json({ entries, statName: req.params.statName, statWindow: req.params.statWindow });
});

router.post('/fortnite/api/leaderboards/type/global/stat/:statName/window/:statWindow', async (req, res) => {
    const heroNamesPath = path.join(process.cwd(), 'content', 'campaign', 'hero-names.json');
    let heroNames = [];
    if (fs.existsSync(heroNamesPath)) {
        heroNames = JSON.parse(fs.readFileSync(heroNamesPath, 'utf8'));
    }
    const entries = heroNames.map(accountId => ({
        accountId,
        value: Math.floor(Math.random() * 100) + 1
    }));
    res.json({ entries, statName: req.params.statName, statWindow: req.params.statWindow });
});

module.exports = router;
