const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    reportId: { type: String, required: true, unique: true, index: true },
    reporterAccountId: { type: String, required: true, index: true },
    reporterDisplayName: { type: String, required: true },
    reportedAccountId: { type: String, required: true, index: true },
    reportedDisplayName: { type: String, required: true },
    reason: { type: String, default: 'No reason provided' },
    details: { type: String, default: 'No details provided' },
    createdAt: { type: Date, required: true, index: true }
}, { collection: 'reports' });

ReportSchema.index({ reportedAccountId: 1, createdAt: -1 });
ReportSchema.index({ reporterAccountId: 1, reportedAccountId: 1 });

module.exports = mongoose.model('Report', ReportSchema);
