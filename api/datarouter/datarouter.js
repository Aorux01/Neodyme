const express = require("express");
const router = express.Router();

router.post('/datarouter/api/v1/public/data', async (req, res) => {
    res.status(204).end();
});

module.exports = router;