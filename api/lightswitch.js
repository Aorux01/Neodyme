const express = require('express');
const router = express.Router();

// Get Fortnite service status
router.get('/lightswitch/api/service/Fortnite/status', async (req, res) => {
    res.json({
        serviceInstanceId: "fortnite",
        status: "UP",
        message: "Fortnite is online",
        maintenanceUri: null,
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
});

// Get bulk service status
router.get('/lightswitch/api/service/bulk/status', async (req, res) => {
    res.json([{
        serviceInstanceId: "fortnite",
        status: "UP",
        message: "fortnite is up.",
        maintenanceUri: null,
        overrideCatalogIds: [
            "a7f138b2e51945ffbfdacc1af0541053"
        ],
        allowedActions: [
            "PLAY",
            "DOWNLOAD"
        ],
        banned: false,
        launcherInfoDTO: {
            appName: "Fortnite",
            catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
            namespace: "fn"
        }
    }]);
});

// Additional service status endpoints
router.get('/lightswitch/api/service/*/status', async (req, res) => {
    const serviceName = req.params[0] || 'fortnite';
    
    res.json({
        serviceInstanceId: serviceName.toLowerCase(),
        status: "UP",
        message: `${serviceName} is online`,
        maintenanceUri: null,
        overrideCatalogIds: [],
        allowedActions: [
            "PLAY",
            "DOWNLOAD"
        ],
        banned: false,
        launcherInfoDTO: {
            appName: serviceName,
            catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
            namespace: "fn"
        }
    });
});

// Maintenance check endpoint
router.get('/lightswitch/api/service/Fortnite/maintenance', async (req, res) => {
    res.json({
        maintenanceStatus: false,
        message: null,
        estimatedDowntime: null
    });
});

// Ban check endpoint
router.get('/lightswitch/api/service/Fortnite/ban/:accountId', async (req, res) => {
    res.json({
        banned: false,
        banReasons: [],
        banExpires: null
    });
});

module.exports = router;