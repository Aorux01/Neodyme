const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../../service/logger/LoggerService');

class JsonDatabase {
    static dataPath = path.join(__dirname, '../../../data');
    static clientsFile = path.join(this.dataPath, 'clients.json');
    static playersPath = path.join(this.dataPath, 'players');

    // File locks for race condition prevention
    static fileLocks = new Map();
    static lockTimeout = 5000;

    // Account lockout settings
    static MAX_FAILED_ATTEMPTS = 5;
    static LOCKOUT_DURATION_MS = 15 * 60 * 1000;
    static LOCKOUT_MULTIPLIER = 2;

    static initialize() {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }

        if (!fs.existsSync(this.playersPath)) {
            fs.mkdirSync(this.playersPath, { recursive: true });
        }

        if (!fs.existsSync(this.clientsFile)) {
            this.atomicWriteFile(this.clientsFile, JSON.stringify([], null, 2));
        }

        LoggerService.log('info', 'JSON Database initialized');
    }

    static async acquireLock(filePath) {
        const startTime = Date.now();
        while (this.fileLocks.get(filePath)) {
            if (Date.now() - startTime > this.lockTimeout) {
                throw new Error(`Lock timeout for file: ${filePath}`);
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.fileLocks.set(filePath, true);
    }

    static releaseLock(filePath) {
        this.fileLocks.delete(filePath);
    }

    static atomicWriteFile(filePath, content) {
        const tempPath = filePath + '.tmp.' + Date.now();
        try {
            fs.writeFileSync(tempPath, content, 'utf8');
            fs.renameSync(tempPath, filePath);
        } catch (error) {
            // Clean up temp file if it exists
            if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch (e) {}
            }
            throw error;
        }
    }

    /**
     * Safe file read with lock
     * @param {string} filePath - Path to the file
     * @returns {Promise<string>}
     */
    static async safeReadFile(filePath) {
        await this.acquireLock(filePath);
        try {
            return fs.readFileSync(filePath, 'utf8');
        } finally {
            this.releaseLock(filePath);
        }
    }

    /**
     * Safe file write with lock
     * @param {string} filePath - Path to the file
     * @param {string} content - Content to write
     */
    static async safeWriteFile(filePath, content) {
        await this.acquireLock(filePath);
        try {
            this.atomicWriteFile(filePath, content);
        } finally {
            this.releaseLock(filePath);
        }
    }

    /**
     * Normalize email to lowercase for consistent storage
     * @param {string} email - The email to normalize
     * @returns {string} - Normalized email
     */
    static normalizeEmail(email) {
        if (!email || typeof email !== 'string') return '';
        return email.trim().toLowerCase();
    }

    static generatePurchaseId() {
        return 'purchase_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    static async getClients() {
        const data = await this.safeReadFile(this.clientsFile);
        return JSON.parse(data);
    }

    static getClientsSync() {
        const data = fs.readFileSync(this.clientsFile, 'utf8');
        return JSON.parse(data);
    }

    static async saveClients(clients) {
        await this.safeWriteFile(this.clientsFile, JSON.stringify(clients, null, 2));
    }

    static saveClientsSync(clients) {
        this.atomicWriteFile(this.clientsFile, JSON.stringify(clients, null, 2));
    }

    static async getAccount(accountId) {
        const clients = await this.getClients();
        return clients.find(c => c.accountId === accountId);
    }

    static async getAllAccounts() {
        const clients = await this.getClients();
        return clients;
    }

    static getPublicAccountsByDisplayNameSubstr(displayNameSubstr) {
        const MAX_RESULTS = 20;
        const MIN_RESULTS = 2;

        if (typeof displayNameSubstr !== 'string') {
            return [];
        }

        const clients = this.getClientsSync();

        const searchLower = displayNameSubstr.toLowerCase();

        const matchingAccounts = clients.filter(c =>
            c.displayName &&
            typeof c.displayName === 'string' &&
            c.displayName.toLowerCase().includes(searchLower)
        );

        const formattedResponse = matchingAccounts
            .slice(0, MAX_RESULTS)
            .map(account => ({
                id: account.accountId,
                displayName: account.displayName,
                externalAuths: {}
            }));

        if (formattedResponse.length === 1) {
            formattedResponse.push(formattedResponse[0]);
        }

        return formattedResponse;
    }

    static getAccountByExactDisplayName(displayName) {
        if (typeof displayName !== 'string') {
            return {};
        }

        const clients = this.getClientsSync();
        const searchLower = displayName.toLowerCase();

        const exactMatch = clients.find(c =>
            c.displayName &&
            typeof c.displayName === 'string' &&
            c.displayName.toLowerCase() === searchLower
        );

        if (exactMatch) {
            return {
                id: exactMatch.accountId,
                displayName: exactMatch.displayName,
                externalAuths: {}
            };
        }

        return {};
    }

    static AccountIsBanned(accountId) {
        const account = this.getAccount(accountId);
        if (!account) return false;

        if (!account.banned) return false;

        if (account.banExpires && new Date(account.banExpires) <= new Date()) {
            this.unbanAccount(accountId);
            return false;
        }

        return true;
    }

    static getBanInfo(accountId) {
        const clients = this.getClientsSync();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) {
            return { banned: false };
        }

        if (!account.banned) {
            return { banned: false };
        }

        if (account.banExpires && new Date(account.banExpires) <= new Date()) {
            this.unbanAccount(accountId);
            return { banned: false };
        }

        return {
            banned: true,
            banExpires: account.banExpires || null,
            banReasons: account.banReasons || []
        };
    }

    static async banAccount(accountId, reasons = [], expiresAt = null) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        account.banned = true;
        account.banReasons = reasons;
        account.banExpires = expiresAt;

        await this.saveClients(clients);
        LoggerService.log('warning', `Account banned: ${accountId}`);
        return true;
    }

    static async unbanAccount(accountId) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        account.banned = false;
        delete account.banReasons;
        delete account.banExpires;

        await this.saveClients(clients);
        LoggerService.log('info', `Account unbanned: ${accountId}`);
        return true;
    }

    // Account lockout methods
    static async isAccountLocked(accountId) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return { locked: false };

        if (!account.lockedUntil) return { locked: false };

        const lockedUntil = new Date(account.lockedUntil);
        if (lockedUntil <= new Date()) {
            // Lock has expired, reset
            await this.resetFailedAttempts(accountId);
            return { locked: false };
        }

        return {
            locked: true,
            lockedUntil: account.lockedUntil,
            remainingMs: lockedUntil.getTime() - Date.now()
        };
    }

    static async recordFailedLoginAttempt(accountId) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return null;

        account.failedLoginAttempts = (account.failedLoginAttempts || 0) + 1;
        account.lastFailedLogin = new Date().toISOString();

        // Check if should be locked
        if (account.failedLoginAttempts >= this.MAX_FAILED_ATTEMPTS) {
            // Calculate lockout duration with exponential backoff
            const lockoutCount = account.lockoutCount || 0;
            const multiplier = Math.pow(this.LOCKOUT_MULTIPLIER, lockoutCount);
            const lockoutDuration = this.LOCKOUT_DURATION_MS * multiplier;

            account.lockedUntil = new Date(Date.now() + lockoutDuration).toISOString();
            account.lockoutCount = lockoutCount + 1;

            LoggerService.log('warning', `Account locked due to failed attempts: ${accountId} for ${lockoutDuration / 1000}s`);
        }

        await this.saveClients(clients);

        return {
            failedAttempts: account.failedLoginAttempts,
            maxAttempts: this.MAX_FAILED_ATTEMPTS,
            locked: account.failedLoginAttempts >= this.MAX_FAILED_ATTEMPTS,
            lockedUntil: account.lockedUntil
        };
    }

    static async resetFailedAttempts(accountId) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        account.failedLoginAttempts = 0;
        delete account.lockedUntil;
        delete account.lastFailedLogin;
        // Keep lockoutCount for exponential backoff history

        await this.saveClients(clients);
        return true;
    }

    static async getAccountByEmail(email) {
        const normalizedEmail = this.normalizeEmail(email);
        const clients = await this.getClients();
        return clients.find(c => this.normalizeEmail(c.email) === normalizedEmail);
    }

    static async getAccountByDisplayName(displayName) {
        const clients = await this.getClients();
        return clients.find(c => c.displayName.toLowerCase() === displayName.toLowerCase());
    }

    static async createAccount(email, password, displayName) {
        const normalizedEmail = this.normalizeEmail(email);
        const clients = await this.getClients();

        if (clients.find(c => this.normalizeEmail(c.email) === normalizedEmail)) {
            throw new Error('Email already exists');
        }

        if (clients.find(c => c.displayName.toLowerCase() === displayName.toLowerCase())) {
            throw new Error('Display name already exists');
        }

        const accountId = uuidv4().replace(/-/g, '');
        const hashedPassword = await bcrypt.hash(password, 10);

        const newAccount = {
            accountId,
            email: normalizedEmail, // Store normalized email
            password: hashedPassword,
            displayName,
            country: 'US',
            preferredLanguage: 'en',
            created: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
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
        };

        clients.push(newAccount);
        await this.saveClients(clients);

        const playerPath = path.join(this.playersPath, accountId);
        const templatePath = path.join(__dirname, '../../../templates/json');

        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }

        try {
            fs.cpSync(templatePath, playerPath, { recursive: true });

            this.replaceAccountIdInJsonFiles(playerPath, accountId);

            LoggerService.log('success', `Template files copied and configured for ${displayName}`);
        } catch (error) {
            LoggerService.log('error', `Failed to copy template files: ${error.message}`);
        }

        LoggerService.log('success', `Account created: ${displayName} (${accountId})`);
        return newAccount;
    }

    static replaceAccountIdInJsonFiles(dirPath, accountId) {
        const files = fs.readdirSync(dirPath);

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                this.replaceAccountIdInJsonFiles(filePath, accountId);
            } else if (file.endsWith('.json')) {
                try {
                    let content = fs.readFileSync(filePath, 'utf8');
                    const originalContent = content;

                    content = content.replace(/"accountId"\s*:\s*"Neodyme"/g, `"accountId": "${accountId}"`);

                    if (content !== originalContent) {
                        this.atomicWriteFile(filePath, content);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to update ${file}: ${error.message}`);
                }
            }
        }
    }

    static async setClientType(accountId, clientType) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        if (typeof clientType !== 'number' || clientType < 0 || clientType > 4) {
            return false;
        }

        account.clientType = clientType;
        await this.saveClients(clients);
        return true;
    }

    static async updateLastLogin(accountId) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        account.lastLogin = new Date().toISOString();

        await this.saveClients(clients);
        return true;
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
        await this.safeWriteFile(settingsPath, content);
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

    static async getVbucksBalance(accountId) {
        const profilePath = path.join(this.playersPath, accountId, 'common_core.json');
        if (!fs.existsSync(profilePath)) {
            return 0;
        }

        const data = await this.safeReadFile(profilePath);
        const profile = JSON.parse(data);
        const currency = Object.values(profile.items || {}).find(
            item => item.templateId === 'Currency:MtxPurchased'
        );

        return currency ? currency.quantity : 0;
    }

    static async setVbucksBalance(accountId, newBalance) {
        const profilePath = path.join(this.playersPath, accountId, 'common_core.json');
        if (!fs.existsSync(profilePath)) {
            return false;
        }

        await this.acquireLock(profilePath);
        try {
            const data = fs.readFileSync(profilePath, 'utf8');
            const profile = JSON.parse(data);
            let currency = Object.values(profile.items || {}).find(
                item => item.templateId === 'Currency:MtxPurchased'
            );

            if (currency) {
                currency.quantity = newBalance;
            }

            this.atomicWriteFile(profilePath, JSON.stringify(profile, null, 2));
            return true;
        } finally {
            this.releaseLock(profilePath);
        }
    }

    static async processVbucksPurchase(accountId, vbucksAmount, price, paymentMethod) {
        const commonCorePath = path.join(this.playersPath, accountId, 'common_core.json');

        await this.acquireLock(commonCorePath);
        try {
            if (!fs.existsSync(commonCorePath)) {
                throw new Error('User profile not found');
            }

            const commonCore = JSON.parse(fs.readFileSync(commonCorePath, 'utf8'));

            if (!commonCore.items.Currency) {
                commonCore.items.Currency = {
                    templateId: "Currency:MtxPurchased",
                    attributes: {
                        platform: "EpicPC"
                    },
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

            this.atomicWriteFile(commonCorePath, JSON.stringify(commonCore, null, 2));

            LoggerService.log('success', `V-Bucks purchase processed: ${accountId} bought ${vbucksAmount} V-Bucks for $${price}`);

            return {
                success: true,
                newBalance: commonCore.items.Currency.quantity,
                purchaseId: purchaseId
            };

        } catch (error) {
            LoggerService.log('error', `Process V-Bucks purchase error: ${error.message}`);
            return { success: false, message: error.message };
        } finally {
            this.releaseLock(commonCorePath);
        }
    }

    static async processItemPurchase(accountId, itemKey, item) {
        const commonCorePath = path.join(this.playersPath, accountId, 'common_core.json');
        const athenaPath = path.join(this.playersPath, accountId, 'athena.json');

        // Lock both files
        await this.acquireLock(commonCorePath);
        await this.acquireLock(athenaPath);

        try {
            if (!fs.existsSync(commonCorePath)) {
                throw new Error('User profile not found');
            }

            const commonCore = JSON.parse(fs.readFileSync(commonCorePath, 'utf8'));

            if (!commonCore.items.Currency) {
                throw new Error('No V-Bucks currency found');
            }

            const itemPrice = item.price || 0;

            if (commonCore.items.Currency.quantity < itemPrice) {
                throw new Error('Insufficient V-Bucks');
            }

            commonCore.items.Currency.quantity -= itemPrice;

            if (fs.existsSync(athenaPath)) {
                const athena = JSON.parse(fs.readFileSync(athenaPath, 'utf8'));

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
                this.atomicWriteFile(athenaPath, JSON.stringify(athena, null, 2));
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

            this.atomicWriteFile(commonCorePath, JSON.stringify(commonCore, null, 2));

            LoggerService.log('success', `Item purchase processed: ${accountId} bought ${itemKey} for ${itemPrice} V-Bucks`);

            return {
                success: true,
                newBalance: commonCore.items.Currency.quantity,
                purchaseId: purchaseRecord.purchaseId
            };

        } catch (error) {
            LoggerService.log('error', `Process item purchase error: ${error.message}`);
            return { success: false, message: error.message };
        } finally {
            this.releaseLock(athenaPath);
            this.releaseLock(commonCorePath);
        }
    }

    static async getUserPurchaseHistory(accountId) {
        const commonCorePath = path.join(this.playersPath, accountId, 'common_core.json');
        if (!fs.existsSync(commonCorePath)) {
            return [];
        }

        const data = await this.safeReadFile(commonCorePath);
        const commonCore = JSON.parse(data);
        return commonCore.stats?.attributes?.mtx_purchase_history?.purchases || [];
    }

    static async processPurchaseRefund(accountId, purchaseId) {
        const commonCorePath = path.join(this.playersPath, accountId, 'common_core.json');
        const athenaPath = path.join(this.playersPath, accountId, 'athena.json');

        await this.acquireLock(commonCorePath);
        await this.acquireLock(athenaPath);

        try {
            if (!fs.existsSync(commonCorePath)) {
                return { success: false, message: 'Profile not found' };
            }

            const commonCore = JSON.parse(fs.readFileSync(commonCorePath, 'utf8'));
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

            // Refund V-Bucks
            commonCore.items.Currency.quantity += purchase.totalMtxPaid;

            // Remove items from athena
            if (fs.existsSync(athenaPath)) {
                const athena = JSON.parse(fs.readFileSync(athenaPath, 'utf8'));
                for (const loot of purchase.lootResult || []) {
                    delete athena.items[loot.itemGuid];
                }
                athena.rvn = (athena.rvn || 0) + 1;
                athena.updated = new Date().toISOString();
                this.atomicWriteFile(athenaPath, JSON.stringify(athena, null, 2));
            }

            // Update purchase history
            if (!purchase.freeRefundEligible) {
                purchaseHistory.refundCredits--;
            }
            purchaseHistory.refundsUsed++;
            purchaseHistory.purchases.splice(purchaseIndex, 1);

            commonCore.rvn = (commonCore.rvn || 0) + 1;
            commonCore.updated = new Date().toISOString();
            this.atomicWriteFile(commonCorePath, JSON.stringify(commonCore, null, 2));

            return {
                success: true,
                refundAmount: purchase.totalMtxPaid,
                newBalance: commonCore.items.Currency.quantity
            };

        } catch (error) {
            LoggerService.log('error', `Refund error: ${error.message}`);
            return { success: false, message: error.message };
        } finally {
            this.releaseLock(athenaPath);
            this.releaseLock(commonCorePath);
        }
    }

    static getPrivacy(accountId) {
        const privacyPath = path.join(this.playersPath, accountId, 'privacy.json');
        if (!fs.existsSync(privacyPath)) {
            return {
                accountId,
                optOutOfPublicLeaderboards: false,
                acceptInvites: 'public',
                showInActiveGamesLists: 'public'
            };
        }

        return JSON.parse(fs.readFileSync(privacyPath, 'utf8'));
    }

    static async setPrivacy(accountId, privacy) {
        const playerPath = path.join(this.playersPath, accountId);
        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }

        const privacyPath = path.join(playerPath, 'privacy.json');
        await this.safeWriteFile(privacyPath, JSON.stringify(privacy, null, 2));
        return true;
    }

    static async getProfile(accountId, profileId) {
        const profilePath = path.join(this.playersPath, accountId, `${profileId}.json`);
        if (!fs.existsSync(profilePath)) {
            return null;
        }

        const data = await this.safeReadFile(profilePath);
        return JSON.parse(data);
    }

    static async saveProfile(accountId, profileId, profileData) {
        const playerPath = path.join(this.playersPath, accountId);
        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }

        const profilePath = path.join(playerPath, `${profileId}.json`);
        await this.safeWriteFile(profilePath, JSON.stringify(profileData, null, 2));
        return true;
    }

    static async updateProfileStats(accountId, profileId, stats) {
        const profile = await this.getProfile(accountId, profileId);
        if (!profile) return false;

        profile.stats = { ...profile.stats, ...stats };
        await this.saveProfile(accountId, profileId, profile);
        return true;
    }

    static async addItemToProfile(accountId, profileId, itemId, itemData) {
        const profile = await this.getProfile(accountId, profileId);
        if (!profile) return false;

        if (!profile.items) profile.items = {};
        profile.items[itemId] = itemData;

        await this.saveProfile(accountId, profileId, profile);
        return true;
    }

    static async removeItemFromProfile(accountId, profileId, itemId) {
        const profile = await this.getProfile(accountId, profileId);
        if (!profile) return false;

        if (profile.items && profile.items[itemId]) {
            delete profile.items[itemId];
            await this.saveProfile(accountId, profileId, profile);
            return true;
        }

        return false;
    }

    static async updateItemInProfile(accountId, profileId, itemId, updates) {
        const profile = await this.getProfile(accountId, profileId);
        if (!profile || !profile.items || !profile.items[itemId]) {
            return false;
        }

        profile.items[itemId] = { ...profile.items[itemId], ...updates };
        await this.saveProfile(accountId, profileId, profile);
        return true;
    }

    static generateItemId() {
        return uuidv4().replace(/-/g, '');
    }

    static async getFriends(accountId) {
        const playerDir = path.join(this.playersPath, accountId);
        const friendsListPath = path.join(playerDir, 'friendslist.json');

        if (!fs.existsSync(friendsListPath)) {
            return {
                friends: [],
                incoming: [],
                outgoing: [],
                suggested: [],
                blocklist: [],
                settings: { acceptInvites: 'public' }
            };
        }

        const data = await this.safeReadFile(friendsListPath);
        const friendsData = JSON.parse(data);

        return {
            friends: friendsData.friends || [],
            incoming: friendsData.incoming || [],
            outgoing: friendsData.outgoing || [],
            suggested: friendsData.suggested || [],
            blocklist: friendsData.blocklist || [],
            settings: friendsData.settings || { acceptInvites: 'public' }
        };
    }

    static async saveFriends(accountId, friends) {
        const playerDir = path.join(this.playersPath, accountId);
        if (!fs.existsSync(playerDir)) {
            fs.mkdirSync(playerDir, { recursive: true });
        }

        const friendsListPath = path.join(playerDir, 'friendslist.json');

        const friendsData = {
            friends: friends.friends || [],
            incoming: friends.incoming || [],
            outgoing: friends.outgoing || [],
            suggested: friends.suggested || [],
            blocklist: friends.blocklist || [],
            settings: friends.settings || { acceptInvites: 'public' }
        };

        await this.safeWriteFile(friendsListPath, JSON.stringify(friendsData, null, 2));
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

    static async getSeasonData(accountId) {
        const seasonPath = path.join(this.playersPath, accountId, 'season.json');
        if (!fs.existsSync(seasonPath)) {
            return null;
        }

        const data = await this.safeReadFile(seasonPath);
        return JSON.parse(data);
    }

    static async getAthenaProfile(accountId, profileId) {
        const profilePath = path.join(this.playersPath, accountId, 'Athena', `${profileId}.json`);
        if (!fs.existsSync(profilePath)) {
            return null;
        }

        const data = await this.safeReadFile(profilePath);
        return JSON.parse(data);
    }

    static async saveAthenaProfile(accountId, profileId, profileData) {
        const athenaPath = path.join(this.playersPath, accountId, 'Athena', `${profileId}.json`);
        if (!fs.existsSync(path.dirname(athenaPath))) {
            fs.mkdirSync(path.dirname(athenaPath), { recursive: true });
        }
        await this.safeWriteFile(athenaPath, JSON.stringify(profileData, null, 2));
        return true;
    }

    /**
     * Check if user owns a specific item
     * @param {string} accountId - Account ID
     * @param {string} templateId - Item template ID
     * @returns {Promise<boolean>}
     */
    static async userOwnsItem(accountId, templateId) {
        const athenaPath = path.join(this.playersPath, accountId, 'athena.json');
        if (!fs.existsSync(athenaPath)) {
            return false;
        }

        const data = await this.safeReadFile(athenaPath);
        const athena = JSON.parse(data);

        const normalizedTemplateId = templateId.toLowerCase();
        return Object.values(athena.items || {}).some(
            item => item.templateId && item.templateId.toLowerCase() === normalizedTemplateId
        );
    }
}

module.exports = JsonDatabase;
