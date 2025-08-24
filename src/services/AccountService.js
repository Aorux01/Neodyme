const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { Errors } = require('../errors/errors');
const LoggerService = require("../utils/logger");
const ConfigService = require('./ConfigService');

class AccountService {
    constructor() {
        // Utiliser ConfigService au lieu de chemins hardcodés
        this.dataPath = path.join(process.cwd(), ConfigService.getDatabasePath());
        this.clientsPath = path.join(this.dataPath, path.basename(ConfigService.getClientsFile()));
        this.playersPath = ConfigService.getPlayersDirectory();
        this.templatePath = path.join(process.cwd(), 'template');
        this.initialized = false;
        this.initPromise = this.initializeDirectories();
    }

    async initializeDirectories() {
        if (this.initialized) return;
        
        try {
            await fs.mkdir(this.dataPath, { recursive: true });
            await fs.mkdir(this.playersPath, { recursive: true });
            
            // Initialize clients.json if it doesn't exist
            try {
                await fs.access(this.clientsPath);
            } catch {
                await fs.writeFile(this.clientsPath, JSON.stringify([], null, 2));
            }
            
            this.initialized = true;
        } catch (error) {
            LoggerService.log('error', `Failed to initialize directories: ${error}`);
            throw error;
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.initPromise;
        }
    }

    generateAccountId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async hashPassword(password) {
        return bcrypt.hash(password, 10);
    }

    async getClients() {
        await this.ensureInitialized();
        
        try {
            const data = await fs.readFile(this.clientsPath, 'utf8');
            
            // Handle empty file
            if (!data.trim()) {
                LoggerService.log('info', `clients.json is empty, creating empty array`);
                await this.saveClients([]);
                return [];
            }
            
            return JSON.parse(data);
        } catch (error) {
            LoggerService.log('error', `Error reading clients: ${error}`);
            
            // Create the file if it doesn't exist
            await this.saveClients([]);
            return [];
        }
    }

    async saveClients(clients) {
        await this.ensureInitialized();
        
        try {
            await fs.writeFile(this.clientsPath, JSON.stringify(clients, null, 2));
        } catch (error) {
            LoggerService.log('error', `Error saving clients: ${error}`);
            throw error;
        }
    }

    async createAccount(email, password, displayName) {
        await this.ensureInitialized();
        
        const clients = await this.getClients();
        
        // Check if email already exists
        if (clients.find(c => c.email === email)) {
            throw Errors.Account.accountAlreadyExists(email);
        }

        // Check if displayName already exists
        if (clients.find(c => c.displayName === displayName)) {
            throw Errors.Account.displayNameTaken(displayName);
        }

        const accountId = this.generateAccountId();
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newClient = {
            accountId,
            email,
            password: hashedPassword,
            displayName,
            country: "US",
            preferredLanguage: "en",
            lastLogin: new Date().toISOString(),
            created: new Date().toISOString(),
            banned: false,
            failedLoginAttempts: 0,
            emailVerified: true,
            tfaEnabled: false,
            tfaSecret: null,
            ageGroup: "ADULT",
            canUpdateDisplayName: true,
            numberOfDisplayNameChanges: 0,
            minorStatus: "NOT_MINOR",
            cabinedMode: false,
        };

        clients.push(newClient);
        await this.saveClients(clients);

        // Create player profile directory
        await this.createPlayerProfile(accountId, displayName);

        return newClient;
    }

    async createPlayerProfile(accountId, displayName) {
        const playerDir = path.join(this.playersPath, accountId);
        await fs.mkdir(playerDir, { recursive: true });

        // Copy all template files
        try {
            const templateFiles = await fs.readdir(this.templatePath);
            
            for (const file of templateFiles) {
                if (file.endsWith('.json')) {
                    const templateData = await fs.readFile(path.join(this.templatePath, file), 'utf8');
                    let profileData = JSON.parse(templateData);
                    
                    // Update profile with account info
                    if (profileData._id) profileData._id = accountId;
                    if (profileData.accountId) profileData.accountId = accountId;
                    if (profileData.displayName) profileData.displayName = displayName;
                    if (profileData.created) profileData.created = new Date().toISOString();
                    if (profileData.updated) profileData.updated = new Date().toISOString();
                    
                    await fs.writeFile(
                        path.join(playerDir, file),
                        JSON.stringify(profileData, null, 2)
                    );
                }
            }

            // Copy Athena season data if exists
            const athenaDir = path.join(this.templatePath, 'Athena');
            if (await this.pathExists(athenaDir)) {
                const playerAthenaDir = path.join(playerDir, 'Athena');
                await fs.mkdir(playerAthenaDir, { recursive: true });
                
                const athenaFiles = await fs.readdir(athenaDir);
                for (const file of athenaFiles) {
                    const sourceFile = path.join(athenaDir, file);
                    const destFile = path.join(playerAthenaDir, file);
                    await fs.copyFile(sourceFile, destFile);
                }
            }

            // Copy cloudstorage data if exists
            const CloudStorageDir = path.join(this.templatePath, 'cloudstorage');
            if (await this.pathExists(CloudStorageDir)) {
                const playerCloudStorageDir = path.join(playerDir, 'cloudstorage');
                await fs.mkdir(playerCloudStorageDir, { recursive: true });
                
                const athenaFiles = await fs.readdir(CloudStorageDir);
                for (const file of athenaFiles) {
                    const sourceFile = path.join(CloudStorageDir, file);
                    const destFile = path.join(playerCloudStorageDir, file);
                    await fs.copyFile(sourceFile, destFile);
                }
            }
        } catch (error) {
            LoggerService.log('warn', `Could not copy template files: ${error.message}`);
        }
    }

    async pathExists(path) {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    async getAccount(accountId) {
        await this.ensureInitialized();
        
        const clients = await this.getClients();
        const account = clients.find(c => c.accountId === accountId);
        
        if (!account) {
            throw Errors.Account.accountNotFound(accountId);
        }
        
        return account;
    }

    async getAccountByEmail(email) {
        await this.ensureInitialized();
        
        const clients = await this.getClients();
        const account = clients.find(c => c.email === email);
        
        if (!account) {
            throw Errors.Account.accountNotFound(email);
        }
        
        return account;
    }

    async getAccountByDisplayName(displayName) {
        await this.ensureInitialized();
        
        const clients = await this.getClients();
        const account = clients.find(c => c.displayName === displayName);
        
        if (!account) {
            throw Errors.Account.accountNotFound(displayName);
        }
        
        return account;
    }

    async updateAccount(accountId, updates) {
        await this.ensureInitialized();
        
        const clients = await this.getClients();
        const index = clients.findIndex(c => c.accountId === accountId);
        
        if (index === -1) {
            throw Errors.Account.accountNotFound(accountId);
        }
        
        clients[index] = { ...clients[index], ...updates };
        await this.saveClients(clients);
        
        return clients[index];
    }

    async validatePassword(accountId, password) {
        const account = await this.getAccount(accountId);
        return bcrypt.compare(password, account.password);
    }

    async validatePasswordLauncher(accountId, password, userAgent = '') {
        if (!ConfigService.isLauncherBypassEnabled()) {
            // LoggerService.log('debug', 'Launcher bypass disabled, using normal validation', { accountId });
            return this.validatePassword(accountId, password);
        }

        const isFortniteClient = userAgent.includes('Fortnite') || userAgent.includes('++Fortnite');
        
        if (isFortniteClient) {
            const launcherPasswords = ConfigService.getLauncherPasswords();
            
            if (launcherPasswords.includes(password)) {
                LoggerService.log('success', 'Launcher password accepted', {
                    accountId,
                    launcherPassword: password
                });
                return true;
            }
        }

        // Fallback vers la validation normale
        LoggerService.log('debug', 'Fallback to normal password validation', {
            accountId,
            isFortniteClient
        });
        return this.validatePasswordLauncher(accountId, password);
    }

    static async validatePassword(hashedPassword, plainPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    }

    async updateLastLogin(accountId) {
        return this.updateAccount(accountId, {
            lastLogin: new Date().toISOString(),
            failedLoginAttempts: 0
        });
    }

    async incrementFailedLogins(accountId) {
        const account = await this.getAccount(accountId);
        return this.updateAccount(accountId, {
            failedLoginAttempts: account.failedLoginAttempts + 1
        });
    }

    async banAccount(accountId, reason = "Violation of Terms of Service") {
        return this.updateAccount(accountId, {
            banned: true,
            banReason: reason,
            banDate: new Date().toISOString()
        });
    }

    async unbanAccount(accountId) {
        return this.updateAccount(accountId, {
            banned: false,
            banReason: null,
            banDate: null
        });
    }

    async deleteAccount(accountId) {
        await this.ensureInitialized();
        
        const clients = await this.getClients();
        const filteredClients = clients.filter(c => c.accountId !== accountId);
        
        if (clients.length === filteredClients.length) {
            throw Errors.Account.accountNotFound(accountId);
        }
        
        await this.saveClients(filteredClients);
        
        // Delete player data
        const playerDir = path.join(this.playersPath, accountId);
        if (await this.pathExists(playerDir)) {
            await fs.rm(playerDir, { recursive: true, force: true });
        }
    }

    async searchAccounts(query) {
        await this.ensureInitialized();
        
        const clients = await this.getClients();
        const lowercaseQuery = query.toLowerCase();
        
        return clients.filter(c => 
            c.displayName.toLowerCase().includes(lowercaseQuery) ||
            c.email.toLowerCase().includes(lowercaseQuery) ||
            c.accountId.toLowerCase().includes(lowercaseQuery)
        );
    }

    async getMultipleAccounts(accountIds) {
        await this.ensureInitialized();
        
        const clients = await this.getClients();
        return clients.filter(c => accountIds.includes(c.accountId));
    }

    formatAccountResponse(account, includePrivate = false) {
        const response = {
            id: account.accountId,
            displayName: account.displayName,
            name: account.displayName,
            email: includePrivate ? account.email : `${account.displayName}@neodyme.local`,
            failedLoginAttempts: account.failedLoginAttempts,
            lastLogin: account.lastLogin || new Date().toISOString(),
            numberOfDisplayNameChanges: account.numberOfDisplayNameChanges,
            ageGroup: account.ageGroup,
            headless: false,
            country: account.country,
            lastName: "User",
            preferredLanguage: account.preferredLanguage,
            canUpdateDisplayName: account.canUpdateDisplayName,
            tfaEnabled: account.tfaEnabled,
            emailVerified: account.emailVerified,
            minorVerified: false,
            minorExpected: false,
            minorStatus: account.minorStatus,
            cabinedMode: account.cabinedMode,
            hasHashedEmail: false
        };

        if (!includePrivate) {
            delete response.email;
            delete response.failedLoginAttempts;
        }

        return response;
    }

    async enable2FA(accountId, secret) {
        return this.updateAccount(accountId, {
            tfaEnabled: true,
            tfaSecret: secret
        });
    }

    async disable2FA(accountId) {
        return this.updateAccount(accountId, {
            tfaEnabled: false,
            tfaSecret: null
        });
    }

    async changeDisplayName(accountId, newDisplayName) {
        const account = await this.getAccount(accountId);
        
        if (!account.canUpdateDisplayName) {
            throw Errors.Basic.badRequest();
        }

        // Check if display name is already taken
        const clients = await this.getClients();
        if (clients.find(c => c.displayName === newDisplayName && c.accountId !== accountId)) {
            throw Errors.Account.displayNameTaken(newDisplayName);
        }

        return this.updateAccount(accountId, {
            displayName: newDisplayName,
            numberOfDisplayNameChanges: account.numberOfDisplayNameChanges + 1
        });
    }

    async changePassword(accountId, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        return this.updateAccount(accountId, {
            password: hashedPassword,
            passwordLastChanged: new Date().toISOString()
        });
    }

    async verifyEmail(accountId) {
        return this.updateAccount(accountId, {
            emailVerified: true,
            emailVerifiedDate: new Date().toISOString()
        });
    }
}

// Export singleton instance
module.exports = new AccountService();