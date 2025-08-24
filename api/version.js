const express = require('express');
const router = express.Router();
const VersionService = require('../src/services/VersionService');

// Get version info
router.get('/fortnite/api/version', (req, res) => {
    res.json(VersionService.getVersionResponse());
});

// Version check endpoints
router.get('/fortnite/api/versioncheck', (req, res) => {
    res.json(VersionService.getVersionCheckResponse());
});

router.get('/fortnite/api/versioncheck/:platform', (req, res) => {
    res.json(VersionService.getVersionCheckResponse());
});

router.get('/fortnite/api/v2/versioncheck/:platform', (req, res) => {
    res.json(VersionService.getVersionCheckResponse());
});

// Calendar version check
router.get('/fortnite/api/calendar/v1/timeline', (req, res) => {
    // This is handled by timeline routes, redirect there
    res.redirect('/api/timeline');
});

module.exports = router;