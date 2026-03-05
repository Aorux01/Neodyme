const Express = require("express");
const router = Express.Router();
const discovery = require("../../content/athena/discovery/discovery-frontend.json");

router.post("*/api/v2/discovery/surface/*", async (req, res) => {
    res.json(discovery.v2);
});

router.post("*/discovery/surface/*", async (req, res) => {
    res.json(discovery.v1);
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