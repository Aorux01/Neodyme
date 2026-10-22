const { gate, gateWrite } = require('../../src/service/api/capability-middleware');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../../src/manager/database-manager');
const LoggerService = require('../../src/service/logger/logger-service');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const TicketService = require('../../src/service/api/ticket-service');
const ReportService = require('../../src/service/api/report-service');
const AuditService = require('../../src/service/api/audit-service');
const RecoveryService = require('../../src/service/api/recovery-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const { ROLE_LEVELS } = require('../../src/service/api/role-middleware-service');

const verifyToken = WebService.verifyToken;

// ---- Creator codes ----

router.get('/neodyme/api/mod/creator-codes/requests', ...gate('creators.manage'), async (req, res) => {
    try {
        return WebResponse.ok(res, { requests: await CreatorCodeService.getPendingRequests() });
    } catch (error) {
        return WebResponse.serverError(res, 'get creator code requests', error);
    }
});

router.get('/neodyme/api/mod/creator-codes/requests/all', ...gate('creators.manage'), async (req, res) => {
    try {
        return WebResponse.ok(res, { requests: await CreatorCodeService.getAllRequests() });
    } catch (error) {
        return WebResponse.serverError(res, 'get all creator code requests', error);
    }
});

router.post('/neodyme/api/mod/creator-codes/approve/:requestId', ...gateWrite('creators.manage'), async (req, res) => {
    try {
        const result = await CreatorCodeService.approveRequest(
            req.params.requestId, req.user.accountId, req.user.displayName, req.body.note
        );
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'approve creator code', error);
    }
});

router.post('/neodyme/api/mod/creator-codes/reject/:requestId', ...gateWrite('creators.manage'), async (req, res) => {
    try {
        const result = await CreatorCodeService.rejectRequest(
            req.params.requestId, req.user.accountId, req.user.displayName, req.body.note
        );
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'reject creator code', error);
    }
});

router.get('/neodyme/api/mod/creator-codes/stats', ...gate('creators.manage'), async (req, res) => {
    try {
        return WebResponse.ok(res, { stats: await CreatorCodeService.getStats() });
    } catch (error) {
        return WebResponse.serverError(res, 'get creator code stats', error);
    }
});

router.get('/neodyme/api/mod/creator-codes', ...gate('creators.manage'), async (req, res) => {
    try {
        return WebResponse.ok(res, { codes: await CreatorCodeService.getAllCodes() });
    } catch (error) {
        return WebResponse.serverError(res, 'get all creator codes', error);
    }
});

router.delete('/neodyme/api/mod/creator-codes/:code', ...gateWrite('creators.manage'), async (req, res) => {
    try {
        const result = await CreatorCodeService.deleteCode(req.params.code, req.user.accountId, req.user.displayName);
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'delete creator code', error);
    }
});

router.put('/neodyme/api/mod/creator-codes/:code/toggle', ...gateWrite('creators.manage'), async (req, res) => {
    try {
        const result = await CreatorCodeService.toggleCodeStatus(req.params.code, req.body.isActive);
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'toggle creator code', error);
    }
});

// ---- Tickets ----

router.get('/neodyme/api/mod/tickets/stats', ...gate('tickets.manage'), async (req, res) => {
    try {
        return WebResponse.ok(res, { stats: await TicketService.getStats() });
    } catch (error) {
        return WebResponse.serverError(res, 'get ticket stats', error);
    }
});

router.get('/neodyme/api/mod/tickets', ...gate('tickets.manage'), async (req, res) => {
    try {
        const { status, priority, assignedTo, unassigned } = req.query;
        const filters = {};
        if (status) filters.status = status;
        if (priority) filters.priority = priority;
        if (assignedTo) filters.assignedTo = assignedTo;
        if (unassigned === 'true') filters.unassigned = true;

        return WebResponse.ok(res, { tickets: await TicketService.getAllTickets(filters) });
    } catch (error) {
        return WebResponse.serverError(res, 'get all tickets', error);
    }
});

router.put('/neodyme/api/mod/tickets/:ticketId/assign', ...gateWrite('tickets.manage'), async (req, res) => {
    try {
        const result = await TicketService.assignTicket(req.params.ticketId, req.user.accountId, req.user.displayName);
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'assign ticket', error);
    }
});

router.put('/neodyme/api/mod/tickets/:ticketId/unassign', ...gateWrite('tickets.manage'), async (req, res) => {
    try {
        return res.json(await TicketService.unassignTicket(req.params.ticketId));
    } catch (error) {
        return WebResponse.serverError(res, 'unassign ticket', error);
    }
});

router.post('/neodyme/api/mod/tickets/:ticketId/reply', ...gateWrite('tickets.manage'), async (req, res) => {
    try {
        const result = await TicketService.addModeratorReply(
            req.params.ticketId, req.user.accountId, req.user.displayName, req.body.content
        );
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'moderator reply', error);
    }
});

router.put('/neodyme/api/mod/tickets/:ticketId/status', ...gateWrite('tickets.manage'), async (req, res) => {
    try {
        const { status } = req.body;
        const result = await TicketService.updateTicketStatus(req.params.ticketId, status, req.user.displayName);

        if (status === 'closed') {
            await AuditService.logTicketAction(
                req.user.accountId, req.user.displayName,
                AuditService.ACTIONS.CLOSE_TICKET, req.params.ticketId, {}, req.ip
            );
        }
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'update ticket status', error);
    }
});

router.put('/neodyme/api/mod/tickets/:ticketId/priority', ...gateWrite('tickets.manage'), async (req, res) => {
    try {
        const result = await TicketService.updateTicketPriority(req.params.ticketId, req.body.priority, req.user.displayName);
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'update ticket priority', error);
    }
});

router.delete('/neodyme/api/mod/tickets/:ticketId', ...gateWrite('tickets.manage'), async (req, res) => {
    try {
        const result = await TicketService.deleteTicket(req.params.ticketId, req.user.displayName);
        if (result.success) {
            await AuditService.logTicketAction(
                req.user.accountId, req.user.displayName,
                AuditService.ACTIONS.DELETE_TICKET, req.params.ticketId, {}, req.ip
            );
        }
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'delete ticket', error);
    }
});

// ---- Players / bans ----

router.get('/neodyme/api/mod/players', ...gate('users.view'), async (req, res) => {
    try {
        const { search, banned } = req.query;
        let users = await DatabaseManager.getAllAccounts();
        users = users.filter(u => (u.clientType || 0) < ROLE_LEVELS.MODERATOR);

        if (search) {
            const q = search.toLowerCase();
            users = users.filter(u =>
                u.displayName.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                u.accountId.toLowerCase().includes(q)
            );
        }
        if (banned === 'true') users = users.filter(u => u.banned);
        else if (banned === 'false') users = users.filter(u => !u.banned);

        return WebResponse.ok(res, {
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
        return WebResponse.serverError(res, 'get players', error);
    }
});

router.get('/neodyme/api/mod/players/:accountId/bans', ...gate('users.view'), async (req, res) => {
    try {
        const history = await AuditService.getTargetHistory('user', req.params.accountId, 50);
        const banHistory = history.filter(l =>
            l.action === AuditService.ACTIONS.BAN_USER || l.action === AuditService.ACTIONS.UNBAN_USER
        );
        return WebResponse.ok(res, { history: banHistory });
    } catch (error) {
        return WebResponse.serverError(res, 'get ban history', error);
    }
});

router.post('/neodyme/api/mod/players/:accountId/ban', ...gateWrite('users.ban'), async (req, res) => {
    try {
        const { accountId } = req.params;
        const { reason, duration } = req.body;

        if (!reason || reason.trim().length < 3) {
            return WebResponse.badRequest(res, 'Ban reason is required (min 3 characters).');
        }

        const target = await DatabaseManager.getAccount(accountId);
        if (!target) {
            return WebResponse.notFound(res, 'Player not found.');
        }
        if ((target.clientType || 0) >= ROLE_LEVELS.MODERATOR) {
            return WebResponse.forbidden(res, 'Cannot ban staff members.');
        }

        const banExpires = duration && duration > 0
            ? new Date(Date.now() + duration * 60 * 60 * 1000).toISOString()
            : null;

        await DatabaseManager.banAccount(accountId, [reason], banExpires);
        await AuditService.logBan(
            req.user.accountId, req.user.displayName, accountId, target.displayName,
            reason, duration ? `${duration} hours` : 'permanent', req.ip
        );
        LoggerService.log('info', `Player ${target.displayName} banned by ${req.user.displayName}: ${reason}`);

        return WebResponse.ok(res, { message: `Player ${target.displayName} has been banned.`, banExpires });
    } catch (error) {
        return WebResponse.serverError(res, 'ban player', error);
    }
});

router.post('/neodyme/api/mod/players/:accountId/logout', ...gateWrite('users.logout'), async (req, res) => {
    try {
        const target = await DatabaseManager.getAccount(req.params.accountId);
        if (!target) return WebResponse.notFound(res, 'Account not found.');

        const targetLevel = typeof target.clientType === 'number' ? target.clientType : 0;
        if (req.userRoleLevel < ROLE_LEVELS.OWNER && targetLevel >= req.userRoleLevel) {
            return WebResponse.forbidden(res, 'You can only log out accounts below your own role.');
        }

        await RecoveryService.revokeSessions(target.accountId);
        await AuditService.log('force_logout', req.user.accountId, req.user.displayName, 'account', target.accountId,
            { targetUserName: target.displayName }, req.ip).catch(() => {});

        return WebResponse.ok(res, { message: `${target.displayName} has been logged out everywhere.` });
    } catch (error) {
        return WebResponse.serverError(res, 'force logout', error);
    }
});

router.post('/neodyme/api/mod/players/:accountId/unban', ...gateWrite('users.ban'), async (req, res) => {
    try {
        const { accountId } = req.params;
        const target = await DatabaseManager.getAccount(accountId);
        if (!target) {
            return WebResponse.notFound(res, 'Player not found.');
        }

        await DatabaseManager.unbanAccount(accountId);
        await AuditService.logUnban(req.user.accountId, req.user.displayName, accountId, target.displayName, req.ip);
        LoggerService.log('info', `Player ${target.displayName} unbanned by ${req.user.displayName}`);

        return WebResponse.ok(res, { message: `Player ${target.displayName} has been unbanned.` });
    } catch (error) {
        return WebResponse.serverError(res, 'unban player', error);
    }
});

// ---- Reports ----

router.get('/neodyme/api/mod/reports/stats', ...gate('reports.manage'), async (req, res) => {
    try {
        return WebResponse.ok(res, { stats: await ReportService.getStats() });
    } catch (error) {
        return WebResponse.serverError(res, 'get report stats', error);
    }
});

router.get('/neodyme/api/mod/reports/player/:accountId', ...gate('reports.manage'), async (req, res) => {
    try {
        return WebResponse.ok(res, { reports: await ReportService.getReportsByTarget(req.params.accountId) });
    } catch (error) {
        return WebResponse.serverError(res, 'get player reports', error);
    }
});

router.get('/neodyme/api/mod/reports', ...gate('reports.manage'), async (req, res) => {
    try {
        const { search, reportedAccountId, reporterAccountId } = req.query;
        const filters = {};
        if (search) filters.search = search;
        if (reportedAccountId) filters.reportedAccountId = reportedAccountId;
        if (reporterAccountId) filters.reporterAccountId = reporterAccountId;

        return WebResponse.ok(res, { reports: await ReportService.getAllReports(filters) });
    } catch (error) {
        return WebResponse.serverError(res, 'get reports', error);
    }
});

router.delete('/neodyme/api/mod/reports/:reportId', ...gateWrite('reports.manage'), async (req, res) => {
    try {
        const result = await ReportService.deleteReport(req.params.reportId);
        if (!result.success) {
            return WebResponse.notFound(res, result.message || 'Report not found.');
        }
        LoggerService.log('info', `Report ${req.params.reportId} dismissed by ${req.user.displayName}`);
        return res.json(result);
    } catch (error) {
        return WebResponse.serverError(res, 'delete report', error);
    }
});

// ---- Client feedback ----

const feedbackStoragePath = path.join(process.cwd(), 'data', 'feedback');

router.get('/neodyme/api/mod/feedback/file', ...gate('feedback.manage'), async (req, res) => {
    try {
        const filePath = path.resolve(feedbackStoragePath, req.query.path || '');
        if (!filePath.startsWith(feedbackStoragePath)) return WebResponse.badRequest(res, 'Invalid path.');
        if (!fs.existsSync(filePath)) return WebResponse.notFound(res, 'File not found.');
        return res.sendFile(filePath);
    } catch (error) {
        return WebResponse.serverError(res, 'get feedback file', error);
    }
});

router.get('/neodyme/api/mod/feedback', ...gate('feedback.manage'), async (req, res) => {
    try {
        const basePath = path.join(feedbackStoragePath, 'client-feedback', 'Fortnite');
        if (!fs.existsSync(basePath)) return WebResponse.ok(res, { submissions: [] });

        const submissions = [];
        for (const accountId of fs.readdirSync(basePath)) {
            const accountPath = path.join(basePath, accountId);
            if (!fs.statSync(accountPath).isDirectory()) continue;

            for (const profileDir of fs.readdirSync(accountPath)) {
                const profilePath = path.join(accountPath, profileDir);
                if (!fs.statSync(profilePath).isDirectory()) continue;

                for (const submissionDir of fs.readdirSync(profilePath)) {
                    const submissionPath = path.join(profilePath, submissionDir);
                    if (!fs.statSync(submissionPath).isDirectory()) continue;

                    const dashIdx = submissionDir.indexOf('-');
                    const type = dashIdx > 0 ? submissionDir.substring(0, dashIdx) : submissionDir;
                    const datetime = dashIdx > 0 ? submissionDir.substring(dashIdx + 1) : '';

                    const files = fs.readdirSync(submissionPath).map(f => ({
                        name: f,
                        relPath: `client-feedback/Fortnite/${accountId}/${profileDir}/${submissionDir}/${f}`
                    }));

                    const account = await DatabaseManager.getAccount(accountId);
                    submissions.push({
                        id: `${accountId}/${profileDir}/${submissionDir}`,
                        accountId,
                        displayName: account?.displayName || accountId,
                        type,
                        datetime,
                        files
                    });
                }
            }
        }

        submissions.sort((a, b) => b.datetime.localeCompare(a.datetime));
        return WebResponse.ok(res, { submissions });
    } catch (error) {
        return WebResponse.serverError(res, 'get feedback list', error);
    }
});

router.delete('/neodyme/api/mod/feedback/:id(*)', ...gateWrite('feedback.manage'), async (req, res) => {
    try {
        const submissionPath = path.resolve(feedbackStoragePath, 'client-feedback', 'Fortnite', req.params.id);
        if (!submissionPath.startsWith(feedbackStoragePath)) return WebResponse.badRequest(res, 'Invalid path.');
        if (fs.existsSync(submissionPath)) {
            fs.rmSync(submissionPath, { recursive: true, force: true });
        }
        return WebResponse.ok(res, {});
    } catch (error) {
        return WebResponse.serverError(res, 'delete feedback', error);
    }
});

module.exports = router;
