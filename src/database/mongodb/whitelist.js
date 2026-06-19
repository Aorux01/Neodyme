const mongoose = require('mongoose');

const WhitelistSchema = new mongoose.Schema({
    accountId: { type: String, required: true, unique: true, index: true },
    addedAt: { type: Date, default: Date.now }
}, { collection: 'whitelist' });

module.exports = mongoose.model('Whitelist', WhitelistSchema);
