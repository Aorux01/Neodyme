const fs = require('fs');
const path = require('path');
const LoggerService = require('../logger/logger-service');
const VersionService = require('./version-service');

class PagesService {
    static contentPagesCache = null;
    static lastCacheUpdate = 0;
    static cacheTimeout = 5 * 60 * 1000;

    static loadJsonFile(filePath) {
        try {
            const rawData = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(rawData);
        } catch (error) {
            LoggerService.log('error', `Failed to load ${filePath}: ${error.message}`);
            return null;
        }
    }

    static getAllBattlepasses() {
        const battlepassDir = path.join(process.cwd(), 'content', 'athena', 'battlepasses');
        
        try {
            if (!fs.existsSync(battlepassDir)) {
                return [];
            }

            const files = fs.readdirSync(battlepassDir);
            const battlepasses = [];

            files.forEach(file => {
                if (file.endsWith('.json') && file.startsWith('Season')) {
                    const filePath = path.join(battlepassDir, file);
                    const data = this.loadJsonFile(filePath);
                    if (data) {
                        battlepasses.push(data);
                    }
                }
            });

            battlepasses.sort((a, b) => {
                const seasonA = parseInt(a.seasonNumber || 0);
                const seasonB = parseInt(b.seasonNumber || 0);
                return seasonB - seasonA;
            });

            return battlepasses;
        } catch (error) {
            LoggerService.log('error', `Failed to load battlepasses: ${error.message}`);
            return [];
        }
    }

    static getSparkTracks() {
        const sparkTracksPath = path.join(process.cwd(), 'content', 'pages', 'SparkTracks.json');
        const data = this.loadJsonFile(sparkTracksPath);
        
        if (data) {
            return data;
        }

        return {
            "_title": "Spark Tracks",
            "lastModified": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
            "_locale": "en-US"
        };
    }

    static getRadioStations() {
        const radioPath = path.join(process.cwd(), 'content', 'pages', 'RadioStations.json');
        const data = this.loadJsonFile(radioPath);
        
        if (data) {
            return data;
        }

        return {
            "_title": "Radio Stations",
            "radioStationList": {
                "_type": "RadioStationList",
                "stations": [
                    {
                        "resourceID": "NeodymeRadio",
                        "stationImage": "/images/radio/neodyme-radio.png",
                        "_type": "RadioStationItem",
                        "title": {
                            "en": "Neodyme Radio"
                        }
                    }
                ]
            },
            "_noIndex": false,
            "_activeDate": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
            "lastModified": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
            "_locale": "en-US",
            "_templateName": "FortniteGameRadioStations",
            "_suggestedPrefetch": []
        };
    }

    static getSeasonPasses(req) {
        const battlepasses = this.getAllBattlepasses();
        
        const response = {
            "_title": "Season Passes",
            "seasonPasses": battlepasses,
            "lastModified": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
            "_locale": "en-US"
        };

        return this.applyTranslations(response, req);
    }

    static getMotd() {
        const motdPath = path.join(process.cwd(), 'config', 'MOTD.json');
        const data = this.loadJsonFile(motdPath);
        
        return data;
    }

    static getContentPages(req) {
        const now = Date.now();
        const versionInfo = VersionService.getVersionInfo(req);
        
        if (this.contentPagesCache && (now - this.lastCacheUpdate) < this.cacheTimeout) {
            return this.applyTranslations(this.contentPagesCache, req);
        }

        const baseContentPagesPath = path.join(process.cwd(), 'content', 'pages', 'contentpages.json');
        let contentPages = this.loadJsonFile(baseContentPagesPath);

        if (!contentPages) {
            contentPages = {
                "_title": "Fortnite Game",
                "_activeDate": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
                "lastModified": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
                "_locale": "en-US"
            };
        }

        const configDir = path.join(process.cwd(), 'content', 'pages');
        
        try {
            if (fs.existsSync(configDir)) {
                const files = fs.readdirSync(configDir);
                
                files.forEach(file => {
                    if (file.endsWith('.json') && file !== 'contentpages.json') {
                        const filePath = path.join(configDir, file);
                        const data = this.loadJsonFile(filePath);
                        
                        if (data) {
                            this.mergeContentPages(contentPages, data, file.replace('.json', ''));
                        }
                    }
                });
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load config files: ${error.message}`);
        }

        contentPages.lastModified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

        this.contentPagesCache = contentPages;
        this.lastCacheUpdate = now;

        let translated = this.applyTranslations(contentPages, req);

        try {
            const backgrounds = translated.dynamicbackgrounds && translated.dynamicbackgrounds.backgrounds && translated.dynamicbackgrounds.backgrounds.backgrounds;
            const season = `season${versionInfo.season}${versionInfo.season >= 21 ? "00" : ""}`;
            if (backgrounds && backgrounds[0]) backgrounds[0].stage = season;
            if (backgrounds && backgrounds[1]) backgrounds[1].stage = season;

            switch (versionInfo.season) {
                case 9:
                    if (translated.lobby) {
                        translated.lobby.backgroundimage = "";
                        translated.lobby.stage = "default";
                    }
                    break;
                case 10:
                    if (backgrounds && backgrounds[0]) backgrounds[0].stage = "seasonx";
                    if (backgrounds && backgrounds[1]) backgrounds[1].stage = "seasonx";
                    break;
                case 11: case 12: case 13: case 14: case 15: case 16: case 17: case 18: case 19:
                    break;
                case 20:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp20-lobby-2048x1024-d89eb522746c.png";
                    break;
                case 21:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/s21-lobby-background-2048x1024-2e7112b25dc3.jpg";
                    break;
                case 22:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp22-lobby-square-2048x2048-2048x2048-e4e90c6e8018.jpg";
                    break;
                case 23:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp23-lobby-2048x1024-2048x1024-26f2c1b27f63.png";
                    break;
                case 24:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-ch4s2-bp-lobby-4096x2048-edde08d15f7e.jpg";
                    break;
                case 25:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/s25-lobby-4k-4096x2048-4a832928e11f.jpg";
                    if (backgrounds && backgrounds[1]) backgrounds[1].backgroundimage = "https://cdn2.unrealengine.com/fn-shop-ch4s3-04-1920x1080-785ce1d90213.png";
                    break;
                case 27:
                    if (backgrounds && backgrounds[0]) backgrounds[0].stage = "rufus";
                    break;
                default:
                    if (backgrounds && backgrounds[0]) {
                        backgrounds[0].stage = "defaultnotris";
                        backgrounds[0].backgroundimage = "https://fortnite-public-service-prod11.ol.epicgames.com/images/lightlobbybg.png";
                    }
            }

            switch (versionInfo.build) {
                case 9.30:
                    if (translated.lobby) translated.lobby.stage = "summer";
                    break;
                case 11.10:
                    if (backgrounds && backgrounds[0]) backgrounds[0].stage = "fortnitemares";
                    if (backgrounds && backgrounds[1]) backgrounds[1].stage = "fortnitemares";
                    break;
                case 11.31:
                case 11.40:
                    if (backgrounds && backgrounds[0]) backgrounds[0].stage = "winter19";
                    if (backgrounds && backgrounds[1]) backgrounds[1].stage = "winter19";
                    break;
                case 19.01:
                    if (backgrounds && backgrounds[0]) {
                        backgrounds[0].stage = "winter2021";
                        backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp19-lobby-xmas-2048x1024-f85d2684b4af.png";
                    }
                    if (translated.subgameinfo && translated.subgameinfo.battleroyale) {
                        translated.subgameinfo.battleroyale.image = "https://cdn2.unrealengine.com/19br-wf-subgame-select-512x1024-16d8bb0f218f.jpg";
                    }
                    if (translated.specialoffervideo) translated.specialoffervideo.bSpecialOfferEnabled = "true";
                    break;
                case 20.40:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp20-40-armadillo-glowup-lobby-2048x2048-2048x2048-3b83b887cc7f.jpg";
                    break;
                case 21.10:
                    if (backgrounds && backgrounds[0]) backgrounds[0].stage = "season2100";
                    break;
                case 21.30:
                    if (backgrounds && backgrounds[0]) {
                        backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/nss-lobbybackground-2048x1024-f74a14565061.jpg";
                        backgrounds[0].stage = "season2130";
                    }
                    break;
                case 23.10:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-bp23-winterfest-lobby-square-2048x2048-2048x2048-277a476e5ca6.png";
                    if (translated.specialoffervideo) translated.specialoffervideo.bSpecialOfferEnabled = "true";
                    break;
                case 25.11:
                    if (backgrounds && backgrounds[0]) backgrounds[0].backgroundimage = "https://cdn2.unrealengine.com/t-s25-14dos-lobby-4096x2048-2be24969eee3.jpg";
                    break;
            }

        } catch (err) {}

        return translated;
    }

    static mergeContentPages(target, source, fileName) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && 
                    !Array.isArray(source[key]) && 
                    typeof target[key] === 'object' && target[key] !== null) {
                    this.mergeContentPages(target[key], source[key], fileName);
                } else {
                    target[key] = source[key];
                }
            }
        }
    }

    static applyTranslations(obj, req, language) {
        let targetLanguage = language || '';
        if (!targetLanguage) {
            const header = req && req.headers && req.headers['accept-language'];
            if (header) {
                const first = header.split(',')[0].trim();
                if (first.includes('-') && first.toLowerCase() !== 'es-419' && first.toLowerCase() !== 'pt-br') {
                    targetLanguage = first.split('-')[0];
                } else {
                    targetLanguage = first;
                }
            } else {
                targetLanguage = 'en';
            }
        }

        const clonedObj = JSON.parse(JSON.stringify(obj));

        function chooseTranslationsInJSON(o) {
            if (Array.isArray(o)) {
                for (let i = 0; i < o.length; i++) {
                    chooseTranslationsInJSON(o[i]);
                }
            } else if (o && typeof o === 'object') {
                for (const key in o) {
                    if (!Object.prototype.hasOwnProperty.call(o, key)) continue;
                    const val = o[key];
                    if (val && typeof val === 'object') {
                        if (Object.prototype.hasOwnProperty.call(val, targetLanguage) || Object.prototype.hasOwnProperty.call(val, 'en')) {
                            o[key] = val[targetLanguage] || val['en'];
                        } else {
                            chooseTranslationsInJSON(val);
                        }
                    }
                }
            }
        }

        chooseTranslationsInJSON(clonedObj);
        return clonedObj;
    }

    static clearCache() {
        this.contentPagesCache = null;
        this.lastCacheUpdate = 0;
    }
}

module.exports = PagesService;