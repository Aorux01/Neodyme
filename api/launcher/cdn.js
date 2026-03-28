const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

router.get('/launcher/api/public/distributionpoints/', async (req, res) => {
    res.json({
        distributions: [
            'https://epicgames-download1.akamaized.net/',
            'https://download.epicgames.com/',
            'https://download2.epicgames.com/',
            'https://download3.epicgames.com/',
            'https://download4.epicgames.com/',
            'https://fortnite-public-service-prod11.ol.epicgames.com/'
        ]
    });
});

router.get('/launcher/api/public/assets/*', async (req, res) => {
    res.json({
        appName: 'FortniteContentBuilds',
        labelName: 'Neodyme',
        buildVersion: '++Fortnite+Release-20.00-CL-19458861-Windows',
        catalogItemId: '5cb97847cee34581afdbc445400e2f77',
        expires: '9999-12-31T23:59:59.999Z',
        items: {
            MANIFEST: {
                signature: 'Neodyme',
                distribution: 'https://fortnite-public-service-prod11.ol.epicgames.com/',
                path: 'Builds/Fortnite/Content/CloudDir/Neodyme.manifest',
                hash: "55bb954f5596cadbe03693e1c06ca73368d427f3",
                additionalDistributions: []
            },
            CHUNKS: {
                signature: 'Neodyme',
                distribution: 'https://fortnite-public-service-prod11.ol.epicgames.com/',
                path: 'Builds/Fortnite/Content/CloudDir/Neodyme.chunk',
                additionalDistributions: []
            }
        },
        assetId: 'FortniteContentBuilds'
    });
});

router.get('/Builds/Fortnite/Content/CloudDir/*.manifest', async (req, res) => {
    res.set('Content-Type', 'application/octet-stream');
    const manifestPath = path.join(process.cwd(), 'content', 'assets', 'neodyme.manifest');
    if (fs.existsSync(manifestPath)) {
        return res.status(200).send(fs.readFileSync(manifestPath));
    }
    res.status(404).end();
});

router.get('/Builds/Fortnite/Content/CloudDir/*.chunk', async (req, res) => {
    res.set('Content-Type', 'application/octet-stream');
    const chunkPath = path.join(process.cwd(), 'content', 'assets', 'neodyme.chunk');
    if (fs.existsSync(chunkPath)) {
        return res.status(200).send(fs.readFileSync(chunkPath));
    }
    res.status(404).end();
});

router.get('/Builds/Fortnite/Content/CloudDir/*.ini', async (req, res) => {
    const iniPath = path.join(process.cwd(), 'content', 'assets', 'full.ini');
    if (fs.existsSync(iniPath)) {
        return res.status(200).send(fs.readFileSync(iniPath));
    }
    res.status(404).end();
});

module.exports = router;
