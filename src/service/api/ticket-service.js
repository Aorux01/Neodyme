const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../logger/logger-service');
const DatabaseManager = require('../../manager/database-manager');

class TicketService {
    static initialized = false;

    static async initialize() {
        if (this.initialized) return;
        this.initialized = true;
        LoggerService.log('info', 'Ticket service initialized');
    }

    static async createTicket(accountId, displayName, subject, message, priority = 'medium') {
        if (!subject || subject.trim().length < 5) {
            return { success: false, error: 'Subject must be at least 5 characters' };
        }
        if (subject.length > 100) {
            return { success: false, error: 'Subject must be less than 100 characters' };
        }

        if (!message || message.trim().length < 10) {
            return { success: false, error: 'Message must be at least 10 characters' };
        }
        if (message.length > 2000) {
            return { success: false, error: 'Message must be less than 2000 characters' };
        }

        const validPriorities = ['low', 'medium', 'high'];
        if (!validPriorities.includes(priority)) {
            priority = 'medium';
        }

        const data = await DatabaseManager.getTickets();
        const openTickets = Object.values(data.tickets).filter(
            t => t.playerAccountId === accountId && ['open', 'in_progress'].includes(t.status)
        );
        if (openTickets.length >= 3) {
            return { success: false, error: 'You already have 3 open tickets. Please wait for them to be resolved.' };
        }

        const ticketId = `ticket_${Date.now()}_${uuidv4().substring(0, 8)}`;
        const now = new Date();

        const ticket = {
            ticketId,
            playerAccountId: accountId,
            playerDisplayName: displayName,
            subject: subject.trim(),
            status: 'open',
            priority,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            assignedTo: null,
            assignedToName: null,
            messages: [{
                messageId: uuidv4(),
                authorAccountId: accountId,
                authorName: displayName,
                authorRole: 'player',
                content: message.trim(),
                timestamp: now.toISOString()
            }]
        };

        await DatabaseManager.createTicket(ticket);
        LoggerService.log('info', `Ticket created: ${ticketId} by ${displayName} - "${subject}"`);

        return { success: true, ticketId, message: 'Ticket created successfully' };
    }

    static async getPlayerTickets(accountId) {
        const data = await DatabaseManager.getTickets();
        return Object.values(data.tickets)
            .filter(t => t.playerAccountId === accountId)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    static async getTicket(ticketId, accountId = null, isModerator = false) {
        const ticket = await DatabaseManager.getTicket(ticketId);

        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }

        if (!isModerator && ticket.playerAccountId !== accountId) {
            return { success: false, error: 'Access denied' };
        }

        return { success: true, ticket };
    }

    static async addPlayerMessage(ticketId, accountId, displayName, content) {
        if (!content || content.trim().length < 1) {
            return { success: false, error: 'Message cannot be empty' };
        }
        if (content.length > 2000) {
            return { success: false, error: 'Message must be less than 2000 characters' };
        }

        const ticket = await DatabaseManager.getTicket(ticketId);

        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }
        if (ticket.playerAccountId !== accountId) {
            return { success: false, error: 'Access denied' };
        }
        if (ticket.status === 'closed') {
            return { success: false, error: 'Cannot reply to a closed ticket' };
        }

        const now = new Date();
        const newMessage = {
            messageId: uuidv4(),
            authorAccountId: accountId,
            authorName: displayName,
            authorRole: 'player',
            content: content.trim(),
            timestamp: now.toISOString()
        };

        ticket.messages.push(newMessage);
        ticket.updatedAt = now.toISOString();

        if (ticket.status === 'resolved') {
            ticket.status = 'open';
        }

        await DatabaseManager.updateTicket(ticketId, {
            messages: ticket.messages,
            updatedAt: ticket.updatedAt,
            status: ticket.status
        });

        LoggerService.log('info', `Ticket ${ticketId}: Player ${displayName} added a message`);
        return { success: true, message: 'Message added successfully' };
    }

    static async getAllTickets(filters = {}) {
        const data = await DatabaseManager.getTickets();
        let tickets = Object.values(data.tickets);

        if (filters.status) {
            tickets = tickets.filter(t => t.status === filters.status);
        }
        if (filters.priority) {
            tickets = tickets.filter(t => t.priority === filters.priority);
        }
        if (filters.assignedTo) {
            tickets = tickets.filter(t => t.assignedTo === filters.assignedTo);
        }
        if (filters.unassigned) {
            tickets = tickets.filter(t => !t.assignedTo);
        }

        const priorityOrder = { high: 0, medium: 1, low: 2 };
        tickets.sort((a, b) => {
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        return tickets;
    }

    static async assignTicket(ticketId, moderatorAccountId, moderatorName) {
        const ticket = await DatabaseManager.getTicket(ticketId);

        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }
        if (ticket.status === 'closed') {
            return { success: false, error: 'Cannot assign a closed ticket' };
        }

        const now = new Date();
        const updates = {
            assignedTo: moderatorAccountId,
            assignedToName: moderatorName,
            updatedAt: now.toISOString()
        };

        if (ticket.status === 'open') {
            updates.status = 'in_progress';
        }

        await DatabaseManager.updateTicket(ticketId, updates);
        LoggerService.log('info', `Ticket ${ticketId}: Assigned to ${moderatorName}`);

        return { success: true, message: 'Ticket assigned successfully' };
    }

    static async unassignTicket(ticketId) {
        const ticket = await DatabaseManager.getTicket(ticketId);

        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }

        const now = new Date();
        const updates = {
            assignedTo: null,
            assignedToName: null,
            updatedAt: now.toISOString()
        };

        if (ticket.status === 'in_progress') {
            updates.status = 'open';
        }

        await DatabaseManager.updateTicket(ticketId, updates);
        LoggerService.log('info', `Ticket ${ticketId}: Unassigned`);

        return { success: true, message: 'Ticket unassigned successfully' };
    }

    static async addModeratorReply(ticketId, moderatorAccountId, moderatorName, content) {
        if (!content || content.trim().length < 1) {
            return { success: false, error: 'Message cannot be empty' };
        }
        if (content.length > 2000) {
            return { success: false, error: 'Message must be less than 2000 characters' };
        }

        const ticket = await DatabaseManager.getTicket(ticketId);

        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }
        if (ticket.status === 'closed') {
            return { success: false, error: 'Cannot reply to a closed ticket' };
        }

        const now = new Date();
        const newMessage = {
            messageId: uuidv4(),
            authorAccountId: moderatorAccountId,
            authorName: moderatorName,
            authorRole: 'moderator',
            content: content.trim(),
            timestamp: now.toISOString()
        };

        ticket.messages.push(newMessage);

        const updates = {
            messages: ticket.messages,
            updatedAt: now.toISOString()
        };

        if (!ticket.assignedTo) {
            updates.assignedTo = moderatorAccountId;
            updates.assignedToName = moderatorName;
            updates.status = 'in_progress';
        }

        await DatabaseManager.updateTicket(ticketId, updates);
        LoggerService.log('info', `Ticket ${ticketId}: Moderator ${moderatorName} replied`);

        return { success: true, message: 'Reply added successfully' };
    }

    static async updateTicketStatus(ticketId, status, moderatorName) {
        const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return { success: false, error: 'Invalid status' };
        }

        const ticket = await DatabaseManager.getTicket(ticketId);

        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }

        const now = new Date();
        await DatabaseManager.updateTicket(ticketId, {
            status,
            updatedAt: now.toISOString()
        });

        LoggerService.log('info', `Ticket ${ticketId}: Status changed to ${status} by ${moderatorName}`);
        return { success: true, message: `Ticket ${status}` };
    }

    static async updateTicketPriority(ticketId, priority, moderatorName) {
        const validPriorities = ['low', 'medium', 'high'];
        if (!validPriorities.includes(priority)) {
            return { success: false, error: 'Invalid priority' };
        }

        const ticket = await DatabaseManager.getTicket(ticketId);

        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }

        const now = new Date();
        await DatabaseManager.updateTicket(ticketId, {
            priority,
            updatedAt: now.toISOString()
        });

        LoggerService.log('info', `Ticket ${ticketId}: Priority changed to ${priority} by ${moderatorName}`);
        return { success: true, message: 'Priority updated' };
    }

    static async deleteTicket(ticketId, deletedByName) {
        const ticket = await DatabaseManager.getTicket(ticketId);

        if (!ticket) {
            return { success: false, error: 'Ticket not found' };
        }

        const result = await DatabaseManager.deleteTicketData(ticketId);

        if (!result) {
            return { success: false, error: 'Failed to delete ticket' };
        }

        LoggerService.log('info', `Ticket ${ticketId} deleted by ${deletedByName}`);
        return { success: true, message: 'Ticket deleted' };
    }

    static async getStats() {
        const data = await DatabaseManager.getTickets();
        const tickets = Object.values(data.tickets);

        return {
            total: tickets.length,
            open: tickets.filter(t => t.status === 'open').length,
            inProgress: tickets.filter(t => t.status === 'in_progress').length,
            resolved: tickets.filter(t => t.status === 'resolved').length,
            closed: tickets.filter(t => t.status === 'closed').length,
            highPriority: tickets.filter(t => t.priority === 'high' && ['open', 'in_progress'].includes(t.status)).length,
            unassigned: tickets.filter(t => !t.assignedTo && ['open', 'in_progress'].includes(t.status)).length
        };
    }
}

module.exports = TicketService;