const express = require('express');
const router = express.Router();

router.post("/publickey/v2/publickey", async (req, res) => {
    const body = await res.req.parseBody();
    return res.json({
        key: body.key,
        account_id: res.req.query("accountId") || "Neodyme",
        key_guid: v4(),
        kid: "20230621",
        expiration: "9999-12-31T23:59:59.999Z",
        jwt: "Neodyme",
        type: "legacy",
    });
});

router.post("/publickey/v2/publickey/", async (req, res) => {
    const body = await res.req.json();
    return res.json({
        key: body.key,
        account_id: res.req.query("accountId") || "Neodyme",
        key_guid: v4(),
        kid: "20230621",
        expiration: "9999-12-31T23:59:59.999Z",
        jwt: "Neodyme",
        type: "legacy",
    });
});

module.exports = router;