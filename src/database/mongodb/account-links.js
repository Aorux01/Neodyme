const mongoose = require('mongoose');

const AccountLinkSchema = new mongoose.Schema({
    provider: { type: String, required: true },
    providerId: { type: String, required: true },
    accountId: { type: String, required: true, index: true },
    username: { type: String, default: '' },
    linkedAt: { type: Date, default: Date.now }
}, { collection: 'account_links' });

AccountLinkSchema.index({ provider: 1, providerId: 1 }, { unique: true });
AccountLinkSchema.index({ provider: 1, accountId: 1 }, { unique: true });

module.exports = mongoose.model('AccountLink', AccountLinkSchema);
