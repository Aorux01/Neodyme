const express = require("express");
const router = express.Router();
const SupportedCodes = require("../../content/affiliate/SupportedAffiliateCodes.json");

router.get("/affiliate/api/public/affiliates/slug/:slug", async (req, res) => {
    var ValidCode = false;

    SupportedCodes.forEach(code => {
        if (req.params.slug.toLowerCase() == code.toLowerCase()) {
            ValidCode = true;
            return res.json({
                "id": code,
                "slug": code,
                "displayName": code,
                "status": "ACTIVE",
                "verified": false
            })
        }
    })

    if (ValidCode == false) {
        res.statut(404)
        res.json({})
    }
})

module.exports = router;