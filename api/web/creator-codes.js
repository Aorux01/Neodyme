const express = require('express');
const router = express.Router();
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');

const verifyToken = WebService.verifyToken;

router.get('/neodyme/api/creator-code/me', verifyToken, async (req, res) => {
    try {
        const code = await CreatorCodeService.getUserCode(req.user.accountId);
        const request = await CreatorCodeService.getUserRequest(req.user.accountId);

        return WebResponse.ok(res, {
            hasCode: !!code,
            code,
            pendingRequest: request && request.status === 'pending' ? request : null,
            lastRequest: request
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get creator code', error);
    }
});

router.post('/neodyme/api/creator-code/request', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { code, reason } = req.body;
        if (!code) {
            return WebResponse.badRequest(res, 'Code is required.');
        }

        const result = await CreatorCodeService.requestCode(req.user.accountId, req.user.displayName, code, reason);
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'request creator code', error);
    }
});

router.get('/neodyme/api/creator-code/validate/:code', async (req, res) => {
    try {
        const codeData = await CreatorCodeService.validateCode(req.params.code);
        if (!codeData) {
            return WebResponse.ok(res, { valid: false, message: 'Code not found or inactive.' });
        }
        return WebResponse.ok(res, { valid: true, creatorName: codeData.displayName });
    } catch (error) {
        return WebResponse.serverError(res, 'validate creator code', error);
    }
});

router.delete('/neodyme/api/creator-code/me', verifyToken, csrfProtection, async (req, res) => {
    try {
        const code = await CreatorCodeService.getUserCode(req.user.accountId);
        if (!code) {
            return WebResponse.notFound(res, 'You do not have a creator code.');
        }

        const result = await CreatorCodeService.deleteCode(code.code, req.user.accountId, req.user.displayName);
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'delete creator code', error);
    }
});

module.exports = router;
