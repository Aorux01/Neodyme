const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { Errors, sendError } = require('../src/errors/errors');
const functions = require('../src/utils/functions');
const ProfileService = require('../src/services/ProfileService');
const LoggerService = require("../src/utils/logger");

// Shop management endpoint
router.get('/clearitemsforshop', async (req, res) => {
    try {
        res.set('Content-Type', 'text/plain');

        const result = await ProfileService.clearShopItems();
        
        if (result.success) {
            res.send('Success');
        } else {
            res.send('Failed, there are no items to remove');
        }
    } catch (error) {
        LoggerService.log('error', `Error clearing shop items: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// EULA tracking
router.get('/eulatracking/api/shared/agreements/fn*', async (req, res) => {
    try {
        const eulaPath = path.join(__dirname, '..', '..', 'static-content', 'eula', 'SharedAgreements.json');
        
        if (fs.existsSync(eulaPath)) {
            const eulaData = JSON.parse(fs.readFileSync(eulaPath, 'utf8'));
            res.json(eulaData);
        } else {
            res.json({});
        }
    } catch (error) {
        LoggerService.log('error', `Error loading EULA agreements: ${error}`);
        res.json({});
    }
});

router.post('/eulatracking/api/public/agreements/accept', async (req, res) => {
    res.status(204).end();
});

router.get('/eulatracking/api/public/agreements/fn/account/*', async (req, res) => {
    try {
        // const eulaPath = path.join(__dirname, '..', '..', 'static-content', 'eula', 'SharedAgreements.json');
        // 
        // if (fs.existsSync(eulaPath)) {
        //     const eulaData = JSON.parse(fs.readFileSync(eulaPath, 'utf8'));
        //     res.json(eulaData);
        // } else {
        //     res.json({});
        // }
        res.status(204).end();
    } catch (error) {
        LoggerService.log('error', `Error loading EULA agreements: ${error}`);
        res.json({});
    }
});

router.get('/api/v2/interactions/aggregated/Fortnite/:accountId', async (req, res) => {
    try {
        const accountId = req.params.accountId;
        LoggerService.log('info', `Interactions aggregated requested for ${accountId}`);
        
        // Retourne les interactions agrégées par défaut (vide pour un nouveau compte)
        res.json({
            "interactions": [],
            "aggregatedInteractions": {},
            "lastUpdated": new Date().toISOString()
        });
    } catch (error) {
        LoggerService.log('error', `Error in interactions aggregated: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Friend codes
router.get('/fortnite/api/game/v2/friendcodes/*/epic', async (req, res) => {
    res.json([
        {
            "codeId": "NEODYME01",
            "codeType": "CodeToken:FounderFriendInvite",
            "dateCreated": new Date().toISOString()
        },
        {
            "codeId": "NEODYME02",
            "codeType": "CodeToken:FounderFriendInvite_XBOX", 
            "dateCreated": new Date().toISOString()
        },
        {
            "codeId": "NEODYME03",
            "codeType": "CodeToken:MobileInvite",
            "dateCreated": new Date().toISOString()
        }
    ]);
});

// Launcher distribution points
router.get('/launcher/api/public/distributionpoints/', async (req, res) => {
    res.json({
        "distributions": [
            "https://epicgames-download1.akamaized.net/",
            "https://download.epicgames.com/",
            "https://download2.epicgames.com/",
            "https://download3.epicgames.com/",
            "https://download4.epicgames.com/",
            "https://neodyme.epicgames.com/"
        ]
    });
});

// Launcher assets
router.get('/launcher/api/public/assets/*', async (req, res) => {
    try {
        const versionInfo = functions.GetVersionInfo();
        
        res.json({
            "appName": "FortniteContentBuilds",
            "labelName": "Neodyme",
            "buildVersion": `++Fortnite+Release-${versionInfo.build}-CL-${versionInfo.CL}-Windows`,
            "catalogItemId": "5cb97847cee34581afdbc445400e2f77",
            "expires": "9999-12-31T23:59:59.999Z",
            "items": {
                "MANIFEST": {
                    "signature": "Neodyme",
                    "distribution": "https://neodyme.epicgames.com/",
                    "path": "Builds/Fortnite/Content/CloudDir/Neodyme.manifest",
                    "hash": functions.generateHash ? functions.generateHash() : "neodyme-manifest-hash",
                    "additionalDistributions": []
                },
                "CHUNKS": {
                    "signature": "Neodyme", 
                    "distribution": "https://neodyme.epicgames.com/",
                    "path": "Builds/Fortnite/Content/CloudDir/Neodyme.manifest",
                    "additionalDistributions": []
                }
            },
            "assetId": "FortniteContentBuilds"
        });
    } catch (error) {
        LoggerService.log('error', `Error generating launcher assets: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Content delivery
router.get('/Builds/Fortnite/Content/CloudDir/*.manifest', async (req, res) => {
    try {
        res.set('Content-Type', 'application/octet-stream');
        
        const manifestPath = path.join(__dirname, '..', '..', 'static-content', 'assets', 'Neodyme.manifest');
        
        if (!fs.existsSync(manifestPath)) {
            LoggerService.log('warn', `Manifest file not found: ${manifestPath}`);
            return sendError(res, Errors.NotFound);
        }
        
        const manifest = fs.readFileSync(manifestPath);
        res.status(200).send(manifest).end();
    } catch (error) {
        LoggerService.log('error', `Error serving manifest: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

router.get('/Builds/Fortnite/Content/CloudDir/*.chunk', async (req, res) => {
    try {
        res.set('Content-Type', 'application/octet-stream');
        
        const chunkPath = path.join(__dirname, '..', '..', 'static-content', 'assets', 'Neodyme.chunk');
        
        if (!fs.existsSync(chunkPath)) {
            LoggerService.log('warn', `Chunk file not found: ${chunkPath}`);
            return sendError(res, Errors.NotFound);
        }
        
        const chunk = fs.readFileSync(chunkPath);
        res.status(200).send(chunk).end();
    } catch (error) {
        LoggerService.log('error', `Error serving chunk: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

router.get('/Builds/Fortnite/Content/CloudDir/*.ini', async (req, res) => {
    try {
        const iniPath = path.join(__dirname, '..', '..', 'static-content', 'assets', 'Full.ini');
        
        if (!fs.existsSync(iniPath)) {
            LoggerService.log('warn', `INI file not found: ${iniPath}`);
            return sendError(res, Errors.NotFound);
        }
        
        const ini = fs.readFileSync(iniPath);
        res.status(200).send(ini).end();
    } catch (error) {
        LoggerService.log('error', `Error serving ini file: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Game access and settings
router.post('/fortnite/api/game/v2/grant_access/*', async (req, res) => {
    res.status(204).json({});
});

router.post('/api/v1/user/setting', async (req, res) => {
    res.json([]);
});

router.get('/waitingroom/api/waitingroom', async (req, res) => {
    res.status(204).end();
});

// Social and bans
router.get('/socialban/api/public/v1/*', async (req, res) => {
    res.json({
        "bans": [],
        "warnings": []
    });
});

// Tournament and events
router.get('/fortnite/api/game/v2/events/tournamentandhistory/*', async (req, res) => {
    try {
        const tournamentPath = path.join(__dirname, '..', '..', 'static-content', 'athena', 'tournament', 'tournamentandhistory.json');
        
        if (fs.existsSync(tournamentPath)) {
            const tournamentData = JSON.parse(fs.readFileSync(tournamentPath, 'utf8'));
            res.json(tournamentData);
        } else {
            res.json({});
        }
    } catch (error) {
        LoggerService.log('error', `Error loading tournament data: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Statistics endpoints
router.get('/fortnite/api/statsv2/account/:accountId', async (req, res) => {
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

router.get('/statsproxy/api/statsv2/account/:accountId', async (req, res) => {
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

router.get('/fortnite/api/stats/accountId/:accountId/bulk/window/alltime', async (req, res) => {
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

// Media content
router.get('/d98eeaac-2bfa-4bf4-8a59-bdc95469c693', async (req, res) => {
    res.json({
        "playlist": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPE1QRCB4bWxucz0idXJuOm1wZWc6ZGFzaDpzY2hlbWE6bXBkOjIwMTEiIHhtbG5zOnhzaT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEtaW5zdGFuY2UiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4c2k6c2NoZW1hTG9jYXRpb249InVybjptcGVnOkRBU0g6c2NoZW1hOk1QRDoyMDExIGh0dHA6Ly9zdGFuZGFyZHMuaXNvLm9yZy9pdHRmL1B1YmxpY2x5QXZhaWxhYmxlU3RhbmRhcmRzL01QRUctREFTSF9zY2hlbWFfZmlsZXMvREFTSC1NUEQueHNkIiBwcm9maWxlcz0idXJuOm1wZWc6ZGFzaDpwcm9maWxlOmlzb2ZmLWxpdmU6MjAxMSIgdHlwZT0ic3RhdGljIiBtZWRpYVByZXNlbnRhdGlvbkR1cmF0aW9uPSJQVDMwLjIxM1MiIG1heFNlZ21lbnREdXJhdGlvbj0iUFQyLjAwMFMiIG1pbkJ1ZmZlclRpbWU9IlBUNC4xMDZTIj4KICA8QmFzZVVSTD5odHRwczovL3BpbGdyaW0ucXN0di5vbi5lcGljZ2FtZXMuY29tL3VtbXFVcUNTRlVXZVFmelR2cy9mMjUyOGZhMS01ZjMwLTQyZmYtOGFlNS1hMDNlM2IwMjNhMGEvPC9CYXNlVVJMPgogIDxQcm9ncmFtSW5mb3JtYXRpb24+PC9Qcm9ncmFtSW5mb3JtYXRpb24+CiAgPFBlcmlvZCBpZD0iMCIgc3RhcnQ9IlBUMFMiPgogICAgPEFkYXB0YXRpb25TZXQgaWQ9IjAiIGNvbnRlbnRUeXBlPSJhdWRpbyIgc3RhcnRXaXRoU0FQPSIxIiBzZWdtZW50QWxpZ25tZW50PSJ0cnVlIiBiaXRzdHJlYW1Td2l0Y2hpbmc9InRydWUiPgogICAgICA8UmVwcmVzZW50YXRpb24gaWQ9IjAiIGF1ZGlvU2FtcGxpbmdSYXRlPSI0ODAwMCIgYmFuZHdpZHRoPSIxMjgwMDAiIG1pbWVUeXBlPSJhdWRpby9tcDQiIGNvZGVjcz0ibXA0YS40MC4yIj4KICAgICAgICA8U2VnbWVudFRlbXBsYXRlIGR1cmF0aW9uPSIyMDAwMDAwIiB0aW1lc2NhbGU9IjEwMDAwMDAiIGluaXRpYWxpemF0aW9uPSJpbml0XyRSZXByZXNlbnRhdGlvbklEJC5tcDQiIG1lZGlhPSJzZWdtZW50XyRSZXByZXNlbnRhdGlvbklEJF8kTnVtYmVyJC5tNHMiIHN0YXJ0TnVtYmVyPSIxIj48L1NlZ21lbnRUZW1wbGF0ZT4KICAgICAgICA8QXVkaW9DaGFubmVsQ29uZmlndXJhdGlvbiBzY2hlbWVJZFVyaT0idXJuOm1wZWc6ZGFzaDoyMzAwMzozOmF1ZGlvX2NoYW5uZWxfY29uZmlndXJhdGlvbjoyMDExIiB2YWx1ZT0iMiI+PC9BdWRpb0NoYW5uZWxDb25maWd1cmF0aW9uPgogICAgICA8L1JlcHJlc2VudGF0aW9uPgogICAgPC9BZGFwdGF0aW9uU2V0PgogIDwvUGVyaW9kPgo8L01QRD4=",
        "playlistType": "application/dash+xml",
        "metadata": {
            "assetId": "",
            "baseUrls": [
                "https://fortnite-public-service-prod11.ol.epicgames.com/ummqUqCSFUWeQfzTvs/f2528fa1-5f30-42ff-8ae5-a03e3b023a0a/"
            ],
            "supportsCaching": true,
            "ucp": "a",
            "version": functions.generateUUID ? functions.generateUUID() : "neodyme-version-id"
        }
    });
});

// Feedback and analytics
router.post('/fortnite/api/feedback/*', async (req, res) => {
    res.status(200).end();
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

// Game features
router.get('/fortnite/api/game/v2/enabled_features', async (req, res) => {
    res.json([]);
});

// Tournament API
router.get('/api/v1/events/Fortnite/download/*', async (req, res) => {
    try {
        const tournamentPath = path.join(__dirname, '..', '..', 'static-content', 'athena', 'tournament', 'tournament.json');
        
        if (fs.existsSync(tournamentPath)) {
            const tournament = JSON.parse(fs.readFileSync(tournamentPath, 'utf8'));
            res.json(tournament);
        } else {
            res.json({});
        }
    } catch (error) {
        LoggerService.log('error', `Error loading tournament: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

router.get('/api/v1/events/Fortnite/:eventId/history/:accountId', async (req, res) => {
    try {
        const historyPath = path.join(__dirname, '..', '..', 'static-content', 'athena', 'tournament', 'history.json');
        
        if (fs.existsSync(historyPath)) {
            const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            
            if (history && history.length > 0) {
                history[0].scoreKey.eventId = req.params.eventId;
                history[0].teamId = req.params.accountId;
                history[0].teamAccountIds = [req.params.accountId];
            }
            
            res.json(history);
        } else {
            res.json([]);
        }
    } catch (error) {
        LoggerService.log('error', `Error loading tournament history: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

router.get('/api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId', async (req, res) => {
    try {
        const leaderboardsPath = path.join(__dirname, '..', '..', 'static-content', 'athena', 'tournament', 'leaderboard.json');
        const heroNamesPath = path.join(__dirname, '..', '..', 'static-content', 'campaign', 'heroNames.json');
        
        if (!fs.existsSync(leaderboardsPath) || !fs.existsSync(heroNamesPath)) {
            return sendError(res, Errors.NotFound);
        }
        
        const leaderboards = JSON.parse(fs.readFileSync(leaderboardsPath, 'utf8'));
        const heroNames = JSON.parse(fs.readFileSync(heroNamesPath, 'utf8'));
        
        const shuffledNames = functions.shuffleArray ? functions.shuffleArray([...heroNames]) : [...heroNames].sort(() => Math.random() - 0.5);
        shuffledNames.unshift(req.params.accountId);

        leaderboards.eventId = req.params.eventId;
        leaderboards.eventWindowId = req.params.eventWindowId;

        const entryTemplate = leaderboards.entryTemplate;
        leaderboards.entries = [];

        for (let i = 0; i < shuffledNames.length; i++) {
            const entry = { ...entryTemplate };
            entry.eventId = req.params.eventId;
            entry.eventWindowId = req.params.eventWindowId;
            entry.teamAccountIds = [shuffledNames[i]];
            entry.teamId = shuffledNames[i];
            
            entry.pointsEarned = entry.score = 69 - i;
            const splittedPoints = Math.floor(Math.random() * entry.pointsEarned);
            
            entry.pointBreakdown = {
                "PLACEMENT_STAT_INDEX:13": {
                    "timesAchieved": 13,
                    "pointsEarned": splittedPoints
                },
                "TEAM_ELIMS_STAT_INDEX:37": {
                    "timesAchieved": 13,
                    "pointsEarned": entry.pointsEarned - splittedPoints
                }
            };
            entry.rank = i + 1;

            leaderboards.entries.push(entry);
        }
        
        res.json(leaderboards);
    } catch (error) {
        LoggerService.log('error', `Error generating tournament leaderboards: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Twitch integration
router.get('/fortnite/api/game/v2/twitch/*', async (req, res) => {
    res.status(200).end();
});

// World info
router.get('/fortnite/api/game/v2/world/info', async (req, res) => {
    try {
        const worldInfo = functions.getTheater ? functions.getTheater(req) : {};
        res.json(worldInfo);
    } catch (error) {
        LoggerService.log('error', `Error getting world info: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Chat system
router.post('/fortnite/api/game/v2/chat/*/*/*/pc', async (req, res) => {
    res.json({ 
        "GlobalChatRooms": [
            { "roomName": "neodymeglobal" }
        ] 
    });
});

router.post('/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc', async (req, res) => {
    res.json({});
});

// Presence
router.get('/presence/api/v1/_/*/last-online', async (req, res) => {
    res.json({});
});

// Receipts
router.get('/fortnite/api/receipts/v1/account/*/receipts', async (req, res) => {
    res.json([]);
});

// Leaderboards
router.get('/fortnite/api/game/v2/leaderboards/cohort/:accountId', async (req, res) => {
    res.json({
        "accountId": req.params.accountId,
        "cohortAccounts": [
            req.params.accountId,
            "Neodyme",
            "Aorux",
            "Admin",
            "Player1",
            "Player2",
            "TestUser"
        ],
        "expiresAt": "9999-12-31T00:00:00.000Z",
        "playlist": req.query.playlist
    });
});

router.post('/fortnite/api/leaderboards/type/group/stat/:statName/window/:statWindow', async (req, res) => {
    const entries = req.body.map(accountId => ({
        "accountId": accountId,
        "value": Math.floor(Math.random() * 68) + 1
    }));

    res.json({
        "entries": entries,
        "statName": req.params.statName,
        "statWindow": req.params.statWindow
    });
});

router.post('/fortnite/api/leaderboards/type/global/stat/:statName/window/:statWindow', async (req, res) => {
    try {
        const heroNamesPath = path.join(__dirname, '..', '..', 'static-content', 'campaign', 'heroNames.json');
        
        let heroNames = [];
        if (fs.existsSync(heroNamesPath)) {
            heroNames = JSON.parse(fs.readFileSync(heroNamesPath, 'utf8'));
        }
        
        const entries = heroNames.map(name => ({
            "accountId": name,
            "value": Math.floor(Math.random() * 68) + 1
        }));

        res.json({
            "entries": entries,
            "statName": req.params.statName,
            "statWindow": req.params.statWindow
        });
    } catch (error) {
        LoggerService.log('error', `Error generating global leaderboards: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Homebase
router.get('/fortnite/api/game/v2/homebase/allowed-name-chars', async (req, res) => {
    res.json({
        "ranges": [
            48, 57, 65, 90, 97, 122, 192, 255, 260, 265, 280, 281, 286, 287,
            304, 305, 321, 324, 346, 347, 350, 351, 377, 380, 1024, 1279,
            1536, 1791, 4352, 4607, 11904, 12031, 12288, 12351, 12352, 12543,
            12592, 12687, 12800, 13055, 13056, 13311, 13312, 19903, 19968,
            40959, 43360, 43391, 44032, 55215, 55216, 55295, 63744, 64255,
            65072, 65103, 65281, 65470, 131072, 173791, 194560, 195103
        ],
        "singlePoints": [32, 39, 45, 46, 95, 126],
        "excludedPoints": [208, 215, 222, 247]
    });
});

// Data router
router.post('/datarouter/api/v1/public/data', async (req, res) => {
    res.status(204).end();
});

// Creative Discovery
router.post('/api/v1/assets/Fortnite/*/*', async (req, res) => {
    try {
        if (req.body?.FortCreativeDiscoverySurface === 0) {
            const discoveryPath = path.join(__dirname, '..', '..', 'static-content', 'athena', 'discovery', 'discovery_api_assets.json');
            
            if (fs.existsSync(discoveryPath)) {
                const discoveryAssets = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
                res.json(discoveryAssets);
            } else {
                res.json({
                    "FortCreativeDiscoverySurface": {
                        "meta": { "promotion": 0 },
                        "assets": {}
                    }
                });
            }
        } else {
            res.json({
                "FortCreativeDiscoverySurface": {
                    "meta": {
                        "promotion": req.body?.FortCreativeDiscoverySurface || 0
                    },
                    "assets": {}
                }
            });
        }
    } catch (error) {
        LoggerService.log('error', `Error handling creative discovery: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Region info
router.get('/region', async (req, res) => {
    res.json({
        "continent": {
            "code": "EU",
            "geoname_id": 6255148,
            "names": {
                "de": "Europa",
                "en": "Europe",
                "es": "Europa",
                "fr": "Europe",
                "ja": "ヨーロッパ",
                "pt-BR": "Europa",
                "ru": "Европа",
                "zh-CN": "欧洲"
            }
        },
        "country": {
            "geoname_id": 2635167,
            "is_in_european_union": false,
            "iso_code": "GB",
            "names": {
                "de": "UK",
                "en": "United Kingdom",
                "es": "RU",
                "fr": "Royaume Uni",
                "ja": "英国",
                "pt-BR": "Reino Unido",
                "ru": "Британия",
                "zh-CN": "英国"
            }
        },
        "subdivisions": [
            {
                "geoname_id": 6269131,
                "iso_code": "ENG",
                "names": {
                    "de": "England",
                    "en": "England",
                    "es": "Inglaterra",
                    "fr": "Angleterre",
                    "ja": "イングランド",
                    "pt-BR": "Inglaterra",
                    "ru": "Англия",
                    "zh-CN": "英格兰"
                }
            }
        ]
    });
});

// Parental Controls
router.all('/v1/epic-settings/public/users/*/values', async (req, res) => {
    try {
        const settingsPath = path.join(__dirname, '..', '..', 'static-content', 'epic-settings.json');
        
        if (fs.existsSync(settingsPath)) {
            const epicSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            res.json(epicSettings);
        } else {
            res.json({});
        }
    } catch (error) {
        LoggerService.log('error', `Error loading epic settings: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Battle Royale inventory
router.get('/fortnite/api/game/v2/br-inventory/account/*', async (req, res) => {
    res.json({
        "stash": {
            "globalcash": 5000
        }
    });
});

module.exports = router;