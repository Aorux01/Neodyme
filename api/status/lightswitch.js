const express = require('express');
const router = express.Router();
const LoggerService = require('../../src/service/logger/logger-service');
const ConfigManager = require('../../src/manager/config-manager');
const AccountService = require('../../src/service/api/account-service')
const { Errors, sendError } = require('../../src/service/error/errors-system');

router.get('/lightswitch/api/service/Fortnite/status', (req, res) => {
    try {
        const maintenanceMode = ConfigManager.get('maintenanceMode') || false;
        const maintenanceUri = maintenanceMode ? '/lightswitch/api/service/Fortnite/maintenance' : null;
    
        res.json({
            serviceInstanceId: "fortnite",
            status: maintenanceMode ? "DOWN" : "UP",
            message: maintenanceMode
                    ? ConfigManager.get('maintenanceMessage')
                    : "fortnite is online.",
            maintenanceUri: maintenanceUri,
            overrideCatalogIds: [
                "a7f138b2e51945ffbfdacc1af0541053"
            ],
            allowedActions: [],
            banned: false,
            launcherInfoDTO: {
                appName: "Fortnite",
                catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
                namespace: "fn"
            }
        });
    } catch (error) {
        LoggerService.log('error', `Lightswitch error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/lightswitch/api/service/bulk/status', async (req, res) => {
    try {
        const maintenanceMode = ConfigManager.get('maintenanceMode') || false;
        const maintenanceUri = maintenanceMode ? '/lightswitch/api/service/Fortnite/maintenance' : null;

        res.json([{
            serviceInstanceId: "fortnite",
            status: maintenanceMode ? "DOWN" : "UP",
            message: maintenanceMode
                    ? ConfigManager.get('maintenanceMessage')
                    : "fortnite is up.",
            maintenanceUri: maintenanceUri,
            overrideCatalogIds: [
                "a7f138b2e51945ffbfdacc1af0541053"
            ],
            allowedActions: maintenanceMode ? [] : ['PLAY', 'DOWNLOAD'],
            banned: false,
            launcherInfoDTO: {
                appName: "Fortnite",
                catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
                namespace: "fn"
            }
        }]);
    } catch (error) {
        LoggerService.log('error', `Lightswitch error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/lightswitch/api/service/*/status', async (req, res) => {
    try {
        const serviceName = req.params[0] || 'fortnite';
        const maintenanceMode = ConfigManager.get('maintenanceMode') || false;
        const maintenanceUri = maintenanceMode ? '/lightswitch/api/service/Fortnite/maintenance' : null;

        res.json({
            serviceInstanceId: serviceName.toLowerCase(),
            status: maintenanceMode ? "DOWN" : "UP",
            message: maintenanceMode
                    ? ConfigManager.get('maintenanceMessage')
                    : `${serviceName} is online`,
            maintenanceUri: maintenanceUri,
            overrideCatalogIds: [],
            allowedActions: maintenanceMode ? [] : ['PLAY', 'DOWNLOAD'],
            banned: false,
            launcherInfoDTO: {
                appName: serviceName,
                catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
                namespace: "fn"
            }
        });
    } catch (error) {
        LoggerService.log('error', `Lightswitch error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/lightswitch/api/service/Fortnite/maintenance', async (req, res) => {
    try {
        const maintenanceMode = ConfigManager.get('maintenanceMode') || false;
        
        res.json({
            maintenanceStatus: maintenanceMode,
            message: maintenanceMode ? ConfigManager.get('maintenanceMessage') : null,
            estimatedDowntime: maintenanceMode ? ConfigManager.get('maintenanceEstimatedDowntime') : null
        });
    } catch (error) {
        LoggerService.log('error', `Lightswitch error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/lightswitch/api/service/Fortnite/ban/:accountId', async (req, res) => {
    try {
        const accountId = req.params.accountId;
        const banInfo = AccountService.getBanInfo(accountId);
    
        res.json({
            banned: banInfo.banned,
            banReasons: banInfo.banReasons,
            banExpires: banInfo.banExpires
        });
    } catch (error) {
        LoggerService.log('error', `Lightswitch error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;