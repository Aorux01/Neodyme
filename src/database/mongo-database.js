const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');

const User = require('./mongodb/clients');
const Profile = require('./mongodb/profiles');
const Friends = require('./mongodb/friends');

class MongoDatabase {
    static MAX_FAILED_ATTEMPTS = 5;
    static LOCKOUT_DURATION_MS = 15 * 60 * 1000;
    static LOCKOUT_MULTIPLIER = 2;

    static dataPath = path.join(__dirname, '../../data');
    static playersPath = path.join(this.dataPath, 'players');

    static initialize() {
        const dbPath = ConfigManager.get('databasePath');

        mongoose.connect(dbPath)
            .then(() => {
                LoggerService.log('info', 'MongoDB connected successfully');
            })
            .catch(err => {
                LoggerService.log('error', `MongoDB connection error: ${err.message}`);
                throw err;
            });

        mongoose.connection.on('error', err => {
            LoggerService.log('error', `MongoDB error: ${err.message}`);
        });

        mongoose.connection.on('disconnected', () => {
            LoggerService.log('warning', 'MongoDB disconnected');
        });

        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }
        if (!fs.existsSync(this.playersPath)) {
            fs.mkdirSync(this.playersPath, { recursive: true });
        }

        LoggerService.log('info', 'Mongo Database initialized');
    }

    static normalizeEmail(email) {
        if (!email || typeof email !== 'string') return '';
        return email.trim().toLowerCase();
    }

    static generatePurchaseId() {
        return 'purchase_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    static generateItemId() {
        return uuidv4().replace(/-/g, '');
    }

    static validatePasswordStrength(password) {
        const minLength = ConfigManager.get('passwordMinLength', 8);

        if (password.length < minLength) {
            throw new Error(`Password must be at least ${minLength} characters long`);
        }

        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

        if (!hasUpperCase) {
            throw new Error('Password must contain at least one uppercase letter');
        }
        if (!hasLowerCase) {
            throw new Error('Password must contain at least one lowercase letter');
        }
        if (!hasNumbers) {
            throw new Error('Password must contain at least one number');
        }
        if (!hasSpecialChar) {
            throw new Error('Password must contain at least one special character');
        }

        return true;
    }

    static async getAccount(accountId) {
        const user = await User.findOne({ accountId }).lean();
        return user;
    }

    static async getAllAccounts() {
        return await User.find({}).lean();
    }

    static async getAccountByEmail(email) {
        const normalizedEmail = this.normalizeEmail(email);
        return await User.findOne({ email: normalizedEmail }).lean();
    }

    static async getAccountByDisplayName(displayName) {
        return await User.findOne({
            displayName_lower: displayName.toLowerCase()
        }).lean();
    }

    static getPublicAccountsByDisplayNameSubstr(displayNameSubstr) {
        return this.getPublicAccountsByDisplayNameSubstrAsync(displayNameSubstr);
    }

    static async getPublicAccountsByDisplayNameSubstrAsync(displayNameSubstr) {
        const MAX_RESULTS = 20;

        if (typeof displayNameSubstr !== 'string') {
            return [];
        }

        const searchLower = displayNameSubstr.toLowerCase();

        const matchingAccounts = await User.find({
            displayName_lower: { $regex: searchLower, $options: 'i' }
        }).limit(MAX_RESULTS).lean();

        const formattedResponse = matchingAccounts.map(account => ({
            id: account.accountId,
            displayName: account.displayName,
            externalAuths: {}
        }));

        if (formattedResponse.length === 1) {
            formattedResponse.push(formattedResponse[0]);
        }

        return formattedResponse;
    }

    static async getAccountByExactDisplayName(displayName) {
        if (typeof displayName !== 'string') {
            return {};
        }

        const exactMatch = await User.findOne({
            displayName_lower: displayName.toLowerCase()
        }).lean();

        if (exactMatch) {
            return {
                id: exactMatch.accountId,
                displayName: exactMatch.displayName,
                externalAuths: {}
            };
        }

        return {};
    }

    static async createAccount(email, password, displayName) {
        const normalizedEmail = this.normalizeEmail(email);

        const existingEmail = await User.findOne({ email: normalizedEmail });
        if (existingEmail) {
            throw new Error('Email already exists');
        }

        const existingName = await User.findOne({
            displayName_lower: displayName.toLowerCase()
        });
        if (existingName) {
            throw new Error('Display name already exists');
        }

        this.validatePasswordStrength(password);

        const accountId = uuidv4().replace(/-/g, '');
        const workFactor = ConfigManager.get('bcryptWorkFactor', 12);
        const hashedPassword = await bcrypt.hash(password, workFactor);

        try {
            const newUser = await User.create({
                accountId,
                email: normalizedEmail,
                password: hashedPassword,
                displayName,
                displayName_lower: displayName.toLowerCase(),
                country: 'US',
                preferredLanguage: 'en',
                created: new Date(),
                lastLogin: new Date(),
                ban: {
                    banned: false,
                    banReasons: [],
                    banExpires: null
                },
                canUpdateDisplayName: true,
                failedLoginAttempts: 0,
                lockoutCount: 0,
                tfaEnabled: false,
                tfaSecret: null,
                emailVerified: true,
                numberOfDisplayNameChanges: 0,
                ageGroup: 'ADULT',
                minorStatus: 'NOT_MINOR',
                cabinedMode: false,
                clientType: 0
            });

            const profiles = await this.generateDefaultProfiles(accountId);
            await Profile.create({
                accountId,
                created: new Date(),
                profiles
            });

            await Friends.create({
                accountId,
                created: new Date(),
                list: {
                    accepted: [],
                    incoming: [],
                    outgoing: [],
                    blocked: []
                }
            });

            const playerPath = path.join(this.playersPath, accountId);
            const cloudStoragePath = path.join(playerPath, 'CloudStorage');
            if (!fs.existsSync(cloudStoragePath)) {
                fs.mkdirSync(cloudStoragePath, { recursive: true });
            }

            LoggerService.log('success', `Account created: ${displayName} (${accountId})`);

            return newUser.toObject();

        } catch (error) {
            if (error.code === 11000) {
                throw new Error('Email or display name already exists');
            }
            throw error;
        }
    }

    static async generateDefaultProfiles(accountId) {
        const templatePath = path.join(__dirname, '../../template');
        const profiles = {};

        const profileFiles = [
            'athena', 'common_core', 'campaign', 'creative',
            'collection_book_people0', 'collection_book_schematics0',
            'collections', 'common_public', 'metadata',
            'outpost0', 'profile0', 'theater0'
        ];

        for (const profileName of profileFiles) {
            const filePath = path.join(templatePath, `${profileName}.json`);
            if (fs.existsSync(filePath)) {
                let content = fs.readFileSync(filePath, 'utf8');
                content = content.replace(/"accountId"\s*:\s*"Neodyme"/g, `"accountId": "${accountId}"`);
                content = content.replace(/"_id"\s*:\s*"Neodyme"/g, `"_id": "${accountId}"`);
                profiles[profileName] = JSON.parse(content);
            }
        }

        return profiles;
    }

    static async updateAccount(accountId, updates) {
        const user = await User.findOne({ accountId });
        if (!user) return false;

        if (updates.displayName && updates.displayName !== user.displayName) {
            const existing = await User.findOne({
                displayName_lower: updates.displayName.toLowerCase(),
                accountId: { $ne: accountId }
            });
            if (existing) throw new Error('Display name already exists');

            updates.displayName_lower = updates.displayName.toLowerCase();
            updates.numberOfDisplayNameChanges = (user.numberOfDisplayNameChanges || 0) + 1;
        }

        if (updates.email && updates.email !== user.email) {
            const normalizedEmail = this.normalizeEmail(updates.email);
            const existing = await User.findOne({
                email: normalizedEmail,
                accountId: { $ne: accountId }
            });
            if (existing) throw new Error('Email already exists');
            updates.email = normalizedEmail;
        }

        await User.updateOne({ accountId }, { $set: updates });
        return await this.getAccount(accountId);
    }

    static async updatePassword(accountId, currentPassword, newPassword) {
        const user = await User.findOne({ accountId });
        if (!user) return { success: false, message: 'Account not found' };

        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) return { success: false, message: 'Current password is incorrect' };

        this.validatePasswordStrength(newPassword);

        const workFactor = ConfigManager.get('bcryptWorkFactor', 12);
        const hashedPassword = await bcrypt.hash(newPassword, workFactor);

        await User.updateOne({ accountId }, { $set: { password: hashedPassword } });

        LoggerService.log('info', `Password updated for account: ${accountId}`);
        return { success: true };
    }

    static async updateLastLogin(accountId) {
        await User.updateOne(
            { accountId },
            { $set: { lastLogin: new Date() } }
        );
        return true;
    }

    static async AccountIsBanned(accountId) {
        const user = await User.findOne({ accountId }).lean();
        if (!user) return false;

        if (!user.ban || !user.ban.banned) return false;

        if (user.ban.banExpires && new Date(user.ban.banExpires) <= new Date()) {
            await this.unbanAccount(accountId);
            return false;
        }

        return true;
    }

    static async getBanInfo(accountId) {
        const user = await User.findOne({ accountId }).lean();

        if (!user) {
            return { banned: false };
        }

        if (!user.ban || !user.ban.banned) {
            return { banned: false };
        }

        if (user.ban.banExpires && new Date(user.ban.banExpires) <= new Date()) {
            await this.unbanAccount(accountId);
            return { banned: false };
        }

        return {
            banned: true,
            banExpires: user.ban.banExpires || null,
            banReasons: user.ban.banReasons || []
        };
    }

    static async banAccount(accountId, reasons = [], expiresAt = null) {
        const result = await User.updateOne(
            { accountId },
            {
                $set: {
                    'ban.banned': true,
                    'ban.banReasons': reasons,
                    'ban.banExpires': expiresAt
                }
            }
        );

        if (result.matchedCount === 0) return false;

        LoggerService.log('warning', `Account banned: ${accountId}`);
        return true;
    }

    static async unbanAccount(accountId) {
        const result = await User.updateOne(
            { accountId },
            {
                $set: {
                    'ban.banned': false,
                    'ban.banReasons': [],
                    'ban.banExpires': null
                }
            }
        );

        if (result.matchedCount === 0) return false;

        LoggerService.log('info', `Account unbanned: ${accountId}`);
        return true;
    }

    static async setBanStatus(accountId, banned, reason = null) {
        if (banned) {
            return await this.banAccount(accountId, reason ? [reason] : []);
        } else {
            return await this.unbanAccount(accountId);
        }
    }

    static async isAccountLocked(accountId) {
        const user = await User.findOne({ accountId }).lean();

        if (!user) return { locked: false };
        if (!user.lockoutUntil) return { locked: false };

        const lockedUntil = new Date(user.lockoutUntil);
        if (lockedUntil <= new Date()) {
            await this.resetFailedAttempts(accountId);
            return { locked: false };
        }

        return {
            locked: true,
            lockedUntil: user.lockoutUntil,
            remainingMs: lockedUntil.getTime() - Date.now()
        };
    }

    static async recordFailedLoginAttempt(accountId) {
        const user = await User.findOne({ accountId });
        if (!user) return null;

        const newAttempts = (user.failedLoginAttempts || 0) + 1;
        const updates = {
            failedLoginAttempts: newAttempts,
            lastFailedLogin: new Date()
        };

        if (newAttempts >= this.MAX_FAILED_ATTEMPTS) {
            const lockoutCount = user.lockoutCount || 0;
            const multiplier = Math.pow(this.LOCKOUT_MULTIPLIER, lockoutCount);
            const lockoutDuration = this.LOCKOUT_DURATION_MS * multiplier;

            updates.lockoutUntil = new Date(Date.now() + lockoutDuration);
            updates.lockoutCount = lockoutCount + 1;

            LoggerService.log('warning', `Account locked due to failed attempts: ${accountId} for ${lockoutDuration / 1000}s`);
        }

        await User.updateOne({ accountId }, { $set: updates });

        return {
            failedAttempts: newAttempts,
            maxAttempts: this.MAX_FAILED_ATTEMPTS,
            locked: newAttempts >= this.MAX_FAILED_ATTEMPTS,
            lockedUntil: updates.lockoutUntil
        };
    }

    static async resetFailedAttempts(accountId) {
        const result = await User.updateOne(
            { accountId },
            {
                $set: { failedLoginAttempts: 0 },
                $unset: { lockoutUntil: '', lastFailedLogin: '' }
            }
        );
        return result.matchedCount > 0;
    }

    static ROLE_MAP = {
        'player': 0,
        'mod': 1,
        'moderator': 1,
        'dev': 2,
        'developer': 2,
        'admin': 3,
        'owner': 4
    };

    static ROLE_NAMES = {
        0: 'player',
        1: 'moderator',
        2: 'developer',
        3: 'admin',
        4: 'owner'
    };

    static getRoleName(clientType) {
        return this.ROLE_NAMES[clientType] || 'player';
    }

    static getRoleLevel(role) {
        if (typeof role === 'number') return role;
        return this.ROLE_MAP[role.toLowerCase()] ?? 0;
    }

    static async setClientType(accountId, clientType) {
        if (typeof clientType !== 'number' || clientType < 0 || clientType > 4) {
            return false;
        }

        const result = await User.updateOne(
            { accountId },
            { $set: { clientType } }
        );
        return result.matchedCount > 0;
    }

    static async updateAccountRole(accountId, role) {
        const clientType = typeof role === 'number' ? role : this.getRoleLevel(role);

        if (clientType < 0 || clientType > 4) {
            return false;
        }

        const result = await User.updateOne(
            { accountId },
            { $set: { clientType } }
        );

        if (result.matchedCount > 0) {
            LoggerService.log('info', `Account role updated: ${accountId} -> ${this.getRoleName(clientType)}`);
            return true;
        }
        return false;
    }

    static async getProfile(accountId, profileId) {
        const profileDoc = await Profile.findOne({ accountId }).lean();
        if (!profileDoc || !profileDoc.profiles) return null;
        return profileDoc.profiles[profileId] || null;
    }

    static async saveProfile(accountId, profileId, profileData) {
        const result = await Profile.updateOne(
            { accountId },
            { $set: { [`profiles.${profileId}`]: profileData } },
            { upsert: true }
        );
        return result.acknowledged;
    }

    static async updateProfileStats(accountId, profileId, stats) {
        const profile = await this.getProfile(accountId, profileId);
        if (!profile) return false;

        profile.stats = { ...profile.stats, ...stats };
        return await this.saveProfile(accountId, profileId, profile);
    }

    static async addItemToProfile(accountId, profileId, itemId, itemData) {
        const profile = await this.getProfile(accountId, profileId);
        if (!profile) return false;

        if (!profile.items) profile.items = {};
        profile.items[itemId] = itemData;

        return await this.saveProfile(accountId, profileId, profile);
    }

    static async removeItemFromProfile(accountId, profileId, itemId) {
        const profile = await this.getProfile(accountId, profileId);
        if (!profile) return false;

        if (profile.items && profile.items[itemId]) {
            delete profile.items[itemId];
            return await this.saveProfile(accountId, profileId, profile);
        }

        return false;
    }

    static async updateItemInProfile(accountId, profileId, itemId, updates) {
        const profile = await this.getProfile(accountId, profileId);
        if (!profile || !profile.items || !profile.items[itemId]) {
            return false;
        }

        profile.items[itemId] = { ...profile.items[itemId], ...updates };
        return await this.saveProfile(accountId, profileId, profile);
    }

    static async getAthenaProfile(accountId, profileId) {
        return await this.getProfile(accountId, profileId);
    }

    static async saveAthenaProfile(accountId, profileId, profileData) {
        return await this.saveProfile(accountId, profileId, profileData);
    }

    static async userOwnsItem(accountId, templateId) {
        const athena = await this.getProfile(accountId, 'athena');
        if (!athena || !athena.items) return false;

        const normalizedTemplateId = templateId.toLowerCase();
        return Object.values(athena.items).some(
            item => item.templateId && item.templateId.toLowerCase() === normalizedTemplateId
        );
    }

    static async getVbucksBalance(accountId) {
        const commonCore = await this.getProfile(accountId, 'common_core');
        if (!commonCore || !commonCore.items) return 0;

        const currency = Object.values(commonCore.items).find(
            item => item.templateId === 'Currency:MtxPurchased'
        );

        return currency ? currency.quantity : 0;
    }

    static async setVbucksBalance(accountId, newBalance) {
        const commonCore = await this.getProfile(accountId, 'common_core');
        if (!commonCore) return false;

        const currencyKey = Object.keys(commonCore.items || {}).find(
            key => commonCore.items[key].templateId === 'Currency:MtxPurchased'
        );

        if (currencyKey) {
            commonCore.items[currencyKey].quantity = newBalance;
            return await this.saveProfile(accountId, 'common_core', commonCore);
        }

        return false;
    }

    static async addVbucks(accountId, amount) {
        if (!amount || amount <= 0) return { success: false, message: 'Invalid amount' };

        const commonCore = await this.getProfile(accountId, 'common_core');
        if (!commonCore) {
            return { success: false, message: 'Profile not found' };
        }

        let currencyKey = Object.keys(commonCore.items || {}).find(
            key => commonCore.items[key].templateId === 'Currency:MtxPurchased'
        );

        if (!currencyKey) {
            currencyKey = 'Currency';
            commonCore.items = commonCore.items || {};
            commonCore.items[currencyKey] = {
                templateId: 'Currency:MtxPurchased',
                attributes: { platform: 'EpicPC' },
                quantity: 0
            };
        }

        commonCore.items[currencyKey].quantity += amount;
        commonCore.rvn = (commonCore.rvn || 0) + 1;
        commonCore.updated = new Date().toISOString();

        await this.saveProfile(accountId, 'common_core', commonCore);

        LoggerService.log('info', `Added ${amount} V-Bucks to account ${accountId}`);

        return {
            success: true,
            newBalance: commonCore.items[currencyKey].quantity,
            added: amount
        };
    }

    static async processVbucksPurchase(accountId, vbucksAmount, price, paymentMethod) {
        try {
            const commonCore = await this.getProfile(accountId, 'common_core');
            if (!commonCore) {
                throw new Error('User profile not found');
            }

            if (!commonCore.items.Currency) {
                commonCore.items.Currency = {
                    templateId: "Currency:MtxPurchased",
                    attributes: { platform: "EpicPC" },
                    quantity: 0
                };
            }

            commonCore.items.Currency.quantity += vbucksAmount;

            if (!commonCore.stats.attributes.in_app_purchases) {
                commonCore.stats.attributes.in_app_purchases = {};
            }

            const purchaseId = this.generatePurchaseId();
            commonCore.stats.attributes.in_app_purchases[purchaseId] = {
                vbucks: vbucksAmount,
                price: price,
                method: paymentMethod,
                date: new Date().toISOString()
            };

            commonCore.rvn = (commonCore.rvn || 0) + 1;
            commonCore.updated = new Date().toISOString();
            commonCore.commandRevision = (commonCore.commandRevision || 0) + 1;

            await this.saveProfile(accountId, 'common_core', commonCore);

            LoggerService.log('success', `V-Bucks purchase processed: ${accountId} bought ${vbucksAmount} V-Bucks for $${price}`);

            return {
                success: true,
                newBalance: commonCore.items.Currency.quantity,
                purchaseId: purchaseId
            };

        } catch (error) {
            LoggerService.log('error', `Process V-Bucks purchase error: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    static async processItemPurchase(accountId, itemKey, item) {
        try {
            const commonCore = await this.getProfile(accountId, 'common_core');
            if (!commonCore) {
                throw new Error('User profile not found');
            }

            if (!commonCore.items.Currency) {
                throw new Error('No V-Bucks currency found');
            }

            const itemPrice = item.price || 0;

            if (commonCore.items.Currency.quantity < itemPrice) {
                throw new Error('Insufficient V-Bucks');
            }

            commonCore.items.Currency.quantity -= itemPrice;

            const athena = await this.getProfile(accountId, 'athena');
            if (athena) {
                if (item.itemGrants && Array.isArray(item.itemGrants)) {
                    for (const grant of item.itemGrants) {
                        const itemTemplateId = (grant.templateId || grant).toLowerCase();

                        const existingItem = Object.values(athena.items || {}).find(
                            existingItem => existingItem.templateId && existingItem.templateId.toLowerCase() === itemTemplateId
                        );

                        if (existingItem) {
                            throw new Error('You already own this item');
                        }
                    }

                    item.itemGrants.forEach(grant => {
                        const templateId = grant.templateId || grant;
                        athena.items[templateId] = {
                            templateId: grant.templateId || grant,
                            attributes: {
                                max_level_bonus: 0,
                                level: 1,
                                item_seen: false,
                                rnd_sel_cnt: 0,
                                xp: 0,
                                variants: [],
                                favorite: false
                            },
                            quantity: grant.quantity || 1
                        };
                    });
                }

                athena.rvn = (athena.rvn || 0) + 1;
                athena.updated = new Date().toISOString();
                await this.saveProfile(accountId, 'athena', athena);
            }

            const purchaseRecord = {
                purchaseId: itemKey,
                offerId: `v2:/${itemKey}`,
                purchaseDate: new Date().toISOString(),
                freeRefundEligible: true,
                fulfillments: [],
                lootResult: (item.itemGrants || []).map(grant => ({
                    itemType: grant.templateId || grant,
                    itemGuid: grant.templateId || grant,
                    itemProfile: "athena",
                    quantity: grant.quantity || 1
                })),
                totalMtxPaid: itemPrice,
                metadata: {
                    mtx_affiliate: commonCore.stats.attributes.mtx_affiliate || "",
                    mtx_affiliate_id: accountId
                },
                gameContext: ""
            };

            if (!commonCore.stats.attributes.mtx_purchase_history) {
                commonCore.stats.attributes.mtx_purchase_history = {
                    refundsUsed: 0,
                    refundCredits: 3,
                    purchases: []
                };
            }

            commonCore.stats.attributes.mtx_purchase_history.purchases.push(purchaseRecord);

            commonCore.rvn = (commonCore.rvn || 0) + 1;
            commonCore.updated = new Date().toISOString();
            commonCore.commandRevision = (commonCore.commandRevision || 0) + 1;

            await this.saveProfile(accountId, 'common_core', commonCore);

            LoggerService.log('success', `Item purchase processed: ${accountId} bought ${itemKey} for ${itemPrice} V-Bucks`);

            return {
                success: true,
                newBalance: commonCore.items.Currency.quantity,
                purchaseId: purchaseRecord.purchaseId
            };

        } catch (error) {
            LoggerService.log('error', `Process item purchase error: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    static async getUserPurchaseHistory(accountId) {
        const commonCore = await this.getProfile(accountId, 'common_core');
        if (!commonCore) return [];
        return commonCore.stats?.attributes?.mtx_purchase_history?.purchases || [];
    }

    static async processPurchaseRefund(accountId, purchaseId) {
        try {
            const commonCore = await this.getProfile(accountId, 'common_core');
            if (!commonCore) {
                return { success: false, message: 'Profile not found' };
            }

            const purchaseHistory = commonCore.stats?.attributes?.mtx_purchase_history;

            if (!purchaseHistory || !purchaseHistory.purchases) {
                return { success: false, message: 'No purchase history found' };
            }

            const purchaseIndex = purchaseHistory.purchases.findIndex(p => p.purchaseId === purchaseId);
            if (purchaseIndex === -1) {
                return { success: false, message: 'Purchase not found' };
            }

            const purchase = purchaseHistory.purchases[purchaseIndex];

            if (!purchase.freeRefundEligible && purchaseHistory.refundCredits <= 0) {
                return { success: false, message: 'No refund credits available' };
            }

            commonCore.items.Currency.quantity += purchase.totalMtxPaid;

            const athena = await this.getProfile(accountId, 'athena');
            if (athena) {
                for (const loot of purchase.lootResult || []) {
                    delete athena.items[loot.itemGuid];
                }
                athena.rvn = (athena.rvn || 0) + 1;
                athena.updated = new Date().toISOString();
                await this.saveProfile(accountId, 'athena', athena);
            }

            if (!purchase.freeRefundEligible) {
                purchaseHistory.refundCredits--;
            }
            purchaseHistory.refundsUsed++;
            purchaseHistory.purchases.splice(purchaseIndex, 1);

            commonCore.rvn = (commonCore.rvn || 0) + 1;
            commonCore.updated = new Date().toISOString();
            await this.saveProfile(accountId, 'common_core', commonCore);

            return {
                success: true,
                refundAmount: purchase.totalMtxPaid,
                newBalance: commonCore.items.Currency.quantity
            };

        } catch (error) {
            LoggerService.log('error', `Refund error: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    static async getFriends(accountId) {
        const friendsDoc = await Friends.findOne({ accountId }).lean();

        if (!friendsDoc) {
            return {
                friends: [],
                incoming: [],
                outgoing: [],
                suggested: [],
                blocklist: [],
                settings: { acceptInvites: 'public' }
            };
        }

        const list = friendsDoc.list || {};
        return {
            friends: list.accepted || [],
            incoming: list.incoming || [],
            outgoing: list.outgoing || [],
            suggested: [],
            blocklist: list.blocked || [],
            settings: { acceptInvites: 'public' }
        };
    }

    static async saveFriends(accountId, friends) {
        const friendsData = {
            accepted: friends.friends || [],
            incoming: friends.incoming || [],
            outgoing: friends.outgoing || [],
            blocked: friends.blocklist || []
        };

        await Friends.updateOne(
            { accountId },
            { $set: { list: friendsData } },
            { upsert: true }
        );
    }

    static async setFriendData(accountId, friendAccountId, data) {
        const friends = await this.getFriends(accountId);

        const existingFriend = friends.friends.find(f => f.accountId === friendAccountId);
        if (existingFriend) {
            Object.assign(existingFriend, data);
        } else {
            friends.friends.push({
                accountId: friendAccountId,
                groups: [],
                mutual: 0,
                alias: data.alias || '',
                note: data.note || '',
                favorite: data.favorite || false,
                created: data.created || new Date().toISOString()
            });
        }

        await this.saveFriends(accountId, friends);
    }

    static async getFriendData(accountId, friendAccountId) {
        const friends = await this.getFriends(accountId);
        return friends.friends.find(f => f.accountId === friendAccountId) || null;
    }

    static async removeFriend(accountId, friendAccountId) {
        const friends = await this.getFriends(accountId);

        friends.friends = friends.friends.filter(f => f.accountId !== friendAccountId);
        friends.incoming = friends.incoming.filter(id => id !== friendAccountId);
        friends.outgoing = friends.outgoing.filter(id => id !== friendAccountId);

        await this.saveFriends(accountId, friends);
        return true;
    }

    static async blockFriend(accountId, friendAccountId) {
        const friends = await this.getFriends(accountId);

        friends.friends = friends.friends.filter(f => f.accountId !== friendAccountId);
        friends.incoming = friends.incoming.filter(id => id !== friendAccountId);
        friends.outgoing = friends.outgoing.filter(id => id !== friendAccountId);

        if (!friends.blocklist.includes(friendAccountId)) {
            friends.blocklist.push(friendAccountId);
        }

        await this.saveFriends(accountId, friends);
        return true;
    }

    static async setFriendAlias(accountId, friendAccountId, alias) {
        const friends = await this.getFriends(accountId);

        const friend = friends.friends.find(f => f.accountId === friendAccountId);
        if (friend) {
            friend.alias = alias;
            await this.saveFriends(accountId, friends);
            return true;
        }

        return false;
    }


    static async getPrivacy(accountId) {
        const profile = await Profile.findOne({ accountId }).lean();
        if (!profile || !profile.profiles || !profile.profiles.privacy) {
            return {
                accountId,
                optOutOfPublicLeaderboards: false,
                acceptInvites: 'public',
                showInActiveGamesLists: 'public'
            };
        }
        return profile.profiles.privacy;
    }

    static async setPrivacy(accountId, privacy) {
        await Profile.updateOne(
            { accountId },
            { $set: { 'profiles.privacy': privacy } },
            { upsert: true }
        );
        return true;
    }

    static async getUserSettings(accountId) {
        const profile = await Profile.findOne({ accountId }).lean();
        if (!profile || !profile.profiles || !profile.profiles.settings) {
            return {
                language: 'en',
                region: 'EU',
                privacy: {
                    showOnline: true,
                    allowFriendRequests: true,
                    joinInProgress: true
                }
            };
        }
        return profile.profiles.settings;
    }

    static async saveUserSettings(accountId, settings) {
        await Profile.updateOne(
            { accountId },
            { $set: { 'profiles.settings': settings } },
            { upsert: true }
        );

        const updates = {};
        if (settings.language) {
            updates.preferredLanguage = settings.language;
        }
        if (settings.region) {
            updates.country = settings.region;
        }
        if (settings.privacy) {
            if (settings.privacy.ageGroup !== undefined) {
                updates.ageGroup = settings.privacy.ageGroup;
            }
            if (settings.privacy.minorStatus !== undefined) {
                updates.minorStatus = settings.privacy.minorStatus;
            }
            if (settings.privacy.cabinedMode !== undefined) {
                updates.cabinedMode = settings.privacy.cabinedMode;
            }
        }

        if (Object.keys(updates).length > 0) {
            await User.updateOne({ accountId }, { $set: updates });
        }

        return true;
    }

    static async getSeasonData(accountId) {
        const profile = await Profile.findOne({ accountId }).lean();
        if (!profile || !profile.profiles || !profile.profiles.season) {
            return null;
        }
        return profile.profiles.season;
    }

    static async searchUsers(query, limit = 10) {
        const searchLower = query.toLowerCase();
        const users = await User.find({
            displayName_lower: { $regex: searchLower, $options: 'i' }
        }).limit(limit).lean();

        return users.map(u => ({
            accountId: u.accountId,
            displayName: u.displayName
        }));
    }

    static getClientSettings(accountId, buildId) {
        const settingsPath = path.join(this.playersPath, accountId, 'CloudStorage', 'ClientSettings.Sav');

        if (!fs.existsSync(settingsPath)) {
            return null;
        }

        const content = fs.readFileSync(settingsPath, 'latin1');
        const stats = fs.statSync(settingsPath);

        return {
            uniqueFilename: 'ClientSettings.Sav',
            filename: 'ClientSettings.Sav',
            hash: require('crypto').createHash('sha1').update(content).digest('hex'),
            hash256: require('crypto').createHash('sha256').update(content).digest('hex'),
            length: Buffer.byteLength(content),
            contentType: 'application/octet-stream',
            uploaded: stats.mtime,
            storageType: 'S3',
            storageIds: {},
            accountId: accountId,
            doNotCache: true
        };
    }

    static getClientSettingsFile(accountId, buildId) {
        const settingsPath = path.join(this.playersPath, accountId, 'CloudStorage', 'ClientSettings.Sav');
        return settingsPath;
    }

    static async saveClientSettings(accountId, buildId, content) {
        const playerPath = path.join(this.playersPath, accountId);
        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }

        const cloudStoragePath = path.join(playerPath, 'CloudStorage');
        if (!fs.existsSync(cloudStoragePath)) {
            fs.mkdirSync(cloudStoragePath, { recursive: true });
        }

        const settingsPath = path.join(cloudStoragePath, 'ClientSettings.Sav');
        await fsPromises.writeFile(settingsPath, content);
        return true;
    }

    static deleteClientSettings(accountId, buildId) {
        const settingsPath = path.join(this.playersPath, accountId, 'CloudStorage', 'ClientSettings.Sav');
        if (fs.existsSync(settingsPath)) {
            fs.unlinkSync(settingsPath);
            return true;
        }
        return false;
    }

    static getClientsSync() {
        //LoggerService.log('warning', 'getClientsSync called - use async getAllAccounts instead');
        return [];
    }

    static async getClients() {
        return await this.getAllAccounts();
    }

    static async saveClients(clients) {
        // This doesn't make sense for MongoDB
        // Each client should be updated individually
        //LoggerService.log('warning', 'saveClients called - this is a no-op for MongoDB');
    }

    static saveClientsSync(clients) {
        //LoggerService.log('warning', 'saveClientsSync called - this is a no-op for MongoDB');
    }

    // ============================================
    // AUDIT LOGS
    // ============================================

    static AuditLogModel = null;

    static getAuditLogModel() {
        if (!this.AuditLogModel) {
            this.AuditLogModel = require('./mongodb/audit-log');
        }
        return this.AuditLogModel;
    }

    static async getAuditLogs() {
        const AuditLog = this.getAuditLogModel();
        const logs = await AuditLog.find({}).sort({ timestamp: -1 }).lean();
        return { logs, lastUpdated: new Date().toISOString() };
    }

    static async saveAuditLogs(auditData) {
        // In MongoDB, logs are saved individually, this is mainly for compatibility
        // We don't need to save all logs at once
    }

    static async addAuditLog(logEntry) {
        const AuditLog = this.getAuditLogModel();
        const entry = { ...logEntry, timestamp: new Date(logEntry.timestamp) };
        await AuditLog.create(entry);
        return logEntry;
    }

    // ============================================
    // TICKETS
    // ============================================

    static TicketModel = null;

    static getTicketModel() {
        if (!this.TicketModel) {
            this.TicketModel = require('./mongodb/tickets');
        }
        return this.TicketModel;
    }

    static async getTickets() {
        const Ticket = this.getTicketModel();
        const ticketsArray = await Ticket.find({}).lean();
        const tickets = {};
        ticketsArray.forEach(t => { tickets[t.ticketId] = t; });
        return { tickets, lastUpdated: new Date().toISOString() };
    }

    static async saveTickets(ticketsData) {
        // In MongoDB, tickets are saved individually
    }

    static async getTicket(ticketId) {
        const Ticket = this.getTicketModel();
        return await Ticket.findOne({ ticketId }).lean();
    }

    static async createTicket(ticket) {
        const Ticket = this.getTicketModel();
        await Ticket.create(ticket);
        return ticket;
    }

    static async updateTicket(ticketId, updates) {
        const Ticket = this.getTicketModel();
        const result = await Ticket.findOneAndUpdate(
            { ticketId },
            { $set: updates },
            { new: true }
        ).lean();
        return result;
    }

    static async deleteTicket(ticketId) {
        const Ticket = this.getTicketModel();
        const result = await Ticket.deleteOne({ ticketId });
        return result.deletedCount > 0;
    }

    // ============================================
    // CREATOR CODES
    // ============================================

    static CreatorCodeModel = null;
    static CreatorCodeRequestModel = null;

    static getCreatorCodeModels() {
        if (!this.CreatorCodeModel) {
            const models = require('./mongodb/creator-codes');
            this.CreatorCodeModel = models.CreatorCode;
            this.CreatorCodeRequestModel = models.CreatorCodeRequest;
        }
        return { CreatorCode: this.CreatorCodeModel, CreatorCodeRequest: this.CreatorCodeRequestModel };
    }

    static async getCreatorCodesData() {
        const { CreatorCode, CreatorCodeRequest } = this.getCreatorCodeModels();
        const codesArray = await CreatorCode.find({}).lean();
        const requestsArray = await CreatorCodeRequest.find({}).lean();

        const codes = {};
        codesArray.forEach(c => { codes[c.code.toLowerCase()] = c; });

        const requests = {};
        requestsArray.forEach(r => { requests[r.requestId] = r; });

        return { codes, requests, lastUpdated: new Date().toISOString() };
    }

    static async saveCreatorCodesData(codesData) {
        // In MongoDB, data is saved individually
    }

    static async getCreatorCode(code) {
        const { CreatorCode } = this.getCreatorCodeModels();
        return await CreatorCode.findOne({ code: code.toLowerCase() }).lean();
    }

    static async createCreatorCode(codeData) {
        const { CreatorCode } = this.getCreatorCodeModels();
        await CreatorCode.create(codeData);
        return codeData;
    }

    static async updateCreatorCode(code, updates) {
        const { CreatorCode } = this.getCreatorCodeModels();
        const result = await CreatorCode.findOneAndUpdate(
            { code: code.toLowerCase() },
            { $set: updates },
            { new: true }
        ).lean();
        return result;
    }

    static async deleteCreatorCode(code) {
        const { CreatorCode } = this.getCreatorCodeModels();
        const result = await CreatorCode.deleteOne({ code: code.toLowerCase() });
        return result.deletedCount > 0;
    }

    static async getCreatorCodeRequest(requestId) {
        const { CreatorCodeRequest } = this.getCreatorCodeModels();
        return await CreatorCodeRequest.findOne({ requestId }).lean();
    }

    static async createCreatorCodeRequest(request) {
        const { CreatorCodeRequest } = this.getCreatorCodeModels();
        await CreatorCodeRequest.create(request);
        return request;
    }

    static async updateCreatorCodeRequest(requestId, updates) {
        const { CreatorCodeRequest } = this.getCreatorCodeModels();
        const result = await CreatorCodeRequest.findOneAndUpdate(
            { requestId },
            { $set: updates },
            { new: true }
        ).lean();
        return result;
    }
}

module.exports = MongoDatabase;