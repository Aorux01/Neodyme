const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    logId: { type: String, required: true, unique: true, index: true },
    action: { type: String, required: true, index: true },
    performedBy: { type: String, required: true, index: true },
    performedByName: { type: String, required: true },
    targetType: { type: String, required: true, index: true },
    targetId: { type: String, required: true, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, required: true, index: true },
    ipAddress: { type: String, default: null }
}, { collection: 'audit_logs' });

// Index for efficient querying
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ performedBy: 1, timestamp: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
