const express = require('express');
const router = express.Router();
const ConfigManager = require('../../src/manager/config-manager');
const WebResponse = require('../../src/service/api/web-response-service');
const RecoveryService = require('../../src/service/api/recovery-service');

const isHttpUrl = (value) => /^https?:\/\//i.test(value);

router.get('/neodyme/api/site', (req, res) => {
    const configured = String(ConfigManager.get('serverAddress', '') || '').trim();
    const gameVersionsUrl = String(ConfigManager.get('gameVersionsUrl', '') || '').trim();

    let serverAddress = configured;
    if (!serverAddress) {
        const publicUrl = String(ConfigManager.get('publicUrl', '') || '').trim();
        serverAddress = publicUrl ? publicUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '') : req.get('host');
    }

    res.set('Cache-Control', 'no-store');
    return WebResponse.ok(res, {
        version: ConfigManager.get('version'),
        serverAddress,
        gameVersionsUrl: isHttpUrl(gameVersionsUrl) ? gameVersionsUrl : '',
        publicUrl: RecoveryService.publicUrl()
    });
});

module.exports = router;
