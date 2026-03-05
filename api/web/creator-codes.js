const express = require('express');
const router = express.Router();
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const WebService = require('../../src/service/api/web-service');

const verifyToken = WebService.verifyToken;

router.get('/api/creator-code/me', verifyToken, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const code = await CreatorCodeService.getUserCode(accountId);
        const request = await CreatorCodeService.getUserRequest(accountId);

        res.json({
            success: true,
            hasCode: !!code,
            code: code,
            pendingRequest: request && request.status === 'pending' ? request : null,
            lastRequest: request
        });
    } catch (error) {
        LoggerService.log('error', `Get creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/creator-code/request', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { code, reason } = req.body;
        const accountId = req.user.accountId;
        const displayName = req.user.displayName;

        if (!code) {
            return res.status(400).json({ success: false, error: 'Code is required' });
        }

        const result = await CreatorCodeService.requestCode(accountId, displayName, code, reason);
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Request creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/creator-code/validate/:code', async (req, res) => {
    try {
        const code = req.params.code;
        const codeData = await CreatorCodeService.validateCode(code);

        if (!codeData) {
            return res.json({ success: false, valid: false, error: 'Code not found or inactive' });
        }

        res.json({
            success: true,
            valid: true,
            creatorName: codeData.displayName
        });
    } catch (error) {
        LoggerService.log('error', `Validate creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/creator-code/me', verifyToken, csrfProtection, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const displayName = req.user.displayName;
        const code = await CreatorCodeService.getUserCode(accountId);

        if (!code) {
            return res.status(404).json({ success: false, error: 'You do not have a creator code' });
        }

        const result = await CreatorCodeService.deleteCode(code.code, accountId, displayName);
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Delete creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
