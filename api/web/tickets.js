const express = require('express');
const router = express.Router();
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const DatabaseManager = require('../../src/manager/database-manager');
const TicketService = require('../../src/service/api/ticket-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { ROLE_LEVELS, getUserRoleLevel } = require('../../src/service/api/role-middleware-service');
const WebService = require('../../src/service/api/web-service');

const verifyToken = WebService.verifyToken;

router.post('/api/tickets', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { subject, message, priority } = req.body;
        const result = await TicketService.createTicket(
            req.user.accountId,
            req.user.displayName,
            subject,
            message,
            priority
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Create ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/tickets/my', verifyToken, async (req, res) => {
    try {
        const tickets = await TicketService.getPlayerTickets(req.user.accountId);
        res.json({ success: true, tickets });
    } catch (error) {
        LoggerService.log('error', `Get my tickets error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/tickets/:ticketId', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        const roleLevel = getUserRoleLevel(account);
        const isModerator = roleLevel >= ROLE_LEVELS.MODERATOR;

        const result = await TicketService.getTicket(
            req.params.ticketId,
            req.user.accountId,
            isModerator
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Get ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/tickets/:ticketId/messages', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await TicketService.addPlayerMessage(
            req.params.ticketId,
            req.user.accountId,
            req.user.displayName,
            content
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Add ticket message error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
