const Express = require("express");
const fs = require("fs");
const path = require("path");
const router = Express.Router();
const discovery = require("../../content/athena/discovery/discovery-frontend.json");
const VersionService = require("../../src/service/api/version-service");

function loadPlaylists() {
    try {
        const p = path.join(__dirname, '../../config/playlists.json');
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
    } catch (_) { return null; }
}

function filterDiscovery(data, build) {
    const config = loadPlaylists();
    if (!config || !Array.isArray(config.playlists)) return data;

    const excluded = config.playlists
        .filter(p => !p.enabled || (p.minBuild > 0 && build < p.minBuild))
        .map(p => p.linkCode);

    if (excluded.length === 0) return data;

    const clone = JSON.parse(JSON.stringify(data));

    function filterResults(arr) {
        return arr.filter(r => !excluded.includes(r.linkCode));
    }

    for (const panel of clone.Panels) {
        if (panel.Pages) {
            for (const page of panel.Pages) {
                if (page.results) page.results = filterResults(page.results);
            }
        }
        if (panel.FirstPage && panel.FirstPage.results) {
            panel.FirstPage.results = filterResults(panel.FirstPage.results);
        }
    }

    return clone;
}

router.post("*/api/v2/discovery/surface/*", async (req, res) => {
    const { build } = VersionService.getVersionInfo(req);
    res.json(filterDiscovery(discovery.v2, build));
});

router.post("*/discovery/surface/*", async (req, res) => {
    const { build } = VersionService.getVersionInfo(req);
    res.json(filterDiscovery(discovery.v1, build));
});

router.get("/fortnite/api/discovery/accessToken/:branch", async (req, res) => {
    res.json({
        "branchName": req.params.branch,
        "appId": "Fortnite",
        "token": "neodymetoken"
    });
});

router.post("/links/api/fn/mnemonic", async (req, res) => {
    var MnemonicArray = [];

    for (var i in discovery.v2.Panels[1].Pages[0].results) {
        MnemonicArray.push(discovery.v2.Panels[1].Pages[0].results[i].linkData)
    }

    res.json(MnemonicArray);
})

router.get("/links/api/fn/mnemonic/:playlist/related", async (req, res) => {
    var response = {
        "parentLinks": [],
        "links": {}
    };

    if (req.params.playlist) {
        for (var i in discovery.v2.Panels[1].Pages[0].results) {
            var linkData = discovery.v2.Panels[1].Pages[0].results[i].linkData;
            if (linkData.mnemonic == req.params.playlist) {
                response.links[req.params.playlist] = linkData;
            }
        }        
    }    

    res.json(response);
})

router.get("/links/api/fn/mnemonic/*", async (req, res) => {
    for (var i in discovery.v2.Panels[1].Pages[0].results) {
        if (discovery.v2.Panels[1].Pages[0].results[i].linkData.mnemonic == req.url.split("/").slice(-1)[0]) {
            res.json(discovery.v2.Panels[1].Pages[0].results[i].linkData);
        }
    }
})

router.post("/api/v1/links/lock-status/:accountId/check", async (req, res) => {
    var response = {
        "results": [],
        "hasMore": false
    };

    if (req.body.linkCodes) {
        for (var linkCode in req.body.linkCodes) {
            response.results.push({
                "playerId": req.params.accountId,
                "linkCode": req.body.linkCodes[linkCode],
                "lockStatus": "UNLOCKED",
                "lockStatusReason": "NONE",
                "isVisible": true
            })
        }        
    }    

    res.json(response);
})

module.exports = router;