const mongoose = require('mongoose');

const CloudStorageSchema = new mongoose.Schema({
    accountId: { type: String, required: true, unique: true },
    content: { type: Buffer, required: true },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'cloudstorage' });

module.exports = mongoose.model('CloudStorage', CloudStorageSchema);
