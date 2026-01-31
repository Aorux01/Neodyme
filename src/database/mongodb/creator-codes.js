const mongoose = require('mongoose');

const CreatorCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    displayName: { type: String, required: true },
    createdAt: { type: Date, required: true },
    approvedBy: { type: String, required: true },
    approvedByName: { type: String, required: true },
    totalEarnings: { type: Number, default: 0 },
    totalUses: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    lastUsedAt: { type: Date, default: null }
}, { collection: 'creator_codes' });

const CreatorCodeRequestSchema = new mongoose.Schema({
    requestId: { type: String, required: true, unique: true, index: true },
    accountId: { type: String, required: true, index: true },
    displayName: { type: String, required: true },
    requestedCode: { type: String, required: true },
    reason: { type: String, default: '' },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },
    createdAt: { type: Date, required: true },
    reviewedBy: { type: String, default: null },
    reviewedByName: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null }
}, { collection: 'creator_code_requests' });

// Compound indexes
CreatorCodeSchema.index({ accountId: 1, isActive: 1 });
CreatorCodeRequestSchema.index({ accountId: 1, status: 1 });

const CreatorCode = mongoose.model('CreatorCode', CreatorCodeSchema);
const CreatorCodeRequest = mongoose.model('CreatorCodeRequest', CreatorCodeRequestSchema);

module.exports = { CreatorCode, CreatorCodeRequest };
