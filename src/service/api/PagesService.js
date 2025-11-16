const fs = require('fs');
const path = require('path');
const LoggerService = require('../logger/LoggerService');

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
        
        if (data) {
            return data;
        }

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

    static getContentPages(req) {
        const now = Date.now();
        
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

        return this.applyTranslations(contentPages, req);
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

    static getContentPage(pageName, req) {
        const allPages = this.getContentPages(req);
        return allPages[pageName] || null;
    }

    static applyTranslations(obj, req, language) {
        const lang = language || req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
        
        const clonedObj = JSON.parse(JSON.stringify(obj));
        
        function processObject(o) {
            if (Array.isArray(o)) {
                o.forEach(processObject);
            } else if (o && typeof o === 'object') {
                for (const key in o) {
                    if (o[key] && typeof o[key] === 'object') {
                        if (o[key].en || o[key].de || o[key].es || o[key].fr || o[key].it || o[key].ja) {
                            o[key] = o[key][lang] || o[key]['en'] || Object.values(o[key])[0];
                        } else {
                            processObject(o[key]);
                        }
                    }
                }
            }
        }
        
        processObject(clonedObj);
        return clonedObj;
    }

    static clearCache() {
        this.contentPagesCache = null;
        this.lastCacheUpdate = 0;
    }
}

module.exports = PagesService;