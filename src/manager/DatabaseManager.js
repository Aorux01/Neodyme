const ConfigManager = require('../manager/ConfigManager');
const LoggerService = require('../service/logger/LoggerService');
const JsonDatabase = require('./database/jsonDatabase');

class DatabaseManager {
    static getDatabaseType() {
        return ConfigManager.get('databaseType') || 'json';
    }

    static getDatabaseInstance() {
        const dbType = this.getDatabaseType();
        switch (dbType) {
            case 'json':
                return JsonDatabase;
            default:
                LoggerService.log('error', `Unsupported database type: ${dbType}`);
                throw new Error(`Unsupported database type: ${dbType}`);
        }
    }

    static initialize() {
        const dbInstance = this.getDatabaseInstance();
        dbInstance.initialize();
        LoggerService.log('success', `Database initialized with type: ${this.getDatabaseType()}`);
    }

    static async isAccountLocked(accountId) {
        return this.getDatabaseInstance().isAccountLocked(accountId);
    }

    static async recordFailedLoginAttempt(accountId) {
        return this.getDatabaseInstance().recordFailedLoginAttempt(accountId);
    }

    static async resetFailedAttempts(accountId) {
        return this.getDatabaseInstance().resetFailedAttempts(accountId);
    }

    static async getAccount(accountId) {
        return this.getDatabaseInstance().getAccount(accountId);
    }

    static async getAllAccounts() {
        return this.getDatabaseInstance().getAllAccounts();
    }

    static setClientType(accountId, clientType) {
        return this.getDatabaseInstance().setClientType(accountId, clientType);
    }

    static getPublicAccountsByDisplayNameSubstr(displayNameSubstr) {
        return this.getDatabaseInstance().getPublicAccountsByDisplayNameSubstr(displayNameSubstr);
    }

    static getAccountByExactDisplayName(displayName) {
        return this.getDatabaseInstance().getAccountByExactDisplayName(displayName);
    }

    static AccountIsBanned(accountId) {
        return this.getDatabaseInstance().AccountIsBanned(accountId);
    }

    static getBanInfo(accountId) {
        return this.getDatabaseInstance().getBanInfo(accountId);
    }

    static banAccount(accountId, reasons = [], expiresAt = null) {
        return this.getDatabaseInstance().banAccount(accountId, reasons, expiresAt);
    }

    static unbanAccount(accountId) {
        return this.getDatabaseInstance().unbanAccount(accountId);
    }

    static async getAccountByEmail(email) {
        return this.getDatabaseInstance().getAccountByEmail(email);
    }

    static async getAccountByDisplayName(displayName) {
        return this.getDatabaseInstance().getAccountByDisplayName(displayName);
    }

    static async createAccount(email, password, displayName) {
        return await this.getDatabaseInstance().createAccount(email, password, displayName);
    }

    static setAdmin(accountId, isAdmin) {
        return this.getDatabaseInstance().setAdmin(accountId, isAdmin);
    }

    static async updateLastLogin(accountId) {
        return await this.getDatabaseInstance().updateLastLogin(accountId);
    }

    static getClientSettings(accountId, buildId) {
        return this.getDatabaseInstance().getClientSettings(accountId, buildId);
    }

    static getClientSettingsFile(accountId, buildId) {
        return this.getDatabaseInstance().getClientSettingsFile(accountId, buildId);
    }

    static saveClientSettings(accountId, buildId, content) {
        return this.getDatabaseInstance().saveClientSettings(accountId, buildId, content);
    }

    static deleteClientSettings(accountId, buildId) {
        return this.getDatabaseInstance().deleteClientSettings(accountId, buildId);
    }

    static async getVbucksBalance(accountId) {
        const db = this.getDatabaseInstance();
        if (db.getVbucksBalance) {
            return await db.getVbucksBalance(accountId);
        }
        return 0;
    }

    static async setVbucksBalance(accountId, newBalance) {
        const db = this.getDatabaseInstance();
        if (db.setVbucksBalance) {
            return await db.setVbucksBalance(accountId, newBalance);
        }
        throw new Error('Set V-Bucks balance not supported');
    }

    static async processVbucksPurchase(accountId, vbucksAmount, price, paymentMethod) {
        const db = this.getDatabaseInstance();
        if (db.processVbucksPurchase) {
            return await db.processVbucksPurchase(accountId, vbucksAmount, price, paymentMethod);
        }
        throw new Error('V-Bucks purchase not supported');
    }

    static async processItemPurchase(accountId, itemKey, item) {
        const db = this.getDatabaseInstance();
        if (db.processItemPurchase) {
            return await db.processItemPurchase(accountId, itemKey, item);
        }
        throw new Error('Item purchase not supported');
    }

    static async processPurchaseRefund(accountId, purchaseId) {
        const db = this.getDatabaseInstance();
        if (db.processPurchaseRefund) {
            return await db.processPurchaseRefund(accountId, purchaseId);
        }
        throw new Error('Purchase refund not supported');
    }

    static async getUserPurchaseHistory(accountId) {
        const db = this.getDatabaseInstance();
        if (db.getUserPurchaseHistory) {
            return await db.getUserPurchaseHistory(accountId);
        }
        return [];
    }

    static getPrivacy(accountId) {
        const db = this.getDatabaseInstance();
        if (db.getPrivacy) {
            return db.getPrivacy(accountId);
        }
        return {};
    }

    static setPrivacy(accountId, privacy) {
        const db = this.getDatabaseInstance();
        if (db.setPrivacy) {
            return db.setPrivacy(accountId, privacy);
        }
        return false;
    }

    static async getProfile(accountId, profileId) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.getProfile) {
            return await dbInstance.getProfile(accountId, profileId);
        }
        return null;
    }

    static async getAthenaProfile(accountId, profileId) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.getAthenaProfile) {
            return await dbInstance.getAthenaProfile(accountId, profileId);
        }
        return null;
    }

    static async saveAthenaProfile(accountId, profileId, profileData) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.saveAthenaProfile) {
            return await dbInstance.saveAthenaProfile(accountId, profileId, profileData);
        }
        return new Error('Save athena profile error')
    }
    
    static async getCampaignProfile(accountId) {
        return await this.getProfile(accountId, 'campaign');
    }
    
    static async saveCampaignProfile(accountId, profileData) {
        return await this.saveProfile(accountId, 'campaign', profileData);
    }
    
    static async getCatalog() {
        try {
            const fs = require('fs').promises;
            const path = require('path');
            const catalogPath = path.join(__dirname, '../../data/shop.json');
            const data = await fs.readFile(catalogPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            LoggerService.log('error', 'Failed to load catalog:', error.message);
            return { storefronts: [] };
        }
    }
    
    static async saveProfile(accountId, profileId, profileData) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.saveProfile) {
            return await dbInstance.saveProfile(accountId, profileId, profileData);
        }
        throw new Error('Save profile error');
    }

    static async updateProfileStats(accountId, profileId, stats) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.updateProfileStats) {
            return await dbInstance.updateProfileStats(accountId, profileId, stats);
        }
        throw new Error('Update profile stats not supported');
    }

    static async addItemToProfile(accountId, profileId, itemId, itemData) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.addItemToProfile) {
            return await dbInstance.addItemToProfile(accountId, profileId, itemId, itemData);
        }
        throw new Error('Add item to profile not supported');
    }

    static async removeItemFromProfile(accountId, profileId, itemId) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.removeItemFromProfile) {
            return await dbInstance.removeItemFromProfile(accountId, profileId, itemId);
        }
        throw new Error('Remove item from profile not supported');
    }

    static async updateItemInProfile(accountId, profileId, itemId, updates) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.updateItemInProfile) {
            return await dbInstance.updateItemInProfile(accountId, profileId, itemId, updates);
        }
        throw new Error('Update item in profile not supported');
    }
    
    static generateItemId() {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.generateItemId) {
            return dbInstance.generateItemId();
        }
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    static async getFriends(accountId) {
        const db = this.getDatabaseInstance();
        if (db.getFriends) {
            return await db.getFriends(accountId);
        }
        return { 
            friends: [], 
            incoming: [], 
            outgoing: [], 
            suggested: [],
            blocklist: [], 
            settings: { acceptInvites: 'public' }
        };
    }

    static async getFriendsList(accountId) {
        const friendsData = await this.getFriends(accountId);
        const friendsList = [];
        
        for (const friend of friendsData.friends) {
            friendsList.push({
                accountId: friend.accountId,
                status: 'ACCEPTED',
                direction: 'OUTBOUND',
                created: friend.created || new Date().toISOString(),
                favorite: friend.favorite || false
            });
        }
        
        for (const friendId of friendsData.outgoing) {
            const existingFriend = friendsData.friends.find(f => f.accountId === friendId);
            friendsList.push({
                accountId: friendId,
                status: 'PENDING',
                direction: 'OUTBOUND',
                created: existingFriend?.created || new Date().toISOString(),
                favorite: false
            });
        }
        
        for (const friendId of friendsData.incoming) {
            const existingFriend = friendsData.friends.find(f => f.accountId === friendId);
            friendsList.push({
                accountId: friendId,
                status: 'PENDING',
                direction: 'INBOUND',
                created: existingFriend?.created || new Date().toISOString(),
                favorite: false
            });
        }
        
        return friendsList;
    }

    static async isFriend(accountId, friendId) {
        const friends = await this.getFriends(accountId);
        return friends.friends.some(f => f.accountId === friendId) || 
               friends.incoming.includes(friendId) || 
               friends.outgoing.includes(friendId);
    }

    static async sendFriendRequest(senderAccountId, receiverAccountId) {
        try {
            const alreadyFriend = await this.isFriend(senderAccountId, receiverAccountId);
            if (alreadyFriend) {
                return { success: false };
            }

            const timestamp = new Date().toISOString();
            
            const senderFriends = await this.getFriends(senderAccountId);
            const receiverFriends = await this.getFriends(receiverAccountId);

            if (!senderFriends.outgoing.includes(receiverAccountId)) {
                senderFriends.outgoing.push(receiverAccountId);
            }

            if (!receiverFriends.incoming.includes(senderAccountId)) {
                receiverFriends.incoming.push(senderAccountId);
            }

            await this.saveFriends(senderAccountId, senderFriends);
            await this.saveFriends(receiverAccountId, receiverFriends);
            
            return { success: true };
        } catch (error) {
            LoggerService.log('error', `Send friend request failed: ${error.message}`);
            return { success: false };
        }
    }

    static async acceptFriendRequest(accepterAccountId, requesterAccountId) {
        try {
            const accepterFriends = await this.getFriends(accepterAccountId);
            
            if (!accepterFriends.incoming.includes(requesterAccountId)) {
                return { success: false };
            }
            
            const requesterFriends = await this.getFriends(requesterAccountId);
            const timestamp = new Date().toISOString();

            accepterFriends.incoming = accepterFriends.incoming.filter(id => id !== requesterAccountId);
            requesterFriends.outgoing = requesterFriends.outgoing.filter(id => id !== accepterAccountId);

            const accepterFriend = {
                accountId: requesterAccountId,
                groups: [],
                mutual: 0,
                alias: '',
                note: '',
                favorite: false,
                created: timestamp
            };

            const requesterFriend = {
                accountId: accepterAccountId,
                groups: [],
                mutual: 0,
                alias: '',
                note: '',
                favorite: false,
                created: timestamp
            };

            accepterFriends.friends.push(accepterFriend);
            requesterFriends.friends.push(requesterFriend);

            await this.saveFriends(accepterAccountId, accepterFriends);
            await this.saveFriends(requesterAccountId, requesterFriends);
            
            return { success: true };
        } catch (error) {
            LoggerService.log('error', `Accept friend request failed: ${error.message}`);
            return { success: false };
        }
    }

    static async rejectOrRemoveFriend(accountId, friendId) {
        try {
            const friends = await this.getFriends(accountId);
            const friendFriends = await this.getFriends(friendId);
            
            friends.friends = friends.friends.filter(f => f.accountId !== friendId);
            friends.incoming = friends.incoming.filter(id => id !== friendId);
            friends.outgoing = friends.outgoing.filter(id => id !== friendId);
            
            friendFriends.friends = friendFriends.friends.filter(f => f.accountId !== accountId);
            friendFriends.incoming = friendFriends.incoming.filter(id => id !== accountId);
            friendFriends.outgoing = friendFriends.outgoing.filter(id => id !== accountId);
            
            await this.saveFriends(accountId, friends);
            await this.saveFriends(friendId, friendFriends);
            
            return { success: true };
        } catch (error) {
            LoggerService.log('error', `Remove friend failed: ${error.message}`);
            return { success: false };
        }
    }

    static async removeFriend(accountId, friendAccountId) {
        const db = this.getDatabaseInstance();
        if (db.removeFriend) {
            return await db.removeFriend(accountId, friendAccountId);
        }
        return false;
    }

    static async blockFriend(accountId, friendAccountId) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.blockFriend) {
            return await dbInstance.blockFriend(accountId, friendAccountId);
        }
        throw new Error('Block friend not supported');
    }

    static async getFriendData(accountId, friendAccountId) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.getFriendData) {
            return await dbInstance.getFriendData(accountId, friendAccountId);
        }
        return null;
    }

    static async setFriendAlias(accountId, friendAccountId, alias) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.setFriendAlias) {
            return await dbInstance.setFriendAlias(accountId, friendAccountId, alias);
        }
        throw new Error('Set friend alias not supported');
    }

    static async setFriendData(accountId, friendAccountId, data) {
        const dbInstance = this.getDatabaseInstance();
        return await dbInstance.setFriendData(accountId, friendAccountId, data);
    }

    static async saveFriends(accountId, friends) {
        const dbInstance = this.getDatabaseInstance();
        return await dbInstance.saveFriends(accountId, friends);
    }

    static async getSeasonData(accountId) {
        const dbInstance = this.getDatabaseInstance();
        if (dbInstance.getSeasonData) {
            return await dbInstance.getSeasonData(accountId);
        }
        return null;
    }

    static async updateAccount(accountId, updates) {
        return await this.getDatabaseInstance().updateAccount(accountId, updates);
    }

    static async updatePassword(accountId, currentPassword, newPassword) {
        return await this.getDatabaseInstance().updatePassword(accountId, currentPassword, newPassword);
    }

    static async getUserSettings(accountId) {
        const db = this.getDatabaseInstance();
        if (db.getUserSettings) {
            return await db.getUserSettings(accountId);
        }
        return { language: 'en', region: 'EU', privacy: {} };
    }

    static async saveUserSettings(accountId, settings) {
        const db = this.getDatabaseInstance();
        if (db.saveUserSettings) {
            return await db.saveUserSettings(accountId, settings);
        }
        return false;
    }

    static async searchUsers(query, limit = 10) {
        const db = this.getDatabaseInstance();
        if (db.searchUsers) {
            return await db.searchUsers(query, limit);
        }
        return [];
    }
}

module.exports = DatabaseManager;
