const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const FunctionsService = require('../src/service/api/functions-service');
const DatabaseManager = require('../src/manager/database-manager');


router.get('/eulatracking/api/shared/agreements/fn*', async (req, res) => {
    const eulaPath = path.join(process.cwd(), 'content', 'eula', 'SharedAgreements.json');
    if (fs.existsSync(eulaPath)) {
        const content = JSON.parse(fs.readFileSync(eulaPath, 'utf8'));
        res.json(content);
    } else {
        res.json({});
    }
});

//router.get('/eulatracking/api/public/agreements/fn/account/*', async (req, res) => {
//    const eulaPath = path.join(process.cwd(), 'content', 'eula', 'SharedAgreements.json');
//    if (fs.existsSync(eulaPath)) {
//        const content = JSON.parse(fs.readFileSync(eulaPath, 'utf8'));
//        res.json(content);
//    } else {
//        res.json({});
//    }
//});

router.post('/eulatracking/api/public/agreements/fn/version/:version/account/:accountId/accept', async (req, res) => {
    res.status(204).end();
});

router.get('/fortnite/api/game/v2/friendcodes/*/epic', async (req, res) => {
    res.json([
        {
            codeId: "NEODYME",
            codeType: "CodeToken:FounderFriendInvite",
            dateCreated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
        },
        {
            codeId: "NEODYMEPC",
            codeType: "CodeToken:FounderFriendInvite_XBOX",
            dateCreated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
        },
        {
            codeId: "NEODYMEMOBILE",
            codeType: "CodeToken:MobileInvite",
            dateCreated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
        }
    ]);
});

router.get('/fortnite/api/game/v2/enabled_features', async (req, res) => {
    res.json([]);
});

router.get("/fortnite/api/receipts/v1/account/*/receipts", async (req, res) => {
    res.json([]);
})

router.post("/fortnite/api/game/v2/chat/*/*/*/pc", async (req, res) => {
    res.json({ "GlobalChatRooms": [{"roomName":"neodymeglobal"}] })
})

router.post("/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc", async (req, res) => {
    res.json({});
})

router.get('/launcher/api/public/distributionpoints/', async (req, res) => {
    res.json({
        distributions: [
            "https://epicgames-download1.akamaized.net/",
            "https://download.epicgames.com/",
            "https://download2.epicgames.com/",
            "https://download3.epicgames.com/",
            "https://download4.epicgames.com/",
            "https://neodymeserver.ol.epicgames.com/"
        ]
    });
});

router.get('/launcher/api/public/assets/*', async (req, res) => {
    res.json({
        appName: "FortniteContentBuilds",
        labelName: "Neodyme",
        buildVersion: "++Fortnite+Release-20.00-CL-19458861-Windows",
        catalogItemId: "5cb97847cee34581afdbc445400e2f77",
        expires: "9999-12-31T23:59:59.999Z",
        items: {
            MANIFEST: {
                signature: "Neodyme",
                distribution: "https://neodyme.server/",
                path: "Builds/Fortnite/Content/CloudDir/Neodyme.manifest",
                hash: crypto.randomBytes(20).toString('hex'),
                additionalDistributions: []
            },
            CHUNKS: {
                signature: "Neodyme",
                distribution: "https://neodyme.server/",
                path: "Builds/Fortnite/Content/CloudDir/Neodyme.manifest",
                additionalDistributions: []
            }
        },
        assetId: "FortniteContentBuilds"
    });
});

router.get('/Builds/Fortnite/Content/CloudDir/*.manifest', async (req, res) => {
    res.set('Content-Type', 'application/octet-stream');
    
    const manifestPath = path.join(process.cwd(), 'content', 'assets', 'Neodyme.manifest');
    
    if (fs.existsSync(manifestPath)) {
        const manifest = fs.readFileSync(manifestPath);
        return res.status(200).send(manifest).end();
    }
    
    res.status(404).end();
});

router.get('/Builds/Fortnite/Content/CloudDir/*.chunk', async (req, res) => {
    res.set('Content-Type', 'application/octet-stream');
    
    const chunkPath = path.join(process.cwd(), 'content', 'assets', 'Neodyme.chunk');
    
    if (fs.existsSync(chunkPath)) {
        const chunk = fs.readFileSync(chunkPath);
        return res.status(200).send(chunk).end();
    }
    
    res.status(404).end();
});

router.get('/Builds/Fortnite/Content/CloudDir/*.ini', async (req, res) => {
    const iniPath = path.join(process.cwd(), 'content', 'assets', 'Full.ini');
    
    if (fs.existsSync(iniPath)) {
        const ini = fs.readFileSync(iniPath);
        return res.status(200).send(ini).end();
    }
    
    res.status(404).end();
});

router.post('/fortnite/api/game/v2/grant_access/*', async (req, res) => {
    res.status(204).end();
});

router.post('/api/v1/user/setting', async (req, res) => {
    res.json([]);
});

router.get('/socialban/api/public/v1/*', async (req, res) => {
    res.json({
        bans: [],
        warnings: []
    });
});

router.get('/fortnite/api/game/v2/events/tournamentandhistory/*', async (req, res) => {
    const tournamentPath = path.join(process.cwd(), 'content', 'athena', 'tournament', 'TournamentAndHistory.json');
    
    if (fs.existsSync(tournamentPath)) {
        const tournament = JSON.parse(fs.readFileSync(tournamentPath, 'utf8'));
        return res.json(tournament);
    }
    
    res.json({});
});

router.get('/fortnite/api/statsv2/account/:accountId', async (req, res) => {
    res.json({
        startTime: 0,
        endTime: 0,
        stats: {},
        accountId: req.params.accountId
    });
});

router.get('/statsproxy/api/statsv2/account/:accountId', async (req, res) => {
    res.json({
        startTime: 0,
        endTime: 0,
        stats: {},
        accountId: req.params.accountId
    });
});

router.get('/fortnite/api/stats/accountId/:accountId/bulk/window/alltime', async (req, res) => {
    res.json({
        startTime: 0,
        endTime: 0,
        stats: {},
        accountId: req.params.accountId
    });
});

router.post('/fortnite/api/statsv2/query', async (req, res) => {
    res.json([]);
});

router.post('/statsproxy/api/statsv2/query', async (req, res) => {
    res.json([]);
});

router.post('/fortnite/api/game/v2/events/v2/setSubgroup/*', async (req, res) => {
    res.status(204).end();
});

router.get('/api/v1/events/Fortnite/download/*', async (req, res) => {
    const tournamentPath = path.join(process.cwd(), 'content', 'athena', 'tournament', 'Tournament.json');
    
    if (fs.existsSync(tournamentPath)) {
        const tournament = JSON.parse(fs.readFileSync(tournamentPath, 'utf8'));
        return res.json(tournament);
    }
    
    res.json({});
});

router.get('/api/v1/events/Fortnite/:eventId/history/:accountId', async (req, res) => {
    const historyPath = path.join(process.cwd(), 'content', 'athena', 'tournament', 'History.json');
    
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
    const leaderboardPath = path.join(process.cwd(), 'content', 'athena', 'tournament', 'Leaderboard.json');
    const heroNamesPath = path.join(process.cwd(), 'content', 'campaign', 'HeroNames.json');
    
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
        gameId: "",
        teamId: "",
        teamAccountIds: [],
        liveSessionId: "",
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
            "PLACEMENT_STAT_INDEX:13": {
                timesAchieved: Math.floor(Math.random() * 20),
                pointsEarned: splittedPoints
            },
            "TEAM_ELIMS_STAT_INDEX:37": {
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

router.get('/fortnite/api/game/v2/twitch/*', async (req, res) => {
    res.status(200).end();
});

router.post('/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc', async (req, res) => {
    res.json({});
});

router.get('/presence/api/v1/_/*/last-online', async (req, res) => {
    res.json({});
});

router.get("/fortnite/api/game/v2/world/info", async (req, res) => {
    const worldstw = FunctionsService.getTheater(req);

    res.json(worldstw)
})

router.get('/fortnite/api/game/v2/leaderboards/cohort/:accountId', async (req, res) => {
    res.json({
        accountId: req.params.accountId,
        cohortAccounts: [
            req.params.accountId,
            "Neodyme",
            "Player1",
            "Player2",
            "Player3",
            "Player4"
        ],
        expiresAt: "9999-12-31T00:00:00.000Z",
        playlist: req.query.playlist
    });
});

router.post('/fortnite/api/leaderboards/type/group/stat/:statName/window/:statWindow', async (req, res) => {
    const entries = [];
    
    if (Array.isArray(req.body)) {
        for (const accountId of req.body) {
            entries.push({
                accountId: accountId,
                value: Math.floor(Math.random() * 100) + 1
            });
        }
    }

    res.json({
        entries: entries,
        statName: req.params.statName,
        statWindow: req.params.statWindow
    });
});

router.post('/fortnite/api/leaderboards/type/global/stat/:statName/window/:statWindow', async (req, res) => {
    const heroNamesPath = path.join(process.cwd(), 'content', 'campaign', 'HeroNames.json');
    
    let heroNames = [];
    if (fs.existsSync(heroNamesPath)) {
        heroNames = JSON.parse(fs.readFileSync(heroNamesPath, 'utf8'));
    }

    const entries = [];
    
    for (const heroName of heroNames) {
        entries.push({
            accountId: heroName,
            value: Math.floor(Math.random() * 100) + 1
        });
    }

    res.json({
        entries: entries,
        statName: req.params.statName,
        statWindow: req.params.statWindow
    });
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
    if (req.body.hasOwnProperty('FortCreativeDiscoverySurface') && req.body.FortCreativeDiscoverySurface == 0) {
        const discoveryPath = path.join(process.cwd(), 'content', 'athena', 'discovery', 'DiscoveryApiAssets.json');
        
        if (fs.existsSync(discoveryPath)) {
            const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
            return res.json(discovery);
        }
    }
    
    res.json({
        FortCreativeDiscoverySurface: {
            meta: {
                promotion: req.body.FortCreativeDiscoverySurface || 0
            },
            assets: {}
        }
    });
});

router.all('/v1/epic-settings/public/users/*/values', async (req, res) => {
    const epicSettingsPath = path.join(process.cwd(), 'content', 'EpicSettings.json');
    
    if (fs.existsSync(epicSettingsPath)) {
        const settings = JSON.parse(fs.readFileSync(epicSettingsPath, 'utf8'));
        return res.json(settings);
    }
    
    res.json({});
});

router.get('/fortnite/api/game/v2/br-inventory/account/*', async (req, res) => {
    const accountId = req.params[0];
    const profile = await DatabaseManager.getProfile(accountId, 'athena');

    const globalcash = profile?.stats?.attributes?.stash?.globalcash || 0;

    res.json({
        stash: {
            globalcash: globalcash || 0
        }
    });
});

router.post('/fortnite/api/feedback/:type', async (request, reply) => {
    reply.status(200).send();
})

router.get('/fortnite/api/game/v2/clientfeaturekeys/:accountId', (request, reply) => {
    reply.status(204).send();
})

module.exports = router;
