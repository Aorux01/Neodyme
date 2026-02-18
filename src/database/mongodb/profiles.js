const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
    accountId: { type: String, required: true, unique: true },
    created: { type: Date, required: true },
    profiles: { type: Object, required: true }
}, { collection: 'profiles' });

module.exports = mongoose.model('Profile', ProfileSchema);