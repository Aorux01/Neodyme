const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const AuthService = require('../src/services/AuthService');
const { Errors, sendError } = require('../src/errors/errors');
const LoggerService = require("../src/utils/logger");

// Load discovery data
let discoveryData = null;
async function loadDiscoveryData() {
    try {
        const discoveryPath = path.join(process.cwd(), 'static-content', 'athena', 'Discovery', 'discovery_frontend.json');
        const data = await fs.readFile(discoveryPath, 'utf8');
        discoveryData = JSON.parse(data);
    } catch (error) {
        LoggerService.log('error', `Failed to load discovery data: ${error}`);
    }
}

// Initialize discovery data
loadDiscoveryData();

// Discovery surface endpoints
router.post('*/api/v2/discovery/surface/*', async (req, res) => {
    if (!discoveryData) await loadDiscoveryData();
    res.json(discoveryData.v2);
});

router.post('*/discovery/surface/*', async (req, res) => {
    if (!discoveryData) await loadDiscoveryData();
    res.json(discoveryData.v1);
});

// Access token endpoint
router.get('/fortnite/api/discovery/accessToken/:branch', async (req, res) => {
    res.json({
        branchName: req.params.branch,
        appId: "Fortnite",
        token: "neodyme_discovery_token"
    });
});

// Mnemonic endpoints
router.post('/links/api/fn/mnemonic', async (req, res) => {
    if (!discoveryData) await loadDiscoveryData();
    
    const mnemonicArray = [];
    
    if (discoveryData.v2.Panels[1] && discoveryData.v2.Panels[1].Pages[0]) {
        for (const result of discoveryData.v2.Panels[1].Pages[0].results) {
            mnemonicArray.push(result.linkData);
        }
    }
    
    res.json(mnemonicArray);
});

router.get('/links/api/fn/mnemonic/:playlist/related', async (req, res) => {
    if (!discoveryData) await loadDiscoveryData();
    
    const response = {
        parentLinks: [],
        links: {}
    };
    
    if (req.params.playlist && discoveryData.v2.Panels[1] && discoveryData.v2.Panels[1].Pages[0]) {
        for (const result of discoveryData.v2.Panels[1].Pages[0].results) {
            const linkData = result.linkData;
            if (linkData.mnemonic === req.params.playlist) {
                response.links[req.params.playlist] = linkData;
            }
        }
    }
    
    res.json(response);
});

router.get('/links/api/fn/mnemonic/*', async (req, res) => {
    if (!discoveryData) await loadDiscoveryData();
    
    const mnemonic = req.url.split('/').slice(-1)[0];
    
    if (discoveryData.v2.Panels[1] && discoveryData.v2.Panels[1].Pages[0]) {
        for (const result of discoveryData.v2.Panels[1].Pages[0].results) {
            if (result.linkData.mnemonic === mnemonic) {
                return res.json(result.linkData);
            }
        }
    }
    
    res.status(404).json({ error: 'Mnemonic not found' });
});

// Lock status endpoint
router.post('/api/v1/links/lock-status/:accountId/check', async (req, res) => {
    const response = {
        results: [],
        hasMore: false
    };
    
    if (req.body.linkCodes) {
        for (const linkCode of req.body.linkCodes) {
            response.results.push({
                playerId: req.params.accountId,
                linkCode: linkCode,
                lockStatus: "UNLOCKED",
                lockStatusReason: "NONE",
                isVisible: true
            });
        }
    }
    
    res.json(response);
});

module.exports = router;