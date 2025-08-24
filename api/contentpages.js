const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const Functions = require('../src/utils/functions');
const LoggerService = require("../src/utils/logger");

// Load content pages data
let contentPagesData = null;
let sparkTracksData = null;
let seasonPassesData = null;
let motdData = null;

async function loadContentData() {
    try {
        // Load main content pages
        const contentPagesPath = path.join(process.cwd(), 'static-content', 'contentpages', 'contentpages.json');
        const contentPagesRaw = await fs.readFile(contentPagesPath, 'utf8');
        contentPagesData = JSON.parse(contentPagesRaw);

        // Load spark tracks
        const sparkTracksPath = path.join(process.cwd(), 'static-content', 'athena', 'sparkTracks.json');
        try {
            const sparkTracksRaw = await fs.readFile(sparkTracksPath, 'utf8');
            sparkTracksData = JSON.parse(sparkTracksRaw);
        } catch (error) {
            sparkTracksData = createDefaultSparkTracks();
        }

        // Load season passes
        const seasonPassesPath = path.join(process.cwd(), 'static-content', 'athena', 'seasonPasses.json');
        try {
            const seasonPassesRaw = await fs.readFile(seasonPassesPath, 'utf8');
            seasonPassesData = JSON.parse(seasonPassesRaw);
        } catch (error) {
            seasonPassesData = createDefaultSeasonPasses();
        }

        // Load MOTD
        const motdPath = path.join(process.cwd(), 'static-content', 'athena', 'motdTarget.json');
        try {
            const motdRaw = await fs.readFile(motdPath, 'utf8');
            motdData = JSON.parse(motdRaw);
        } catch (error) {
            motdData = createDefaultMotd();
        }
    } catch (error) {
        LoggerService.log('error', `Failed to load content data: ${error}`);
    }
}

function createDefaultSparkTracks() {
    return {
        "_title": "Spark Tracks",
        "lastModified": new Date().toISOString(),
        "_locale": "en-US"
    };
}

function createDefaultSeasonPasses() {
    return {
        "_title": "Season Passes",
        "seasonPasses": [],
        "lastModified": new Date().toISOString(),
        "_locale": "en-US"
    };
}

function createDefaultMotd() {
    return {
        contentItems: [
            {
                contentType: "DynamicBackground",
                contentId: "DynamicBackground",
                tcId: "neodyme-background",
                contentFields: {
                    title: {
                        en: "Welcome to Neodyme"
                    },
                    body: {
                        en: "Enjoy your Fortnite experience!"
                    }
                }
            }
        ],
        contentType: "motd",
        contentId: "motd",
        tcId: "neodyme-motd"
    };
}

// Initialize content data
loadContentData();

// Get spark tracks
router.get('/content/api/pages/fortnite-game/spark-tracks', async (req, res) => {
    if (!sparkTracksData) await loadContentData();
    res.json(sparkTracksData);
});

// Get radio stations
router.get('/content/api/pages/fortnite-game/radio-stations', async (req, res) => {
    res.json({
        "_title": "Radio Stations",
        "radioStationList": {
            "_type": "RadioStationList",
            "stations": [
                {
                    "resourceID": "NeodymeRadio",
                    "stationImage": "/images/radio/neodyme-radio.png",
                    "_type": "RadioStationItem",
                    "title": {
                        "ar": "نيوديم راديو",
                        "de": "Neodyme Radio",
                        "en": "Neodyme Radio",
                        "es": "Radio Neodyme",
                        "es-419": "Radio Neodyme",
                        "fr": "Radio Neodyme",
                        "it": "Radio Neodyme",
                        "ja": "ネオダイムラジオ",
                        "ko": "네오다임 라디오",
                        "pl": "Radio Neodyme",
                        "pt-BR": "Rádio Neodyme",
                        "ru": "Радио Неодим",
                        "tr": "Neodyme Radyo",
                        "zh-CN": "钕电台",
                        "zh-Hant": "釹電台"
                    }
                },
                {
                    "resourceID": "PartyRoyale",
                    "stationImage": "/images/radio/party-royale.png",
                    "_type": "RadioStationItem",
                    "title": {
                        "ar": "الحفل الملكي",
                        "de": "Party Royale",
                        "en": "Party Royale",
                        "es": "Fiesta magistral",
                        "es-419": "Fiesta campal",
                        "fr": "Fête royale",
                        "it": "Party Reale",
                        "ja": "パーティーロイヤル",
                        "ko": "파티로얄",
                        "pl": "Królewska Impreza",
                        "pt-BR": "Festa Royale",
                        "ru": "Королевская вечеринка",
                        "tr": "Çılgın Parti",
                        "zh-CN": "空降派对",
                        "zh-Hant": "空降派對"
                    }
                }
            ]
        },
        "_noIndex": false,
        "_activeDate": new Date().toISOString(),
        "lastModified": new Date().toISOString(),
        "_locale": "en-US",
        "_templateName": "FortniteGameRadioStations",
        "_suggestedPrefetch": []
    });
});

// Get season passes
router.get('/content/api/pages/fortnite-game/seasonpasses', async (req, res) => {
    if (!seasonPassesData) await loadContentData();
    
    // Apply translations based on request headers
    const data = JSON.parse(JSON.stringify(seasonPassesData));
    chooseTranslations(data, req);
    
    res.json(data);
});

// Get content pages - general endpoint
router.get('/content/api/pages/*', async (req, res) => {
    if (!contentPagesData) await loadContentData();
    
    const pageName = req.params[0];
    
    // Check if specific page exists
    if (contentPagesData[pageName]) {
        return res.json(contentPagesData[pageName]);
    }
    
    // Return full content pages for fortnite-game
    if (pageName === 'fortnite-game') {
        return res.json(contentPagesData);
    }
    
    // Default response
    res.json({
        "_title": pageName,
        "_activeDate": new Date().toISOString(),
        "lastModified": new Date().toISOString(),
        "_locale": "en-US"
    });
});

// MOTD target endpoint
router.post('/api/v1/fortnite-br/*/target', async (req, res) => {
    if (!motdData) await loadContentData();
    
    const motd = JSON.parse(JSON.stringify(motdData));
    const language = req.body.language || req.body.parameters?.language || 'en';
    
    // Apply translations
    chooseTranslations(motd, req, language);
    
    // Add placements based on tags
    if (req.body.tags && Array.isArray(req.body.tags)) {
        motd.contentItems.forEach(item => {
            item.placements = req.body.tags.map((tag, index) => ({
                trackingId: Functions.generateRandomString(16),
                tag: tag,
                position: index
            }));
        });
    }
    
    res.json(motd);
});

// Translation helper function
function chooseTranslations(obj, req, language) {
    const lang = language || req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
    
    function processObject(o) {
        if (Array.isArray(o)) {
            o.forEach(processObject);
        } else if (o && typeof o === 'object') {
            for (const key in o) {
                if (o[key] && typeof o[key] === 'object') {
                    // Check if this is a translation object
                    if (o[key].en || o[key].de || o[key].es || o[key].fr || o[key].it || o[key].ja) {
                        // Replace with the appropriate translation
                        o[key] = o[key][lang] || o[key]['en'] || Object.values(o[key])[0];
                    } else {
                        processObject(o[key]);
                    }
                }
            }
        }
    }
    
    processObject(obj);
    return obj;
}

module.exports = router;