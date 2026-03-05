const express = require('express');
const router = express.Router();
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const AuthService = require('../../src/service/api/auth-service');
const { expensiveRateLimit } = require('../../src/middleware/rate-limit-middleware');
const WebService = require('../../src/service/api/web-service');

const verifyToken = WebService.verifyToken;

router.get('/api/sessions/active', verifyToken, async (req, res) => {
    try {
        if (!req.user || !req.user.accountId) {
            return sendError(res, Errors.Authentication.invalidToken('missing user'));
        }

        const accountId = req.user.accountId;
        const sessions = await AuthService.getActiveSessions(accountId);

        if (!sessions || !Array.isArray(sessions)) {
            return res.status(200).json({ success: true, sessions: [] });
        }

        res.status(200).json({
            success: true,
            sessions: sessions.map(session => ({
                sessionId: session.sessionId,
                deviceId: session.deviceId,
                ip: session.ip,
                ipSubnet: session.ipSubnet,
                createdAt: new Date(session.createdAt).toISOString(),
                lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : null,
                expiresAt: new Date(session.expiresAt).toISOString(),
                isCurrent: req.token && req.token.includes(session.sessionId),
                hasRefreshToken: session.hasRefreshToken || false
            }))
        });
    } catch (error) {
        LoggerService.log('error', `Get active sessions error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/sessions/:sessionId', verifyToken, expensiveRateLimit(), async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const sessionId = req.params.sessionId;

        if (!sessionId) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const result = await AuthService.killSpecificSession(accountId, sessionId);

        if (result) {
            res.status(200).json({ success: true, message: 'Session terminated successfully' });
        } else {
            return sendError(res, Errors.Basic.notFound());
        }
    } catch (error) {
        LoggerService.log('error', `Kill session error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/sessions/all', verifyToken, expensiveRateLimit(), async (req, res) => {
    try {
        const accountId = req.user.accountId;
        await AuthService.killAllTokensForAccount(accountId);

        res.status(200).json({
            success: true,
            message: 'All sessions terminated successfully. Please log in again.'
        });
    } catch (error) {
        LoggerService.log('error', `Kill all sessions error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/sessions/count', verifyToken, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const sessions = await AuthService.getActiveSessions(accountId);

        res.status(200).json({ success: true, count: sessions.length });
    } catch (error) {
        LoggerService.log('error', `Get session count error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
