const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
    accountId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    displayName: { type: String, required: true, unique: true },
    displayName_lower: { type: String, required: true, unique: true },
    country: { type: String, default: 'US' },
    preferredLanguage: { type: String, default: 'en' },
    created: { type: Date, required: true },
    lastLogin: { type: Date, default: Date.now },
    ban: {
        banned: { type: Boolean, default: false },
        banReasons: { type: Array, default: [] },
        banExpires: { type: Date, default: null }
    },
    canUpdateDisplayName: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutCount: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
    tfaEnabled: { type: Boolean, default: false },
    tfaSecret: { type: String, default: null },
    emailVerified: { type: Boolean, default: true },
    numberOfDisplayNameChanges: { type: Number, default: 0 },
    ageGroup: { type: String, default: 'ADULT' },
    minorStatus: { type: String, default: 'NOT_MINOR' },
    cabinedMode: { type: Boolean, default: false },
    clientType: { type: Number, default: 0 }
}, { collection: 'users' });

module.exports = mongoose.model('User', ClientSchema);
