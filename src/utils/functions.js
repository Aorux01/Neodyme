const bcrypt = require('bcrypt');
const crypto = require('crypto');
const VersionService = require('../services/VersionService');
const ShopService = require('../services/ShopService');

class Functions {
    static MakeID() {
        return crypto.randomUUID();
    }

    static DecodeBase64(str) {
        return Buffer.from(str, 'base64').toString('utf-8');
    }

    static EncodeBase64(str) {
        return Buffer.from(str, 'utf-8').toString('base64');
    }

    static GetVersionInfo(req) {
        return VersionService.getVersionInfo(req);
    }

    static async getItemShop() {
        const versionInfo = this.GetVersionInfo({ headers: {} });
        return ShopService.getItemShop(versionInfo);
    }

    static getPresenceFromUser(accountId, targetAccountId, offline = false) {
        // This would normally check XMPP service for presence
        // For now, return a basic presence structure
        return {
            accountId: targetAccountId,
            status: offline ? "offline" : "online",
            playing: false,
            joinable: false,
            voiceSupport: false
        };
    }

    static formatDate(date) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        return date.toISOString();
    }

    static generateRandomString(length = 16) {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    }

    // NOUVELLE MÉTHODE : Hash password avec bcrypt (pour la compatibilité avec web.js)
    static async hashPassword(password) {
        return bcrypt.hash(password, 10);
    }

    // NOUVELLE MÉTHODE : Compare password avec bcrypt
    static async comparePassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    // ANCIENNE MÉTHODE : SHA256 (garde pour la rétro-compatibilité si nécessaire)
    static hashPasswordSHA256(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Alias pour la compatibilité
    static isValidEmail(email) {
        return this.validateEmail(email);
    }

    static validateDisplayName(displayName) {
        // Display name must be 3-16 characters, alphanumeric with underscores
        const nameRegex = /^[a-zA-Z0-9_]{3,16}$/;
        return nameRegex.test(displayName);
    }

    // Alias pour la compatibilité
    static isValidUsername(username) {
        return this.validateDisplayName(username);
    }

    // Validation de mot de passe
    static isValidPassword(password) {
        return password && password.length >= 6;
    }

    static parseUserAgent(userAgent) {
        const match = userAgent.match(/\+\+Fortnite\+Release-(\d+\.\d+(?:\.\d+)?)-CL-(\d+)/);
        if (match) {
            return {
                version: match[1],
                buildNumber: match[2]
            };
        }
        return null;
    }

    static generateExchangeCode() {
        return crypto.randomBytes(16).toString('hex');
    }

    static generateDeviceId() {
        return crypto.randomBytes(16).toString('hex').toUpperCase();
    }

    static calculateLevel(xp) {
        // Simple level calculation
        return Math.floor(xp / 1000) + 1;
    }

    static calculateBattleStars(level) {
        // 5 battle stars per level up to level 100
        return Math.min(level * 5, 500);
    }

    static getTierFromBattleStars(stars) {
        // 10 stars per tier
        return Math.floor(stars / 10);
    }

    static generateMatchId() {
        return `match_${this.MakeID()}`;
    }

    static generatePartyId() {
        return this.MakeID().replace(/-/g, '').toLowerCase();
    }

    static isValidUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        // Remove any potential XSS attempts
        return input
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
    }

    // Alias pour la compatibilité
    static sanitizeString(str) {
        return this.sanitizeInput(str);
    }

    static getPlatformFromUserAgent(userAgent) {
        if (userAgent.includes('Windows')) return 'Windows';
        if (userAgent.includes('Mac')) return 'Mac';
        if (userAgent.includes('PlayStation')) return 'PSN';
        if (userAgent.includes('Xbox')) return 'XBL';
        if (userAgent.includes('Switch')) return 'SWT';
        if (userAgent.includes('Android')) return 'AND';
        if (userAgent.includes('iOS')) return 'IOS';
        return 'WIN'; // Default to Windows
    }

    static generateAuthToken() {
        return crypto.randomBytes(32).toString('base64url');
    }

    static calculateMMR(wins, kills, matches) {
        // Simple MMR calculation
        const winRate = matches > 0 ? wins / matches : 0;
        const kpm = matches > 0 ? kills / matches : 0;
        return Math.floor((winRate * 1000) + (kpm * 100));
    }

    static getSeasonStartDate(season) {
        const seasonDates = {
            1: new Date('2017-10-25'),
            2: new Date('2017-12-14'),
            3: new Date('2018-02-22'),
            4: new Date('2018-05-01'),
            5: new Date('2018-07-12'),
            6: new Date('2018-09-27'),
            7: new Date('2018-12-06'),
            8: new Date('2019-02-28'),
            9: new Date('2019-05-09'),
            10: new Date('2019-08-01'),
            11: new Date('2019-10-15'),
            12: new Date('2020-02-20'),
            13: new Date('2020-06-17'),
            14: new Date('2020-08-27'),
            15: new Date('2020-12-02'),
            16: new Date('2021-03-16'),
            17: new Date('2021-06-08'),
            18: new Date('2021-09-13'),
            19: new Date('2021-12-05'),
            20: new Date('2022-03-20'),
            21: new Date('2022-06-05'),
            22: new Date('2022-09-18'),
            23: new Date('2022-12-04'),
            24: new Date('2023-03-10'),
            25: new Date('2023-06-09'),
            26: new Date('2023-08-25'),
            27: new Date('2023-12-03'),
            28: new Date('2024-02-02'),
            29: new Date('2024-03-22'),
            30: new Date('2024-05-24'),
            31: new Date('2024-08-16'),
            32: new Date('2024-11-01')
        };

        return seasonDates[season] || new Date();
    }

    static getItemRarity(templateId) {
        const id = templateId.toLowerCase();
        if (id.includes('legendary')) return 'Legendary';
        if (id.includes('epic')) return 'Epic';
        if (id.includes('rare')) return 'Rare';
        if (id.includes('uncommon')) return 'Uncommon';
        return 'Common';
    }

    static calculateVBucksPrice(rarity) {
        const prices = {
            'Common': 500,
            'Uncommon': 800,
            'Rare': 1200,
            'Epic': 1500,
            'Legendary': 2000
        };
        return prices[rarity] || 800;
    }

    static isItemOwned(profile, templateId) {
        if (!profile.items) return false;
        
        return Object.values(profile.items).some(item => 
            item.templateId === templateId
        );
    }

    static getRandomLoadingScreen() {
        const loadingScreens = [
            'LSID_001_Default',
            'LSID_002_Season1',
            'LSID_003_Season2',
            'LSID_004_Season3',
            'LSID_005_Season4'
        ];
        return loadingScreens[Math.floor(Math.random() * loadingScreens.length)];
    }

    static generateStatsAttributes(accountId) {
        return {
            season_match_boost: 0,
            loadouts: ["sandbox_loadout1"],
            mfa_reward_claimed: false,
            rested_xp_overflow: 0,
            current_mtx_platform: "EpicPC",
            last_xp_interaction: new Date().toISOString(),
            book_level: 1,
            season_num: 18,
            book_xp: 0,
            creative_dynamic_xp: {},
            season: {
                numWins: 0,
                numHighBracket: 0,
                numLowBracket: 0
            },
            vote_data: {},
            lifetime_wins: 0,
            book_purchased: false,
            purchased_battle_pass_tier_offers: [],
            rested_xp_exchange: 1,
            level: 1,
            xp_overflow: 0,
            rested_xp: 0,
            rested_xp_mult: 1,
            accountLevel: 1,
            competitive_identity: {},
            inventory_limit_bonus: 0,
            last_applied_loadout: "sandbox_loadout1",
            daily_rewards: {},
            xp: 0,
            season_friend_match_boost: 0,
            active_loadout_index: 0,
            accountId: accountId,
            favorite_musicpack: "",
            favorite_glider: "",
            favorite_pickaxe: "",
            favorite_skydivecontrail: "",
            favorite_backpack: "",
            favorite_dance: ["", "", "", "", "", ""],
            favorite_itemwraps: ["", "", "", "", "", "", ""],
            favorite_character: "",
            favorite_loadingscreen: ""
        };
    }

    static mergeSafely(target, source) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    if (!target[key]) target[key] = {};
                    this.mergeSafely(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
        return target;
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Utilitaires supplémentaires pour la compatibilité
    static getCurrentTimestamp() {
        return new Date().toISOString();
    }

    static generateAccountId() {
        return crypto.randomBytes(16).toString('hex');
    }

    static getOfferID(offerId) {
        try {
            const ShopService = require('../services/ShopService');
            return ShopService.getOfferById ? ShopService.getOfferById(offerId) : null;
        } catch (error) {
            LoggerService.log('error', `Failed to get offer by id: ${error.message}`);
            return null;
        }
    }
    
    static sendXmppMessageToId(message, accountId) {
        try {
            const LoggerService = require('../utils/logger');
            
            // Essayer d'utiliser le service XMPP s'il est disponible
            try {
                const { getService } = require('../xmpp/service');
                const xmppService = getService();
                
                if (xmppService) {
                    // Utiliser le service XMPP réel
                    const currentClient = Array.from(xmppService.xmppServer.clients.values())
                        .find(c => c.accountId === accountId);
                    
                    if (currentClient) {
                        const messageStr = JSON.stringify(message);
                        xmppService.sendMessage(
                            'system@neodyme.local', 
                            currentClient.jid, 
                            messageStr
                        );
                        
                        LoggerService.log('debug', `XMPP message sent to ${accountId}`, message);
                        return true;
                    }
                }
            } catch (serviceError) {
                // Service XMPP non disponible, fallback sur logging
                LoggerService.log('debug', `XMPP service unavailable, logging message to ${accountId}:`, message);
            }
            
            // Fallback: juste logger le message si XMPP n'est pas disponible
            LoggerService.log('debug', `XMPP message (fallback) to ${accountId}:`, message);
            return true;
            
        } catch (error) {
            const LoggerService = require('../utils/logger');
            LoggerService.log('error', `Failed to send XMPP message: ${error.message}`);
            return false;
        }
    }
}

module.exports = Functions;