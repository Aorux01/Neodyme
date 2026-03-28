const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

router.get('/eulatracking/api/shared/agreements/fn*', async (req, res) => {
    const eulaPath = path.join(process.cwd(), 'content', 'eula', 'shared-agreements.json');
    if (fs.existsSync(eulaPath)) {
        const content = JSON.parse(fs.readFileSync(eulaPath, 'utf8'));
        res.json(content);
    } else {
        res.json({});
    }
});

router.post('/eulatracking/api/public/agreements/fn/version/:version/account/:accountId/accept', async (req, res) => {
    res.status(204).end();
});

router.get('/eulatracking/api/public/agreements/fn/account/*', async (req, res) => {
    res.status(204).end();
});

module.exports = router;
