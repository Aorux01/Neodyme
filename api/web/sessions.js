const express = require('express');
const router = express.Router();
const AuthService = require('../../src/service/api/auth-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { expensiveRateLimit } = require('../../src/middleware/rate-limit-middleware');

const verifyToken = WebService.verifyToken;

router.get('/neodyme/api/sessions/active', verifyToken, async (req, res) => {
    try {
        const sessions = await AuthService.getActiveSessions(req.user.accountId);
        res.set('Cache-Control', 'no-store');

        const list = Array.isArray(sessions) ? sessions.map(session => ({
            sessionId: session.sessionId,
            deviceId: session.deviceId,
            ip: session.ip,
            ipSubnet: session.ipSubnet,
            createdAt: new Date(session.createdAt).toISOString(),
            lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : null,
            expiresAt: new Date(session.expiresAt).toISOString(),
            isCurrent: req.token ? req.token.includes(session.sessionId) : false,
            hasRefreshToken: session.hasRefreshToken || false
        })) : [];

        return WebResponse.ok(res, { sessions: list });
    } catch (error) {
        return WebResponse.serverError(res, 'get active sessions', error);
    }
});

router.get('/neodyme/api/sessions/count', verifyToken, async (req, res) => {
    try {
        const sessions = await AuthService.getActiveSessions(req.user.accountId);
        return WebResponse.ok(res, { count: Array.isArray(sessions) ? sessions.length : 0 });
    } catch (error) {
        return WebResponse.serverError(res, 'get session count', error);
    }
});

router.delete('/neodyme/api/sessions/all', verifyToken, expensiveRateLimit(), async (req, res) => {
    try {
        await AuthService.killAllTokensForAccount(req.user.accountId);
        return WebResponse.ok(res, { message: 'All sessions terminated successfully. Please log in again.' });
    } catch (error) {
        return WebResponse.serverError(res, 'kill all sessions', error);
    }
});

router.delete('/neodyme/api/sessions/:sessionId', verifyToken, expensiveRateLimit(), async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (!sessionId) {
            return WebResponse.badRequest(res, 'Session id is required.');
        }

        const killed = await AuthService.killSpecificSession(req.user.accountId, sessionId);
        if (!killed) {
            return WebResponse.notFound(res, 'Session not found.');
        }
        return WebResponse.ok(res, { message: 'Session terminated successfully.' });
    } catch (error) {
        return WebResponse.serverError(res, 'kill session', error);
    }
});

module.exports = router;
