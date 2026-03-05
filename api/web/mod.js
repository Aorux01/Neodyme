const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const TicketService = require('../../src/service/api/ticket-service');
const AuditService = require('../../src/service/api/audit-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const WebService = require('../../src/service/api/web-service');
const { ROLE_LEVELS, requireModerator } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;


router.get('/api/mod/creator-codes/requests', verifyToken, requireModerator, async (req, res) => {
    try {
        const requests = await CreatorCodeService.getPendingRequests();
        res.json({ success: true, requests });
    } catch (error) {
        LoggerService.log('error', `Get creator code requests error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/creator-codes/requests/all', verifyToken, requireModerator, async (req, res) => {
    try {
        const requests = await CreatorCodeService.getAllRequests();
        res.json({ success: true, requests });
    } catch (error) {
        LoggerService.log('error', `Get all creator code requests error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/creator-codes/approve/:requestId', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { note } = req.body;
        const result = await CreatorCodeService.approveRequest(
            requestId,
            req.user.accountId,
            req.user.displayName,
            note
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Approve creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/creator-codes/reject/:requestId', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { note } = req.body;
        const result = await CreatorCodeService.rejectRequest(
            requestId,
            req.user.accountId,
            req.user.displayName,
            note
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Reject creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/creator-codes', verifyToken, requireModerator, async (req, res) => {
    try {
        const codes = await CreatorCodeService.getAllCodes();
        res.json({ success: true, codes });
    } catch (error) {
        LoggerService.log('error', `Get all creator codes error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/mod/creator-codes/:code', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { code } = req.params;
        const result = await CreatorCodeService.deleteCode(
            code,
            req.user.accountId,
            req.user.displayName
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Delete creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/creator-codes/:code/toggle', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { code } = req.params;
        const { isActive } = req.body;
        const result = await CreatorCodeService.toggleCodeStatus(code, isActive);
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Toggle creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/creator-codes/stats', verifyToken, requireModerator, async (req, res) => {
    try {
        const stats = await CreatorCodeService.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        LoggerService.log('error', `Get creator code stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/tickets', verifyToken, requireModerator, async (req, res) => {
    try {
        const { status, priority, assignedTo, unassigned } = req.query;
        const filters = {};
        if (status) filters.status = status;
        if (priority) filters.priority = priority;
        if (assignedTo) filters.assignedTo = assignedTo;
        if (unassigned === 'true') filters.unassigned = true;

        const tickets = await TicketService.getAllTickets(filters);
        res.json({ success: true, tickets });
    } catch (error) {
        LoggerService.log('error', `Get all tickets error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/tickets/stats', verifyToken, requireModerator, async (req, res) => {
    try {
        const stats = await TicketService.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        LoggerService.log('error', `Get ticket stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/tickets/:ticketId/assign', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const result = await TicketService.assignTicket(
            req.params.ticketId,
            req.user.accountId,
            req.user.displayName
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Assign ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/tickets/:ticketId/unassign', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const result = await TicketService.unassignTicket(req.params.ticketId);
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Unassign ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/tickets/:ticketId/reply', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await TicketService.addModeratorReply(
            req.params.ticketId,
            req.user.accountId,
            req.user.displayName,
            content
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Moderator reply error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/tickets/:ticketId/status', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { status } = req.body;
        const result = await TicketService.updateTicketStatus(
            req.params.ticketId,
            status,
            req.user.displayName
        );

        if (status === 'closed') {
            await AuditService.logTicketAction(
                req.user.accountId,
                req.user.displayName,
                AuditService.ACTIONS.CLOSE_TICKET,
                req.params.ticketId,
                {},
                req.ip
            );
        }

        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Update ticket status error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/tickets/:ticketId/priority', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { priority } = req.body;
        const result = await TicketService.updateTicketPriority(
            req.params.ticketId,
            priority,
            req.user.displayName
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Update ticket priority error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/mod/tickets/:ticketId', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const result = await TicketService.deleteTicket(req.params.ticketId, req.user.displayName);

        if (result.success) {
            await AuditService.logTicketAction(
                req.user.accountId,
                req.user.displayName,
                AuditService.ACTIONS.DELETE_TICKET,
                req.params.ticketId,
                {},
                req.ip
            );
        }

        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Delete ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/players', verifyToken, requireModerator, async (req, res) => {
    try {
        const { search, banned } = req.query;
        let users = await DatabaseManager.getAllAccounts();

        users = users.filter(u => (u.clientType || 0) < ROLE_LEVELS.MODERATOR);

        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(u =>
                u.displayName.toLowerCase().includes(searchLower) ||
                u.email.toLowerCase().includes(searchLower) ||
                u.accountId.toLowerCase().includes(searchLower)
            );
        }

        if (banned === 'true') {
            users = users.filter(u => u.banned);
        } else if (banned === 'false') {
            users = users.filter(u => !u.banned);
        }

        res.json({
            success: true,
            players: users.map(u => ({
                accountId: u.accountId,
                displayName: u.displayName,
                email: u.email,
                created: u.created,
                lastLogin: u.lastLogin,
                banned: u.banned || false,
                banReasons: u.banReasons || []
            }))
        });
    } catch (error) {
        LoggerService.log('error', `Get players error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/players/:accountId/bans', verifyToken, requireModerator, async (req, res) => {
    try {
        const { accountId } = req.params;

        const history = await AuditService.getTargetHistory('user', accountId, 50);
        const banHistory = history.filter(l =>
            l.action === AuditService.ACTIONS.BAN_USER ||
            l.action === AuditService.ACTIONS.UNBAN_USER
        );

        res.json({ success: true, history: banHistory });
    } catch (error) {
        LoggerService.log('error', `Get ban history error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/players/:accountId/ban', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { reason, duration } = req.body;

        if (!reason || reason.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'Ban reason is required (min 3 characters)' });
        }

        const targetAccount = await DatabaseManager.getAccount(accountId);
        if (!targetAccount) {
            return res.status(404).json({ success: false, error: 'Player not found' });
        }

        const targetRoleLevel = targetAccount.clientType || 0;
        if (targetRoleLevel >= ROLE_LEVELS.MODERATOR) {
            return res.status(403).json({ success: false, error: 'Cannot ban staff members' });
        }

        let banExpires = null;
        if (duration && duration > 0) {
            banExpires = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
        }

        await DatabaseManager.banAccount(accountId, [reason], banExpires);

        await AuditService.logBan(
            req.user.accountId,
            req.user.displayName,
            accountId,
            targetAccount.displayName,
            reason,
            duration ? `${duration} hours` : 'permanent',
            req.ip
        );

        LoggerService.log('info', `Player ${targetAccount.displayName} banned by ${req.user.displayName}: ${reason}`);

        res.json({
            success: true,
            message: `Player ${targetAccount.displayName} has been banned`,
            banExpires
        });
    } catch (error) {
        LoggerService.log('error', `Ban player error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/players/:accountId/unban', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;

        const targetAccount = await DatabaseManager.getAccount(accountId);
        if (!targetAccount) {
            return res.status(404).json({ success: false, error: 'Player not found' });
        }

        await DatabaseManager.unbanAccount(accountId);

        await AuditService.logUnban(
            req.user.accountId,
            req.user.displayName,
            accountId,
            targetAccount.displayName,
            req.ip
        );

        LoggerService.log('info', `Player ${targetAccount.displayName} unbanned by ${req.user.displayName}`);

        res.json({
            success: true,
            message: `Player ${targetAccount.displayName} has been unbanned`
        });
    } catch (error) {
        LoggerService.log('error', `Unban player error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
