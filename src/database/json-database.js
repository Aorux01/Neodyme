const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');

class JsonDatabase {
    static dataPath = path.join(__dirname, '../../data');
    static clientsFile = path.join(this.dataPath, 'clients.json');
    static playersPath = path.join(this.dataPath, 'players');
    static auditLogFile = path.join(this.dataPath, 'audit-log.json');
    
    static maxAuditLogEntries = 10000;

    static fileLocks = new Map();
    static lockTimeout = 5000;

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
            if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch (e) {}
            }
            throw error;
        }
    }

    static async safeReadFile(filePath) {
        await this.acquireLock(filePath);
        try {
            return await fsPromises.readFile(filePath, 'utf8');
        } finally {
            this.releaseLock(filePath);
        }
    }

    static async safeWriteFile(filePath, content) {
        await this.acquireLock(filePath);
        try {
            await this.atomicWriteFileAsync(filePath, content);
        } finally {
            this.releaseLock(filePath);
        }
    }

    static async atomicWriteFileAsync(filePath, content) {
        const tempPath = filePath + '.tmp.' + Date.now();
        try {
            await fsPromises.writeFile(tempPath, content, 'utf8');
            await fsPromises.rename(tempPath, filePath);
        } catch (error) {
            try { await fsPromises.unlink(tempPath); } catch (e) {}
            throw error;
        }
    }

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

        if (!account.ban || !account.ban.banned) return false;

        if (account.ban.banExpires && new Date(account.ban.banExpires) <= new Date()) {
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

        if (!account.ban || !account.ban.banned) {
            return { banned: false };
        }

        if (account.ban.banExpires && new Date(account.ban.banExpires) <= new Date()) {
            this.unbanAccount(accountId);
            return { banned: false };
        }

        return {
            banned: true,
            banExpires: account.ban.banExpires || null,
            banReasons: account.ban.banReasons || []
        };
    }

    static async banAccount(accountId, reasons = [], expiresAt = null) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        account.ban = {
            banned: true,
            banReasons: reasons,
            banExpires: expiresAt
        };

        await this.saveClients(clients);
        LoggerService.log('warning', `Account banned: ${accountId}`);
        return true;
    }

    static async unbanAccount(accountId) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        account.ban = {
            banned: false,
            banReasons: [],
            banExpires: null
        };

        await this.saveClients(clients);
        LoggerService.log('info', `Account unbanned: ${accountId}`);
        return true;
    }

    static async isAccountLocked(accountId) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return { locked: false };

        if (!account.lockedUntil) return { locked: false };

        const lockedUntil = new Date(account.lockedUntil);
        if (lockedUntil <= new Date()) {
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

        if (account.failedLoginAttempts >= this.MAX_FAILED_ATTEMPTS) {
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

    static async createAccount(email, password, displayName) {
        const normalizedEmail = this.normalizeEmail(email);
        const clients = await this.getClients();

        if (clients.find(c => this.normalizeEmail(c.email) === normalizedEmail)) {
            throw new Error('Email already exists');
        }

        if (clients.find(c => c.displayName.toLowerCase() === displayName.toLowerCase())) {
            throw new Error('Display name already exists');
        }

        this.validatePasswordStrength(password);

        const accountId = uuidv4().replace(/-/g, '');
        const workFactor = ConfigManager.get('bcryptWorkFactor', 12);
        const hashedPassword = await bcrypt.hash(password, workFactor);

        const newAccount = {
            accountId,
            email: normalizedEmail,
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
        const templatePath = path.join(__dirname, '../../template');

        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }

        try {
            if (fs.existsSync(templatePath)) {
                fs.cpSync(templatePath, playerPath, { recursive: true });
                this.replaceAccountIdInJsonFiles(playerPath, accountId);
                LoggerService.log('success', `Template files copied and configured for ${displayName}`);
            } else {
                LoggerService.log('error', `Template directory not found at ${templatePath}`);
            }
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

    static async updateAccountRole(accountId, role) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        const clientType = typeof role === 'number' ? role : this.getRoleLevel(role);

        if (clientType < 0 || clientType > 4) {
            return false;
        }

        account.clientType = clientType;
        await this.saveClients(clients);
        LoggerService.log('info', `Account role updated: ${accountId} -> ${this.getRoleName(clientType)}`);
        return true;
    }

    static async setBanStatus(accountId, banned, reason = null) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (!account) return false;

        if (banned) {
            account.banned = true;
            account.banReasons = reason ? [reason] : [];
            account.banExpires = null;
            LoggerService.log('warning', `Account banned: ${accountId}${reason ? ' - ' + reason : ''}`);
        } else {
            account.banned = false;
            delete account.banReasons;
            delete account.banExpires;
            LoggerService.log('info', `Account unbanned: ${accountId}`);
        }

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

    static async addVbucks(accountId, amount) {
        if (!amount || amount <= 0) return { success: false, message: 'Invalid amount' };

        const profilePath = path.join(this.playersPath, accountId, 'common_core.json');
        if (!fs.existsSync(profilePath)) {
            return { success: false, message: 'Profile not found' };
        }

        await this.acquireLock(profilePath);
        try {
            const data = fs.readFileSync(profilePath, 'utf8');
            const profile = JSON.parse(data);

            let currencyKey = Object.keys(profile.items || {}).find(
                key => profile.items[key].templateId === 'Currency:MtxPurchased'
            );

            if (!currencyKey) {
                currencyKey = 'Currency';
                profile.items = profile.items || {};
                profile.items[currencyKey] = {
                    templateId: 'Currency:MtxPurchased',
                    attributes: { platform: 'EpicPC' },
                    quantity: 0
                };
            }

            profile.items[currencyKey].quantity += amount;
            profile.rvn = (profile.rvn || 0) + 1;
            profile.updated = new Date().toISOString();

            this.atomicWriteFile(profilePath, JSON.stringify(profile, null, 2));

            LoggerService.log('info', `Added ${amount} V-Bucks to account ${accountId}`);

            return {
                success: true,
                newBalance: profile.items[currencyKey].quantity,
                added: amount
            };
        } catch (error) {
            LoggerService.log('error', `Add V-Bucks error: ${error.message}`);
            return { success: false, message: error.message };
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

            commonCore.items.Currency.quantity += purchase.totalMtxPaid;

            if (fs.existsSync(athenaPath)) {
                const athena = JSON.parse(fs.readFileSync(athenaPath, 'utf8'));
                for (const loot of purchase.lootResult || []) {
                    delete athena.items[loot.itemGuid];
                }
                athena.rvn = (athena.rvn || 0) + 1;
                athena.updated = new Date().toISOString();
                this.atomicWriteFile(athenaPath, JSON.stringify(athena, null, 2));
            }

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

    static async updateAccount(accountId, updates) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);
        if (!account) return false;

        if (updates.displayName && updates.displayName !== account.displayName) {
            const existing = clients.find(c =>
                c.displayName.toLowerCase() === updates.displayName.toLowerCase() &&
                c.accountId !== accountId
            );
            if (existing) throw new Error('Display name already exists');
            account.displayName = updates.displayName;

            account.numberOfDisplayNameChanges = (account.numberOfDisplayNameChanges || 0) + 1;
        }

        if (updates.email && updates.email !== account.email) {
            const normalizedEmail = this.normalizeEmail(updates.email);
            const existing = clients.find(c =>
                this.normalizeEmail(c.email) === normalizedEmail &&
                c.accountId !== accountId
            );
            if (existing) throw new Error('Email already exists');
            account.email = normalizedEmail;
        }

        await this.saveClients(clients);
        return account;
    }

    static async updatePassword(accountId, currentPassword, newPassword) {
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);
        if (!account) return { success: false, message: 'Account not found' };

        const match = await bcrypt.compare(currentPassword, account.password);
        if (!match) return { success: false, message: 'Current password is incorrect' };

        this.validatePasswordStrength(newPassword);

        const workFactor = ConfigManager.get('bcryptWorkFactor', 12);
        account.password = await bcrypt.hash(newPassword, workFactor);
        await this.saveClients(clients);

        LoggerService.log('info', `Password updated for account: ${accountId}`);
        return { success: true };
    }

    static async getUserSettings(accountId) {
        const settingsPath = path.join(this.playersPath, accountId, 'settings.json');
        if (!fs.existsSync(settingsPath)) {
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
        const data = await this.safeReadFile(settingsPath);
        return JSON.parse(data);
    }

    static async saveUserSettings(accountId, settings) {
        const playerPath = path.join(this.playersPath, accountId);
        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }
        const settingsPath = path.join(playerPath, 'settings.json');
        await this.safeWriteFile(settingsPath, JSON.stringify(settings, null, 2));

        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);

        if (account) {
            if (settings.language) {
                account.preferredLanguage = settings.language;
            }

            if (settings.region) {
                account.country = settings.region;
            }

            if (settings.privacy) {
                if (settings.privacy.ageGroup !== undefined) {
                    account.ageGroup = settings.privacy.ageGroup;
                }
                if (settings.privacy.minorStatus !== undefined) {
                    account.minorStatus = settings.privacy.minorStatus;
                }
                if (settings.privacy.cabinedMode !== undefined) {
                    account.cabinedMode = settings.privacy.cabinedMode;
                }
            }

            await this.saveClients(clients);
        }

        return true;
    }

    static async searchUsers(query, limit = 10) {
        const clients = await this.getClients();
        const searchLower = query.toLowerCase();
        return clients
            .filter(c => c.displayName && c.displayName.toLowerCase().includes(searchLower))
            .slice(0, limit)
            .map(c => ({
                accountId: c.accountId,
                displayName: c.displayName
            }));
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

    static async getAuditLogs() {
        if (!fs.existsSync(this.auditLogFile)) {
            return { logs: [], lastUpdated: new Date().toISOString() };
        }
        const data = await this.safeReadFile(this.auditLogFile);
        return JSON.parse(data);
    }

    static async saveAuditLogs(auditData) {
        auditData.lastUpdated = new Date().toISOString();
        if (auditData.logs.length > this.maxAuditLogEntries) {
            auditData.logs = auditData.logs.slice(-this.maxAuditLogEntries);
        }
        await this.safeWriteFile(this.auditLogFile, JSON.stringify(auditData, null, 2));
    }

    static async addAuditLog(logEntry) {
        const auditData = await this.getAuditLogs();
        auditData.logs.push(logEntry);
        await this.saveAuditLogs(auditData);
        return logEntry;
    }

    // ============================================
    // TICKETS
    // ============================================

    static ticketsFile = path.join(this.dataPath, 'tickets.json');

    static async getTickets() {
        if (!fs.existsSync(this.ticketsFile)) {
            return { tickets: {}, lastUpdated: new Date().toISOString() };
        }
        const data = await this.safeReadFile(this.ticketsFile);
        return JSON.parse(data);
    }

    static async saveTickets(ticketsData) {
        ticketsData.lastUpdated = new Date().toISOString();
        await this.safeWriteFile(this.ticketsFile, JSON.stringify(ticketsData, null, 2));
    }

    static async getTicket(ticketId) {
        const data = await this.getTickets();
        return data.tickets[ticketId] || null;
    }

    static async createTicket(ticket) {
        const data = await this.getTickets();
        data.tickets[ticket.ticketId] = ticket;
        await this.saveTickets(data);
        return ticket;
    }

    static async updateTicket(ticketId, updates) {
        const data = await this.getTickets();
        if (!data.tickets[ticketId]) return null;
        Object.assign(data.tickets[ticketId], updates);
        await this.saveTickets(data);
        return data.tickets[ticketId];
    }

    static async deleteTicket(ticketId) {
        const data = await this.getTickets();
        if (!data.tickets[ticketId]) return false;
        delete data.tickets[ticketId];
        await this.saveTickets(data);
        return true;
    }

    // ============================================
    // CREATOR CODES
    // ============================================

    static creatorCodesFile = path.join(this.dataPath, 'creator-codes.json');

    static async getCreatorCodesData() {
        if (!fs.existsSync(this.creatorCodesFile)) {
            return { codes: {}, requests: {}, lastUpdated: new Date().toISOString() };
        }
        const data = await this.safeReadFile(this.creatorCodesFile);
        return JSON.parse(data);
    }

    static async saveCreatorCodesData(codesData) {
        codesData.lastUpdated = new Date().toISOString();
        await this.safeWriteFile(this.creatorCodesFile, JSON.stringify(codesData, null, 2));
    }

    static async getCreatorCode(code) {
        const data = await this.getCreatorCodesData();
        return data.codes[code.toLowerCase()] || null;
    }

    static async createCreatorCode(codeData) {
        const data = await this.getCreatorCodesData();
        data.codes[codeData.code.toLowerCase()] = codeData;
        await this.saveCreatorCodesData(data);
        return codeData;
    }

    static async updateCreatorCode(code, updates) {
        const data = await this.getCreatorCodesData();
        const normalizedCode = code.toLowerCase();
        if (!data.codes[normalizedCode]) return null;
        Object.assign(data.codes[normalizedCode], updates);
        await this.saveCreatorCodesData(data);
        return data.codes[normalizedCode];
    }

    static async deleteCreatorCode(code) {
        const data = await this.getCreatorCodesData();
        const normalizedCode = code.toLowerCase();
        if (!data.codes[normalizedCode]) return false;
        delete data.codes[normalizedCode];
        await this.saveCreatorCodesData(data);
        return true;
    }

    static async getCreatorCodeRequest(requestId) {
        const data = await this.getCreatorCodesData();
        return data.requests[requestId] || null;
    }

    static async createCreatorCodeRequest(request) {
        const data = await this.getCreatorCodesData();
        data.requests[request.requestId || request.id] = request;
        await this.saveCreatorCodesData(data);
        return request;
    }

    static async updateCreatorCodeRequest(requestId, updates) {
        const data = await this.getCreatorCodesData();
        if (!data.requests[requestId]) return null;
        Object.assign(data.requests[requestId], updates);
        await this.saveCreatorCodesData(data);
        return data.requests[requestId];
    }
}

module.exports = JsonDatabase;
