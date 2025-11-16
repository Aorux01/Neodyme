const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../../service/logger/LoggerService');

class JsonDatabase {
    static dataPath = path.join(__dirname, '../../../data');
    static clientsFile = path.join(this.dataPath, 'clients.json');
    static playersPath = path.join(this.dataPath, 'players');

    static initialize() {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }

        if (!fs.existsSync(this.playersPath)) {
            fs.mkdirSync(this.playersPath, { recursive: true });
        }

        if (!fs.existsSync(this.clientsFile)) {
            fs.writeFileSync(this.clientsFile, JSON.stringify([], null, 2));
        }

        LoggerService.log('info', 'JSON Database initialized');
    }

    static generatePurchaseId() {
        return 'purchase_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    static getClients() {
        const data = fs.readFileSync(this.clientsFile, 'utf8');
        return JSON.parse(data);
    }

    static saveClients(clients) {
        fs.writeFileSync(this.clientsFile, JSON.stringify(clients, null, 2));
    }

    static async getAccount(accountId) {
        const clients = this.getClients();
        return clients.find(c => c.accountId === accountId);
    }

    static getPublicAccountsByDisplayNameSubstr(displayNameSubstr) {
        const MAX_RESULTS = 20;
        const MIN_RESULTS = 2;
    
        if (typeof displayNameSubstr !== 'string') {
            return [];
        }
        
        const clients = this.getClients();
        
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
    
        const clients = this.getClients();
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
        const account = this.getAccount(accountId);
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

    static banAccount(accountId, reasons = [], expiresAt = null) {
        const clients = this.getClients();
        const account = clients.find(c => c.accountId === accountId);
        
        if (!account) return false;

        account.banned = true;
        account.banReasons = reasons;
        account.banExpires = expiresAt;

        this.saveClients(clients);
        LoggerService.log('warning', `Account banned: ${accountId}`);
        return true;
    }

    static unbanAccount(accountId) {
        const clients = this.getClients();
        const account = clients.find(c => c.accountId === accountId);
        
        if (!account) return false;

        account.banned = false;
        delete account.banReasons;
        delete account.banExpires;

        this.saveClients(clients);
        LoggerService.log('info', `Account unbanned: ${accountId}`);
        return true;
    }

    static async getAccountByEmail(email) {
        const clients = this.getClients();
        return clients.find(c => c.email.toLowerCase() === email.toLowerCase());
    }

    static async getAccountByDisplayName(displayName) {
        const clients = this.getClients();
        return clients.find(c => c.displayName.toLowerCase() === displayName.toLowerCase());
    }

    static async createAccount(email, password, displayName) {
        const clients = this.getClients();
    
        if (clients.find(c => c.email.toLowerCase() === email.toLowerCase())) {
            throw new Error('Email already exists');
        }
    
        if (clients.find(c => c.displayName.toLowerCase() === displayName.toLowerCase())) {
            throw new Error('Display name already exists');
        }
    
        const accountId = uuidv4().replace(/-/g, '');
        const hashedPassword = await bcrypt.hash(password, 10);
    
        const newAccount = {
            accountId,
            email,
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
            tfaEnabled: false,
            tfaSecret: null,
            emailVerified: true,
            numberOfDisplayNameChanges: 0,
            ageGroup: 'ADULT',
            minorStatus: 'NOT_MINOR',
            cabinedMode: false,
            admin: false
        };
    
        clients.push(newAccount);
        this.saveClients(clients);
    
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
                        fs.writeFileSync(filePath, content, 'utf8');
                        LoggerService.log('info', `Updated accountId in: ${file}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to update ${file}: ${error.message}`);
                }
            }
        }
    }

    static setAdmin(accountId, isAdmin) {
        const clients = this.getClients();
        const account = clients.find(c => c.accountId === accountId);
        
        if (!account) return false;

        account.admin = isAdmin;
        this.saveClients(clients);
        return true;
    }

    static async updateLastLogin(accountId) {
        const clients = this.getClients();
        const account = clients.find(c => c.accountId === accountId);
        
        if (!account) return false;

        account.lastLogin = new Date().toISOString();

        this.saveClients(clients);
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

    static saveClientSettings(accountId, buildId, content) {
        const playerPath = path.join(this.playersPath, accountId);
        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }

        const settingsPath = path.join(playerPath, 'CloudStorage', 'ClientSettings.Sav');
        fs.writeFileSync(settingsPath, content);
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

        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
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

        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        let currency = Object.values(profile.items || {}).find(
            item => item.templateId === 'Currency:MtxPurchased'
        );

        if (currency) {
            currency.quantity = newBalance;
        }

        fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
        return true;
    }

    static async processVbucksPurchase(accountId, vbucksAmount, price, paymentMethod) {
        try {
            const commonCorePath = path.join(this.playersPath, accountId, 'common_core.json');
            
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

            fs.writeFileSync(commonCorePath, JSON.stringify(commonCore, null, this.getJsonSpacing ? 2 : 0));

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
            const commonCorePath = path.join(this.playersPath, accountId, 'common_core.json');
            
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

            const athenaPath = path.join(this.playersPath, accountId, 'athena.json');
            if (fs.existsSync(athenaPath)) {
                const athena = JSON.parse(fs.readFileSync(athenaPath, 'utf8'));

                if (item.itemGrants && Array.isArray(item.itemGrants)) {
                    for (const grant of item.itemGrants) {
                        const itemTemplateId = (grant.templateId || grant).toLowerCase();

                        const existingItem = Object.values(athena.items || {}).find(
                            existingItem => existingItem.templateId && existingItem.templateId.toLowerCase() === itemTemplateId
                        );

                        if (existingItem) {
                            throw new Error('Vous possédez déjà cet item');
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
                fs.writeFileSync(athenaPath, JSON.stringify(athena, null, this.getJsonSpacing ? 2 : 0));
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
            
            fs.writeFileSync(commonCorePath, JSON.stringify(commonCore, null, this.getJsonSpacing ? 2 : 0));

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

    static setPrivacy(accountId, privacy) {
        const playerPath = path.join(this.playersPath, accountId);
        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }

        const privacyPath = path.join(playerPath, 'privacy.json');
        fs.writeFileSync(privacyPath, JSON.stringify(privacy, null, 2));
        return true;
    }

    static async getProfile(accountId, profileId) {
        const profilePath = path.join(this.playersPath, accountId, `${profileId}.json`);
        if (!fs.existsSync(profilePath)) {
            return null;
        }

        return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    }

    static async saveProfile(accountId, profileId, profileData) {
        const playerPath = path.join(this.playersPath, accountId);
        if (!fs.existsSync(playerPath)) {
            fs.mkdirSync(playerPath, { recursive: true });
        }

        const profilePath = path.join(playerPath, `${profileId}.json`);
        fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
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
        
        const data = fs.readFileSync(friendsListPath, 'utf8');
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
        
        fs.writeFileSync(friendsListPath, JSON.stringify(friendsData, null, 2));
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

    static async getFriendData(accountId, friendAccountId) {
        const friends = await this.getFriends(accountId);
        return friends.friendsData[friendAccountId] || null;
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

        return JSON.parse(fs.readFileSync(seasonPath, 'utf8'));
    }

    static async getAthenaProfile(accountId, profileId) {
        const profilePath = path.join(this.playersPath, accountId, 'Athena', `${profileId}.json`);
        if (!fs.existsSync(profilePath)) {
            return null;
        }

        return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    }

    static async saveAthenaProfile(accountId, profileId, profileData) {
        const athenaPath = path.join(this.playersPath, accountId, 'Athena', `${profileId}.json`);
        if (!fs.existsSync(path.dirname(athenaPath))) {
            fs.mkdirSync(path.dirname(athenaPath), { recursive: true });
        }
        fs.writeFileSync(athenaPath, JSON.stringify(profileData, null, 2));
        return true;
    }
}

module.exports = JsonDatabase;