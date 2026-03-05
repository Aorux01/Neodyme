const express = require("express");
const router = express.Router();
const CreatorCodeService = require("../../src/service/api/creator-code-service");
const { Errors, sendError } = require("../../src/service/error/errors-system");
const LoggerService = require("../../src/service/logger/logger-service");

router.get("/affiliate/api/public/affiliates/slug/:slug", async (req, res) => {
    try {
        const code = req.params.slug;
        const codeData = await CreatorCodeService.validateCode(code);

        if (codeData) {
            return res.json({
                id: codeData.code,
                slug: codeData.code,
                displayName: codeData.displayName,
                status: codeData.isActive ? "ACTIVE" : "INACTIVE",
                verified: true
            });
        }

        sendError(res, Errors.Basic.notFound());
    } catch (error) {
        LoggerService.log('error', `Affiliate lookup error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
