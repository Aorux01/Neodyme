const mongoose = require('mongoose');

const TicketMessageSchema = new mongoose.Schema({
    messageId: { type: String, required: true },
    authorAccountId: { type: String, required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: ['player', 'moderator'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, required: true }
}, { _id: false });

const TicketSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true, index: true },
    playerAccountId: { type: String, required: true, index: true },
    playerDisplayName: { type: String, required: true },
    subject: { type: String, required: true },
    status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open',
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium',
        index: true
    },
    createdAt: { type: Date, required: true, index: true },
    updatedAt: { type: Date, required: true, index: true },
    assignedTo: { type: String, default: null, index: true },
    assignedToName: { type: String, default: null },
    messages: [TicketMessageSchema]
}, { collection: 'tickets' });

// Compound indexes for common queries
TicketSchema.index({ status: 1, priority: 1, createdAt: 1 });
TicketSchema.index({ playerAccountId: 1, status: 1 });
TicketSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('Ticket', TicketSchema);
