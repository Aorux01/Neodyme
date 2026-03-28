const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

router.get('/fortnite/api/game/v2/events/tournamentandhistory/*', async (req, res) => {
    const tournamentPath = path.join(process.cwd(), 'content', 'athena', 'tournament', 'tournament-and-history.json');
    if (fs.existsSync(tournamentPath)) {
        return res.json(JSON.parse(fs.readFileSync(tournamentPath, 'utf8')));
    }
    res.json({});
});

router.post('/fortnite/api/game/v2/events/v2/setSubgroup/*', async (req, res) => {
    res.status(204).end();
});

router.get('/api/v1/events/Fortnite/download/*', async (req, res) => {
    const tournamentPath = path.join(process.cwd(), 'content', 'athena', 'tournament', 'tournament.json');
    if (fs.existsSync(tournamentPath)) {
        return res.json(JSON.parse(fs.readFileSync(tournamentPath, 'utf8')));
    }
    res.json({});
});

router.get('/api/v1/events/Fortnite/:eventId/history/:accountId', async (req, res) => {
    const historyPath = path.join(process.cwd(), 'content', 'athena', 'tournament', 'history.json');
    if (fs.existsSync(historyPath)) {
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        if (history[0]) {
            history[0].scoreKey.eventId = req.params.eventId;
            history[0].teamId = req.params.accountId;
            history[0].teamAccountIds = [req.params.accountId];
        }
        return res.json(history);
    }
    res.json([]);
});

router.get('/api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId', async (req, res) => {
    const leaderboardPath = path.join(process.cwd(), 'content', 'athena', 'tournament', 'leaderboard.json');
    const heroNamesPath = path.join(process.cwd(), 'content', 'campaign', 'hero-names.json');

    if (!fs.existsSync(leaderboardPath) || !fs.existsSync(heroNamesPath)) {
        return res.json({ entries: [] });
    }

    const leaderboards = JSON.parse(fs.readFileSync(leaderboardPath, 'utf8'));
    let heroNames = JSON.parse(fs.readFileSync(heroNamesPath, 'utf8'));

    heroNames = heroNames.sort(() => Math.random() - 0.5);
    heroNames.unshift(req.params.accountId);

    leaderboards.eventId = req.params.eventId;
    leaderboards.eventWindowId = req.params.eventWindowId;
    leaderboards.entries = [];

    const entryTemplate = {
        gameId: '',
        teamId: '',
        teamAccountIds: [],
        liveSessionId: '',
        pointsEarned: 0,
        score: 0,
        rank: 0,
        percentile: 0,
        pointBreakdown: {},
        sessionHistory: [],
        tokens: []
    };

    for (let i = 0; i < Math.min(heroNames.length, 100); i++) {
        const entry = { ...entryTemplate };
        entry.eventId = req.params.eventId;
        entry.eventWindowId = req.params.eventWindowId;
        entry.teamAccountIds = [heroNames[i]];
        entry.teamId = heroNames[i];
        entry.pointsEarned = entry.score = 100 - i;

        const splittedPoints = Math.floor(Math.random() * entry.pointsEarned);
        entry.pointBreakdown = {
            'PLACEMENT_STAT_INDEX:13': {
                timesAchieved: Math.floor(Math.random() * 20),
                pointsEarned: splittedPoints
            },
            'TEAM_ELIMS_STAT_INDEX:37': {
                timesAchieved: Math.floor(Math.random() * 50),
                pointsEarned: entry.pointsEarned - splittedPoints
            }
        };
        entry.rank = i + 1;
        entry.percentile = ((i + 1) / heroNames.length * 100).toFixed(2);
        leaderboards.entries.push(entry);
    }

    res.json(leaderboards);
});

module.exports = router;
