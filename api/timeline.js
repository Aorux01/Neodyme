const express = require('express');
const router = express.Router();
const TimelineService = require('../src/services/TimelineService');
const VersionService = require('../src/services/VersionService');
const AuthService = require('../src/services/AuthService');
const { Errors, sendError } = require('../src/errors/errors');
const chalk = require('chalk');
const { LoggerService } = require('../src/utils/logger');
const TokenService = require('../src/services/TokenService');

const requireAuth = TokenService.createVerificationMiddleware();
const c = chalk;

// Get timeline
router.get('/fortnite/api/calendar/v1/timeline', requireAuth, async (req, res) => {
    try {
        const versionInfo = VersionService.getVersionInfo(req);
        const timeline = TimelineService.generateTimeline(versionInfo);
        
        res.json(timeline);
    } catch (error) {
        LoggerService.log('error', `Timeline error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;