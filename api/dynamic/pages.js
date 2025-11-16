const express = require('express');
const router = express.Router();
const PagesService = require('../../src/service/api/PagesService');
const { Errors, sendError } = require('../../src/service/error/Errors');
const LoggerService = require('../../src/service/logger/LoggerService');
const FunctionsService = require('../../src/service/api/FunctionsService');

router.get('/content/api/pages/fortnite-game/spark-tracks', async (req, res) => {
    try {
        const sparkTracks = PagesService.getSparkTracks();
        res.json(sparkTracks);
    } catch (error) {
        LoggerService.log('error', `Spark tracks error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/content/api/pages/fortnite-game/radio-stations', async (req, res) => {
    try {
        const radioStations = PagesService.getRadioStations();
        res.json(radioStations);
    } catch (error) {
        LoggerService.log('error', `Radio stations error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/content/api/pages/fortnite-game/seasonpasses', async (req, res) => {
    try {
        const seasonPasses = PagesService.getSeasonPasses(req);
        res.json(seasonPasses);
    } catch (error) {
        LoggerService.log('error', `Season passes error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get("/content/api/pages/fortnite-game", (req, res) => {
    try {
        const contentPages = PagesService.getContentPages(req);
        res.json(contentPages);
    } catch (error) {
        LoggerService.log('error', `Pages error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/content/api/pages/fortnite-game/*', async (req, res) => {
    try {
        const pageName = req.params[0];
        const contentPage = PagesService.getContentPage(pageName, req);
        
        if (contentPage) {
            return res.json(contentPage);
        }
        
        res.json({
            "_title": pageName,
            "_activeDate": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
            "lastModified": new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
            "_locale": "en-US"
        });
    } catch (error) {
        LoggerService.log('error', `Page ${req.params[0]} error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/v1/fortnite-br/*/target', async (req, res) => {
    try {
        const motd = PagesService.getMotd();
        const language = req.body.language || req.body.parameters?.language || 'en';
        
        const translatedMotd = PagesService.applyTranslations(motd, req, language);
        
        if (req.body.tags && Array.isArray(req.body.tags)) {
            translatedMotd.contentItems.forEach(item => {
                item.placements = req.body.tags.map((tag, index) => ({
                    trackingId: FunctionsService.generateRandomString(16),
                    tag: tag,
                    position: index
                }));
            });
        }
        
        res.json(translatedMotd);
    } catch (error) {
        LoggerService.log('error', `MOTD error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;