const fs = require('fs').promises;
const path = require('path');
const LoggerService = require('../logger/LoggerService');

class EXPService {
    static expConfig = null;
    static configPath = path.join(__dirname, '../../../config/EXP.json');

    static async loadConfig() {
        if (this.expConfig) return this.expConfig;

        try {
            const data = await fs.readFile(this.configPath, 'utf-8');
            this.expConfig = JSON.parse(data);
            LoggerService.log('success', 'EXP configuration loaded');
            return this.expConfig;
        } catch (error) {
            LoggerService.log('warning', `Failed to load EXP.json: ${error.message}, using defaults`);
            this.expConfig = {
                maxLevel: 100,
                xpPerLevel: 80000,
                bookXpPerLevel: 1,
                bookXpRequiredForStar: 10,
                xpRewards: {
                    kill: 300,
                    win: 3000
                }
            };
            return this.expConfig;
        }
    }

    static getConfig() {
        if (!this.expConfig) {
            throw new Error('EXP config not loaded. Call loadConfig() first.');
        }
        return this.expConfig;
    }

    static calculateXpToNextLevel(currentLevel) {
        const config = this.getConfig();
        if (currentLevel >= config.maxLevel) {
            return config.xpPerLevel;
        }
        return config.xpPerLevel;
    }

    static addXpToProfile(profile, xpToAdd) {
        const config = this.getConfig();
        
        if (!profile.stats) profile.stats = {};
        if (!profile.stats.attributes) profile.stats.attributes = {};

        const beforeChanges = {
            level: profile.stats.attributes.level || 1,
            xp: profile.stats.attributes.xp || 0,
            book_xp: profile.stats.attributes.book_xp || 0,
            book_level: profile.stats.attributes.book_level || 0,
            accountLevel: profile.stats.attributes.accountLevel || profile.stats.attributes.level || 1
        };

        let currentLevel = profile.stats.attributes.level || 1;
        let currentXp = profile.stats.attributes.xp || 0;
        let bookXp = profile.stats.attributes.book_xp || 0;
        let bookLevel = profile.stats.attributes.book_level || 0;

        currentXp += xpToAdd;

        while (currentLevel < config.maxLevel) {
            const xpNeeded = this.calculateXpToNextLevel(currentLevel);
            
            if (currentXp >= xpNeeded) {
                currentLevel++;
                currentXp -= xpNeeded;
                
                bookXp += config.bookXpPerLevel;
                
                while (bookXp >= config.bookXpRequiredForStar) {
                    bookXp -= config.bookXpRequiredForStar;
                    bookLevel++;
                }
            } else {
                break;
            }
        }

        if (currentXp < 0) currentXp = 0;

        profile.stats.attributes.level = currentLevel;
        profile.stats.attributes.xp = currentXp;
        profile.stats.attributes.book_xp = bookXp;
        profile.stats.attributes.book_level = bookLevel;
        profile.stats.attributes.accountLevel = currentLevel;

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;
        profile.updated = new Date().toISOString();

        const afterChanges = {
            level: profile.stats.attributes.level,
            xp: profile.stats.attributes.xp,
            book_xp: profile.stats.attributes.book_xp,
            book_level: profile.stats.attributes.book_level,
            accountLevel: profile.stats.attributes.accountLevel
        };

        return { beforeChanges, afterChanges, profile };
    }

    static addXpForTiersPurchased(profile, tiersPurchased) {
        const config = this.getConfig();
        const xpGained = tiersPurchased * config.xpPerLevel;
        
        LoggerService.log('info', `[TIER PURCHASE] Adding ${xpGained} XP for ${tiersPurchased} tiers`);
        
        return this.addXpToProfile(profile, xpGained);
    }

    static getXpReward(reason) {
        const config = this.getConfig();
        return config.xpRewards[reason] || config.xpRewards.kill || 20;
    }

    static createStatModifiedChanges(beforeChanges, afterChanges) {
        const changes = [];

        if (beforeChanges.level !== afterChanges.level) {
            changes.push({
                changeType: "statModified",
                name: "level",
                value: afterChanges.level
            });
        }

        if (beforeChanges.xp !== afterChanges.xp) {
            changes.push({
                changeType: "statModified",
                name: "xp",
                value: afterChanges.xp
            });
        }

        if (beforeChanges.book_xp !== afterChanges.book_xp) {
            changes.push({
                changeType: "statModified",
                name: "book_xp",
                value: afterChanges.book_xp
            });
        }

        if (beforeChanges.book_level !== afterChanges.book_level) {
            changes.push({
                changeType: "statModified",
                name: "book_level",
                value: afterChanges.book_level
            });
        }

        if (beforeChanges.accountLevel !== afterChanges.accountLevel) {
            changes.push({
                changeType: "statModified",
                name: "accountLevel",
                value: afterChanges.accountLevel
            });
        }

        return changes;
    }

    static getProgressInfo(profile) {
        const config = this.getConfig();
        const level = profile.stats?.attributes?.level || 1;
        const xp = profile.stats?.attributes?.xp || 0;
        const xpToNextLevel = this.calculateXpToNextLevel(level);
        const progress = (xp / xpToNextLevel) * 100;

        return {
            level,
            xp,
            xpToNextLevel,
            progressPercentage: Math.round(progress * 100) / 100,
            book_level: profile.stats?.attributes?.book_level || 0,
            book_xp: profile.stats?.attributes?.book_xp || 0,
            accountLevel: profile.stats?.attributes?.accountLevel || level
        };
    }
}

module.exports = EXPService;
