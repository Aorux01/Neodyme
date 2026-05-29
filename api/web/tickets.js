const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const TicketService = require('../../src/service/api/ticket-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { ROLE_LEVELS, getUserRoleLevel } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;

router.post('/neodyme/api/tickets', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { subject, message, priority } = req.body;
        const result = await TicketService.createTicket(
            req.user.accountId, req.user.displayName, subject, message, priority
        );
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'create ticket', error);
    }
});

router.get('/neodyme/api/tickets/my', verifyToken, async (req, res) => {
    try {
        const tickets = await TicketService.getPlayerTickets(req.user.accountId);
        return WebResponse.ok(res, { tickets });
    } catch (error) {
        return WebResponse.serverError(res, 'get my tickets', error);
    }
});

router.get('/neodyme/api/tickets/:ticketId', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        const isModerator = getUserRoleLevel(account) >= ROLE_LEVELS.MODERATOR;

        const result = await TicketService.getTicket(req.params.ticketId, req.user.accountId, isModerator);
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'get ticket', error);
    }
});

router.post('/neodyme/api/tickets/:ticketId/messages', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await TicketService.addPlayerMessage(
            req.params.ticketId, req.user.accountId, req.user.displayName, content
        );
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'add ticket message', error);
    }
});

module.exports = router;
