const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { Errors } = require('../errors/errors');

class ProfileService {
    constructor() {
        this.dataPath = path.join(process.cwd(), 'data');
        this.playersPath = path.join(this.dataPath, 'players');
        this.profileTypes = [
            'athena',
            'common_core',
            'common_public',
            'campaign',
            'metadata',
            'outpost0',
            'theater0',
            'collection_book_people0',
            'collection_book_schematics0',
            'creative',
            'profile0'
        ];
    }

    async getProfile(accountId, profileId, rvn = -1) {
        try {
            const profilePath = path.join(this.playersPath, accountId, `${profileId}.json`);
            const data = await fs.readFile(profilePath, 'utf8');
            const profile = JSON.parse(data);

            // Update revision if specified
            if (rvn !== -1) {
                profile.rvn = rvn;
                profile.commandRevision = rvn;
            }

            return profile;
        } catch (error) {
            // If profile doesn't exist, create it from template
            if (error.code === 'ENOENT') {
                return this.createProfileFromTemplate(accountId, profileId);
            }
            throw error;
        }
    }

    async createProfileFromTemplate(accountId, profileId) {
        try {
            const templatePath = path.join(process.cwd(), 'template', `${profileId}.json`);
            const templateData = await fs.readFile(templatePath, 'utf8');
            const profile = JSON.parse(templateData);

            // Update profile with account info
            profile._id = accountId;
            profile.accountId = accountId;
            profile.profileId = profileId;
            profile.created = new Date().toISOString();
            profile.updated = new Date().toISOString();
            profile.rvn = 1;
            profile.wipeNumber = 1;
            profile.commandRevision = 1;

            // Save the new profile
            const profilePath = path.join(this.playersPath, accountId, `${profileId}.json`);
            await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));

            return profile;
        } catch (error) {
            throw Errors.MCP.profileNotFound(accountId);
        }
    }

    async saveProfile(accountId, profileId, profile) {
        try {
            const profilePath = path.join(this.playersPath, accountId, `${profileId}.json`);
            profile.updated = new Date().toISOString();
            await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
            return profile;
        } catch (error) {
            throw error;
        }
    }

    async queryProfile(accountId, profileId) {
        const profile = await this.getProfile(accountId, profileId);
        
        return {
            profileRevision: profile.rvn || 1,
            profileId: profileId,
            profileChangesBaseRevision: profile.rvn || 1,
            profileChanges: [],
            notifications: [],
            profileCommandRevision: profile.commandRevision || 1,
            serverTime: new Date().toISOString(),
            responseVersion: 1
        };
    }

    generateItemId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async grantItem(accountId, profileId, templateId, quantity = 1, attributes = {}) {
        const profile = await this.getProfile(accountId, profileId);
        const itemId = this.generateItemId();

        const item = {
            templateId: templateId,
            attributes: {
                max_level_bonus: 0,
                level: 1,
                item_seen: false,
                xp: 0,
                variants: [],
                favorite: false,
                ...attributes
            },
            quantity: quantity
        };

        if (!profile.items) profile.items = {};
        profile.items[itemId] = item;

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, profileId, profile);

        return {
            itemId,
            item,
            profileChanges: [{
                changeType: "itemAdded",
                itemId: itemId,
                item: item
            }]
        };
    }

    async removeItem(accountId, profileId, itemId) {
        const profile = await this.getProfile(accountId, profileId);

        if (!profile.items || !profile.items[itemId]) {
            throw Errors.MCP.itemNotFound();
        }

        const removedItem = profile.items[itemId];
        delete profile.items[itemId];

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, profileId, profile);

        return {
            itemId,
            removedItem,
            profileChanges: [{
                changeType: "itemRemoved",
                itemId: itemId
            }]
        };
    }

    async updateItemQuantity(accountId, profileId, itemId, quantity) {
        const profile = await this.getProfile(accountId, profileId);

        if (!profile.items || !profile.items[itemId]) {
            throw Errors.MCP.itemNotFound();
        }

        const oldQuantity = profile.items[itemId].quantity;
        profile.items[itemId].quantity = quantity;

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, profileId, profile);

        return {
            profileChanges: [{
                changeType: "itemQuantityChanged",
                itemId: itemId,
                quantity: quantity
            }]
        };
    }

    async updateItemAttribute(accountId, profileId, itemId, attributeName, attributeValue) {
        const profile = await this.getProfile(accountId, profileId);

        if (!profile.items || !profile.items[itemId]) {
            throw Errors.MCP.itemNotFound();
        }

        if (!profile.items[itemId].attributes) {
            profile.items[itemId].attributes = {};
        }

        profile.items[itemId].attributes[attributeName] = attributeValue;

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, profileId, profile);

        return {
            profileChanges: [{
                changeType: "itemAttributeChanged",
                itemId: itemId,
                attributeName: attributeName,
                attributeValue: attributeValue
            }]
        };
    }

    async getStats(accountId, profileId) {
        const profile = await this.getProfile(accountId, profileId);
        return profile.stats || { attributes: {} };
    }

    async updateStats(accountId, profileId, stats) {
        const profile = await this.getProfile(accountId, profileId);

        if (!profile.stats) {
            profile.stats = { attributes: {} };
        }

        Object.assign(profile.stats.attributes, stats);

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, profileId, profile);

        return {
            profile,
            profileChanges: [{
                changeType: "statModified",
                name: Object.keys(stats)[0],
                value: Object.values(stats)[0]
            }]
        };
    }

    async equipBattleRoyaleCustomization(accountId, slotName, itemToSlot, indexWithinSlot = -1, variantUpdates = []) {
        const profile = await this.getProfile(accountId, 'athena');
        
        if (!profile.stats) {
            profile.stats = { attributes: {} };
        }

        if (!profile.stats.attributes.favorite_character) {
            profile.stats.attributes.favorite_character = "";
        }
        if (!profile.stats.attributes.favorite_backpack) {
            profile.stats.attributes.favorite_backpack = "";
        }
        if (!profile.stats.attributes.favorite_pickaxe) {
            profile.stats.attributes.favorite_pickaxe = "";
        }
        if (!profile.stats.attributes.favorite_glider) {
            profile.stats.attributes.favorite_glider = "";
        }
        if (!profile.stats.attributes.favorite_skydivecontrail) {
            profile.stats.attributes.favorite_skydivecontrail = "";
        }
        if (!profile.stats.attributes.favorite_dance) {
            profile.stats.attributes.favorite_dance = ["", "", "", "", "", ""];
        }
        if (!profile.stats.attributes.favorite_musicpack) {
            profile.stats.attributes.favorite_musicpack = "";
        }
        if (!profile.stats.attributes.favorite_loadingscreen) {
            profile.stats.attributes.favorite_loadingscreen = "";
        }

        const profileChanges = [];

        switch (slotName) {
            case "Character":
                profile.stats.attributes.favorite_character = itemToSlot;
                break;
            case "Backpack":
                profile.stats.attributes.favorite_backpack = itemToSlot;
                break;
            case "Pickaxe":
                profile.stats.attributes.favorite_pickaxe = itemToSlot;
                break;
            case "Glider":
                profile.stats.attributes.favorite_glider = itemToSlot;
                break;
            case "SkyDiveContrail":
                profile.stats.attributes.favorite_skydivecontrail = itemToSlot;
                break;
            case "MusicPack":
                profile.stats.attributes.favorite_musicpack = itemToSlot;
                break;
            case "LoadingScreen":
                profile.stats.attributes.favorite_loadingscreen = itemToSlot;
                break;
            case "Dance":
            case "ItemWrap":
                if (indexWithinSlot >= 0 && indexWithinSlot <= 5) {
                    if (slotName === "Dance") {
                        profile.stats.attributes.favorite_dance[indexWithinSlot] = itemToSlot;
                    } else {
                        if (!profile.stats.attributes.favorite_itemwraps) {
                            profile.stats.attributes.favorite_itemwraps = ["", "", "", "", "", "", ""];
                        }
                        profile.stats.attributes.favorite_itemwraps[indexWithinSlot] = itemToSlot;
                    }
                }
                break;
        }

        profileChanges.push({
            changeType: "statModified",
            name: `favorite_${slotName.toLowerCase()}`,
            value: profile.stats.attributes[`favorite_${slotName.toLowerCase()}`]
        });

        // Handle variant updates
        if (variantUpdates.length > 0 && itemToSlot && profile.items[itemToSlot]) {
            const item = profile.items[itemToSlot];
            if (!item.attributes.variants) {
                item.attributes.variants = [];
            }

            variantUpdates.forEach(update => {
                const existingIndex = item.attributes.variants.findIndex(
                    v => v.channel === update.channel
                );

                if (existingIndex !== -1) {
                    item.attributes.variants[existingIndex] = update;
                } else {
                    item.attributes.variants.push(update);
                }
            });

            profileChanges.push({
                changeType: "itemAttributeChanged",
                itemId: itemToSlot,
                attributeName: "variants",
                attributeValue: item.attributes.variants
            });
        }

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, 'athena', profile);

        return { profileChanges };
    }

    async setPartyAssistQuest(accountId, questItemId) {
        const profile = await this.getProfile(accountId, 'athena');
        
        if (!profile.stats) {
            profile.stats = { attributes: {} };
        }

        profile.stats.attributes.party_assist_quest = questItemId || "";

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, 'athena', profile);

        return {
            profileChanges: [{
                changeType: "statModified",
                name: "party_assist_quest",
                value: questItemId || ""
            }]
        };
    }

    async markItemSeen(accountId, profileId, itemIds) {
        const profile = await this.getProfile(accountId, profileId);
        const profileChanges = [];

        itemIds.forEach(itemId => {
            if (profile.items && profile.items[itemId]) {
                profile.items[itemId].attributes.item_seen = true;
                profileChanges.push({
                    changeType: "itemAttributeChanged",
                    itemId: itemId,
                    attributeName: "item_seen",
                    attributeValue: true
                });
            }
        });

        if (profileChanges.length > 0) {
            profile.rvn = (profile.rvn || 0) + 1;
            profile.commandRevision = (profile.commandRevision || 0) + 1;
            await this.saveProfile(accountId, profileId, profile);
        }

        return { profileChanges };
    }

    async setItemFavoriteStatus(accountId, profileId, targetItemId, bFavorite) {
        const profile = await this.getProfile(accountId, profileId);

        if (!profile.items || !profile.items[targetItemId]) {
            throw Errors.MCP.itemNotFound();
        }

        profile.items[targetItemId].attributes.favorite = bFavorite;

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, profileId, profile);

        return {
            profileChanges: [{
                changeType: "itemAttributeChanged",
                itemId: targetItemId,
                attributeName: "favorite",
                attributeValue: bFavorite
            }]
        };
    }

    async recycleItems(accountId, profileId, itemIds) {
        const profile = await this.getProfile(accountId, profileId);
        const profileChanges = [];
        let totalXpGained = 0;

        itemIds.forEach(itemId => {
            if (profile.items && profile.items[itemId]) {
                const item = profile.items[itemId];
                // Calculate XP based on item rarity
                const xpValue = this.calculateRecycleXP(item);
                totalXpGained += xpValue;

                delete profile.items[itemId];
                profileChanges.push({
                    changeType: "itemRemoved",
                    itemId: itemId
                });
            }
        });

        // Grant XP
        if (totalXpGained > 0 && profile.stats && profile.stats.attributes) {
            const currentXp = profile.stats.attributes.xp || 0;
            profile.stats.attributes.xp = currentXp + totalXpGained;
            
            profileChanges.push({
                changeType: "statModified",
                name: "xp",
                value: profile.stats.attributes.xp
            });
        }

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, profileId, profile);

        return { profileChanges };
    }

    calculateRecycleXP(item) {
        // Simple XP calculation based on rarity
        const rarityXP = {
            'Common': 100,
            'Uncommon': 200,
            'Rare': 300,
            'Epic': 500,
            'Legendary': 1000,
            'Mythic': 2000
        };

        // Try to determine rarity from templateId
        const templateId = item.templateId.toLowerCase();
        if (templateId.includes('legendary')) return rarityXP.Legendary;
        if (templateId.includes('epic')) return rarityXP.Epic;
        if (templateId.includes('rare')) return rarityXP.Rare;
        if (templateId.includes('uncommon')) return rarityXP.Uncommon;
        
        return rarityXP.Common;
    }

    async claimLoginReward(accountId) {
        const profile = await this.getProfile(accountId, 'common_core');
        
        if (!profile.stats) {
            profile.stats = { attributes: {} };
        }

        const lastClaimDate = profile.stats.attributes.last_claim_date;
        const today = new Date().toISOString().split('T')[0];

        if (lastClaimDate === today) {
            return { alreadyClaimed: true, profileChanges: [] };
        }

        // Grant daily reward (e.g., 100 V-Bucks)
        const vbucksReward = 100;
        const currentVbucks = profile.stats.attributes.current_mtx_platform || "EpicPC";
        const vbucksKey = `currency_mtx_platform_${currentVbucks.toLowerCase()}`;
        
        if (!profile.items) profile.items = {};
        
        // Find or create V-Bucks item
        let vbucksItemId = Object.keys(profile.items).find(
            id => profile.items[id].templateId === "Currency:MtxPurchased"
        );

        if (!vbucksItemId) {
            vbucksItemId = this.generateItemId();
            profile.items[vbucksItemId] = {
                templateId: "Currency:MtxPurchased",
                attributes: {
                    platform: currentVbucks
                },
                quantity: 0
            };
        }

        profile.items[vbucksItemId].quantity += vbucksReward;

        const profileChanges = [
            {
                changeType: "itemQuantityChanged",
                itemId: vbucksItemId,
                quantity: profile.items[vbucksItemId].quantity
            },
            {
                changeType: "statModified",
                name: "last_claim_date",
                value: today
            }
        ];

        profile.stats.attributes.last_claim_date = today;
        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;

        await this.saveProfile(accountId, 'common_core', profile);

        return { profileChanges };
    }

    async getAllProfiles(accountId) {
        const profiles = {};
        
        for (const profileType of this.profileTypes) {
            try {
                profiles[profileType] = await this.getProfile(accountId, profileType);
            } catch (error) {
                // Profile doesn't exist, skip
            }
        }

        return profiles;
    }
}

// Export singleton instance
module.exports = new ProfileService();