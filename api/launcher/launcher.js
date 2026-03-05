const express = require('express');
const router = express.Router();
const axios = require('axios');
const LoggerService = require('../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../src/service/error/errors-system');

router.get('/launcher/api/public/assets/Windows/:catalogItemId/:appName', async function (req, res) {
    try {
        const tokenResponse = await axios.get('https://api.nitestats.com/v1/epic/bearer');
        const auth_token = tokenResponse.data.accessToken || "l6e2be7d0b8c69099a7e57c9bed82l65";

        const response = await axios.get(
            `https://launcher-public-service-prod06.ol.epicgames.com${req.originalUrl}`,
            {
                headers: {
                    'Authorization': `bearer ${auth_token}`
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        LoggerService.log('error', `Launcher assets proxy error: ${error.message}`);
        sendError(res, Errors.custom(
            'errors.com.epicgames.launcher.assets_proxy_failed',
            'Failed to fetch launcher assets',
            502,
            502
        ));
    }
});

module.exports = router;
