const DatabaseManager = require('../../manager/DatabaseManager');
const LoggerService = require('../logger/LoggerService');
const { Errors } = require('../error/Errorss');
const fs = require('fs');
const path = require('path');

class MCPService {
    static createMCPResponse(profileId, profile, profileChanges, baseRevision) {
        return {
            profileRevision: profile.rvn || 0,
            profileId: profileId,
            profileChangesBaseRevision: baseRevision,
            profileChanges: profileChanges,
            profileCommandRevision: profile.commandRevision || 0,
            serverTime: new Date().toISOString(),
            responseVersion: 1
        };
    }

    static async queryProfile(accountId, profileId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        let profileChanges = [];
        
        if (rvn !== baseRevision) {
            profileChanges = [{
                changeType: 'fullProfileUpdate',
                profile: profile
            }];
        }
        
        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async setAffiliateName(accountId, affiliateName, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'common_core');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        profile.stats.attributes.mtx_affiliate = affiliateName || '';
        profile.stats.attributes.mtx_affiliate_set_time = new Date().toISOString();

        profileChanges.push({
            changeType: 'statModified',
            name: 'mtx_affiliate',
            value: profile.stats.attributes.mtx_affiliate
        });

        profileChanges.push({
            changeType: 'statModified',
            name: 'mtx_affiliate_set_time',
            value: profile.stats.attributes.mtx_affiliate_set_time
        });

        await DatabaseManager.saveProfile(accountId, 'common_core', profile);

        return this.createMCPResponse('common_core', profile, profileChanges, baseRevision);
    }

    static async setItemFavoriteStatus(accountId, profileId, targetItemIds, bFavorite, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        const itemIds = Array.isArray(targetItemIds) ? targetItemIds : [targetItemIds];
        
        for (const itemId of itemIds) {
            if (profile.items[itemId]) {
                if (!profile.items[itemId].attributes) {
                    profile.items[itemId].attributes = {};
                }
                profile.items[itemId].attributes.favorite = bFavorite;

                profileChanges.push({
                    changeType: 'itemAttrChanged',
                    itemId: itemId,
                    attributeName: 'favorite',
                    attributeValue: bFavorite
                });
            }
        }

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async markItemSeen(accountId, profileId, itemIds = [], rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        for (const itemId of itemIds) {
            if (profile.items[itemId]) {
                if (!profile.items[itemId].attributes) {
                    profile.items[itemId].attributes = {};
                }
                profile.items[itemId].attributes.item_seen = true;

                profileChanges.push({
                    changeType: 'itemAttrChanged',
                    itemId: itemId,
                    attributeName: 'item_seen',
                    attributeValue: true
                });
            }
        }

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async equipBattleRoyaleCustomization(accountId, slotName, itemToSlot, indexWithinSlot = 0, variantUpdates = [], rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        const statName = `favorite_${slotName.toLowerCase()}`;
        
        if (slotName.toLowerCase() === 'dance' || slotName.toLowerCase() === 'itemwraps') {
            if (!Array.isArray(profile.stats.attributes[statName])) {
                profile.stats.attributes[statName] = ['', '', '', '', '', ''];
            }
            profile.stats.attributes[statName][indexWithinSlot] = itemToSlot || '';
        } else {
            profile.stats.attributes[statName] = itemToSlot || '';
        }

        if (variantUpdates && variantUpdates.length > 0 && itemToSlot) {
            for (const itemId in profile.items) {
                if (profile.items[itemId].templateId === itemToSlot) {
                    if (!profile.items[itemId].attributes.variants) {
                        profile.items[itemId].attributes.variants = [];
                    }

                    variantUpdates.forEach(variantUpdate => {
                        const existingVariantIndex = profile.items[itemId].attributes.variants.findIndex(
                            v => v.channel === variantUpdate.channel
                        );

                        if (existingVariantIndex !== -1) {
                            profile.items[itemId].attributes.variants[existingVariantIndex].active = variantUpdate.active;
                        } else {
                            profile.items[itemId].attributes.variants.push({
                                channel: variantUpdate.channel,
                                active: variantUpdate.active,
                                owned: []
                            });
                        }
                    });

                    profileChanges.push({
                        changeType: 'itemAttrChanged',
                        itemId: itemId,
                        attributeName: 'variants',
                        attributeValue: profile.items[itemId].attributes.variants
                    });
                }
            }
        }

        profileChanges.push({
            changeType: 'statModified',
            name: statName,
            value: profile.stats.attributes[statName]
        });

        await DatabaseManager.saveProfile(accountId, 'athena', profile);

        return this.createMCPResponse('athena', profile, profileChanges, baseRevision);
    }

    static async setCosmeticLockerSlot(accountId, category, itemToSlot, slotIndex = 0, variantUpdates = [], rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        const statName = `favorite_${category.toLowerCase()}`;
        
        if (category.toLowerCase() === 'dance' || category.toLowerCase() === 'itemwraps') {
            if (!Array.isArray(profile.stats.attributes[statName])) {
                profile.stats.attributes[statName] = ['', '', '', '', '', ''];
            }
            profile.stats.attributes[statName][slotIndex] = itemToSlot || '';
        } else {
            profile.stats.attributes[statName] = itemToSlot || '';
        }

        if (variantUpdates && variantUpdates.length > 0 && itemToSlot) {
            for (const itemId in profile.items) {
                if (profile.items[itemId].templateId === itemToSlot) {
                    if (!profile.items[itemId].attributes.variants) {
                        profile.items[itemId].attributes.variants = [];
                    }

                    variantUpdates.forEach(variantUpdate => {
                        const existingVariantIndex = profile.items[itemId].attributes.variants.findIndex(
                            v => v.channel === variantUpdate.channel
                        );

                        if (existingVariantIndex !== -1) {
                            profile.items[itemId].attributes.variants[existingVariantIndex].active = variantUpdate.active;
                        } else {
                            profile.items[itemId].attributes.variants.push({
                                channel: variantUpdate.channel,
                                active: variantUpdate.active,
                                owned: []
                            });
                        }
                    });
                }
            }
        }

        profileChanges.push({
            changeType: 'statModified',
            name: statName,
            value: profile.stats.attributes[statName]
        });

        await DatabaseManager.saveProfile(accountId, 'athena', profile);

        return this.createMCPResponse('athena', profile, profileChanges, baseRevision);
    }

    static async setCosmeticLockerBanner(accountId, bannerIconTemplate, bannerColorTemplate, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        profile.stats.attributes.banner_icon = bannerIconTemplate || '';
        profile.stats.attributes.banner_color = bannerColorTemplate || '';

        profileChanges.push({
            changeType: 'statModified',
            name: 'banner_icon',
            value: profile.stats.attributes.banner_icon
        });

        profileChanges.push({
            changeType: 'statModified',
            name: 'banner_color',
            value: profile.stats.attributes.banner_color
        });

        await DatabaseManager.saveProfile(accountId, 'athena', profile);

        return this.createMCPResponse('athena', profile, profileChanges, baseRevision);
    }

    static async setCosmeticLockerName(accountId, lockerName, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        profile.stats.attributes.loadout_name = lockerName || '';

        profileChanges.push({
            changeType: 'statModified',
            name: 'loadout_name',
            value: profile.stats.attributes.loadout_name
        });

        await DatabaseManager.saveProfile(accountId, 'athena', profile);

        return this.createMCPResponse('athena', profile, profileChanges, baseRevision);
    }

    static async purchaseCatalogEntry(accountId, offerId, purchaseQuantity = 1, currency = 'MtxCurrency', expectedTotalPrice, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'common_core');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        const vbucks = profile.items.Currency ? profile.items.Currency.quantity : 0;

        const catalogPath = path.join(__dirname, '..', '..', '..', 'content', 'catalog.json');
        let catalog = {};
        
        if (fs.existsSync(catalogPath)) {
            catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        }

        let catalogEntry = null;
        if (catalog.storefronts) {
            for (const storefront of catalog.storefronts) {
                const entry = storefront.catalogEntries.find(e => e.offerId === offerId);
                if (entry) {
                    catalogEntry = entry;
                    break;
                }
            }
        }

        if (!catalogEntry) {
            throw Errors.GameCatalog.itemNotFound(offerId);
        }

        const price = catalogEntry.prices[0].finalPrice * purchaseQuantity;

        if (expectedTotalPrice && price !== expectedTotalPrice) {
            throw Errors.GameCatalog.priceMismatch(expectedTotalPrice, price);
        }

        if (vbucks < price) {
            throw Errors.MCP.insufficientCurrency(price, vbucks);
        }

        profile.items.Currency.quantity -= price;

        profileChanges.push({
            changeType: 'itemQuantityChanged',
            itemId: 'Currency',
            quantity: profile.items.Currency.quantity
        });

        const athenaProfile = await DatabaseManager.getProfile(accountId, 'athena');
        if (!athenaProfile) throw Errors.MCP.profileNotFound(accountId);
        
        const lootResult = [];

        if (catalogEntry.itemGrants) {
            for (const grant of catalogEntry.itemGrants) {
                const itemId = grant.templateId;
                const itemData = {
                    templateId: grant.templateId,
                    attributes: {
                        max_level_bonus: 0,
                        level: 1,
                        item_seen: false,
                        xp: 0,
                        variants: [],
                        favorite: false
                    },
                    quantity: grant.quantity || 1
                };

                athenaProfile.items[itemId] = itemData;

                lootResult.push({
                    itemType: grant.templateId,
                    itemGuid: itemId,
                    itemProfile: 'athena',
                    quantity: grant.quantity || 1
                });

                profileChanges.push({
                    changeType: 'itemAdded',
                    itemId: itemId,
                    item: itemData
                });
            }
        }

        await DatabaseManager.saveProfile(accountId, 'athena', athenaProfile);

        if (!profile.stats.attributes.mtx_purchase_history) {
            profile.stats.attributes.mtx_purchase_history = {
                refundsUsed: 0,
                refundCredits: 3,
                purchases: []
            };
        }

        const purchaseRecord = {
            purchaseId: `v2:/${offerId}`,
            offerId: offerId,
            purchaseDate: new Date().toISOString(),
            freeRefundEligible: true,
            fulfillments: [],
            lootResult: lootResult,
            totalMtxPaid: price,
            metadata: {},
            gameContext: ''
        };

        profile.stats.attributes.mtx_purchase_history.purchases.push(purchaseRecord);

        await DatabaseManager.saveProfile(accountId, 'common_core', profile);

        LoggerService.log('success', `Purchase completed: ${accountId} bought ${offerId} for ${price} V-Bucks`);

        return this.createMCPResponse('common_core', profile, profileChanges, baseRevision);
    }

    static async giftCatalogEntry(accountId, receiverAccountIds, offerId, personalMessage = '', giftWrapTemplateId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'common_core');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        if (personalMessage && personalMessage.length > 100) {
            throw Errors.MCP.personalMessageTooLong();
        }

        if (!profile.stats.attributes.allowed_to_send_gifts) {
            throw Errors.MCP.operationForbidden();
        }

        await DatabaseManager.saveProfile(accountId, 'common_core', profile);

        return this.createMCPResponse('common_core', profile, profileChanges, baseRevision);
    }

    static async removeGiftBox(accountId, giftBoxItemId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'common_core');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        await DatabaseManager.saveProfile(accountId, 'common_core', profile);

        return this.createMCPResponse('common_core', profile, profileChanges, baseRevision);
    }

    static async setPartyAssistQuest(accountId, questToPinAsPartyAssist, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        profile.stats.attributes.party_assist_quest = questToPinAsPartyAssist || '';

        profileChanges.push({
            changeType: 'statModified',
            name: 'party_assist_quest',
            value: profile.stats.attributes.party_assist_quest
        });

        await DatabaseManager.saveProfile(accountId, 'athena', profile);

        return this.createMCPResponse('athena', profile, profileChanges, baseRevision);
    }

    static async setHomebaseBanner(accountId, profileId, homebaseBannerIconId, homebaseBannerColorId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        if (profileId === 'profile0' || profileId === 'campaign') {
            if (!profile.stats.attributes.homebase) {
                profile.stats.attributes.homebase = {};
            }
            profile.stats.attributes.homebase.bannerIconId = homebaseBannerIconId;
            profile.stats.attributes.homebase.bannerColorId = homebaseBannerColorId;

            profileChanges.push({
                changeType: 'statModified',
                name: 'homebase',
                value: profile.stats.attributes.homebase
            });
        } else if (profileId === 'common_public') {
            profile.stats.attributes.banner_icon = homebaseBannerIconId;
            profile.stats.attributes.banner_color = homebaseBannerColorId;

            profileChanges.push({
                changeType: 'statModified',
                name: 'banner_icon',
                value: profile.stats.attributes.banner_icon
            });

            profileChanges.push({
                changeType: 'statModified',
                name: 'banner_color',
                value: profile.stats.attributes.banner_color
            });
        }

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async setHomebaseName(accountId, profileId, homebaseName, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        if (profileId === 'profile0' || profileId === 'campaign') {
            if (!profile.stats.attributes.homebase) {
                profile.stats.attributes.homebase = {};
            }
            profile.stats.attributes.homebase.townName = homebaseName;

            profileChanges.push({
                changeType: 'statModified',
                name: 'homebase',
                value: profile.stats.attributes.homebase
            });
        } else if (profileId === 'common_public') {
            profile.stats.attributes.homebase_name = homebaseName;

            profileChanges.push({
                changeType: 'statModified',
                name: 'homebase_name',
                value: profile.stats.attributes.homebase_name
            });
        }

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async claimMfaEnabled(accountId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        if (!profile.stats.attributes.mfa_reward_claimed) {
            profile.stats.attributes.mfa_reward_claimed = true;

            const mfaRewardItem = {
                templateId: 'AthenaDance:EID_BoogieDown',
                attributes: {
                    max_level_bonus: 0,
                    level: 1,
                    item_seen: false,
                    xp: 0,
                    variants: [],
                    favorite: false
                },
                quantity: 1
            };

            const itemId = DatabaseManager.generateItemId();
            profile.items[itemId] = mfaRewardItem;

            profileChanges.push({
                changeType: 'statModified',
                name: 'mfa_reward_claimed',
                value: true
            });

            profileChanges.push({
                changeType: 'itemAdded',
                itemId: itemId,
                item: mfaRewardItem
            });
        }

        await DatabaseManager.saveProfile(accountId, 'athena', profile);

        return this.createMCPResponse('athena', profile, profileChanges, baseRevision);
    }

    static async refundMtxPurchase(accountId, purchaseId, rvn = -1) {
        const result = await DatabaseManager.processPurchaseRefund(accountId, purchaseId);
        
        if (!result.success) {
            throw new Error(result.message);
        }

        const profile = await DatabaseManager.getProfile(accountId, 'common_core');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        profileChanges.push({
            changeType: 'itemQuantityChanged',
            itemId: 'Currency',
            quantity: result.newBalance
        });

        return this.createMCPResponse('common_core', profile, profileChanges, baseRevision);
    }

    static async setMtxPlatform(accountId, newPlatform, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'common_core');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        profile.stats.attributes.current_mtx_platform = newPlatform || 'EpicPC';

        profileChanges.push({
            changeType: 'statModified',
            name: 'current_mtx_platform',
            value: profile.stats.attributes.current_mtx_platform
        });

        await DatabaseManager.saveProfile(accountId, 'common_core', profile);

        return this.createMCPResponse('common_core', profile, profileChanges, baseRevision);
    }

    static async setReceiveGiftsEnabled(accountId, bReceiveGifts, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'common_core');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        profile.stats.attributes.allowed_to_receive_gifts = bReceiveGifts !== false;

        profileChanges.push({
            changeType: 'statModified',
            name: 'allowed_to_receive_gifts',
            value: profile.stats.attributes.allowed_to_receive_gifts
        });

        await DatabaseManager.saveProfile(accountId, 'common_core', profile);

        return this.createMCPResponse('common_core', profile, profileChanges, baseRevision);
    }

    static async setItemArchivedStatusBatch(accountId, profileId, itemIds, archived, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        for (const itemId of itemIds) {
            if (profile.items[itemId]) {
                if (!profile.items[itemId].attributes) {
                    profile.items[itemId].attributes = {};
                }
                profile.items[itemId].attributes.archived = archived;

                profileChanges.push({
                    changeType: 'itemAttrChanged',
                    itemId: itemId,
                    attributeName: 'archived',
                    attributeValue: archived
                });
            }
        }

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async bulkEquipBattleRoyaleCustomization(accountId, loadoutData, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        if (loadoutData && loadoutData.slots) {
            for (const slotKey in loadoutData.slots) {
                const slot = loadoutData.slots[slotKey];
                const statName = `favorite_${slotKey.toLowerCase()}`;
                
                if (slotKey.toLowerCase() === 'dance' || slotKey.toLowerCase() === 'itemwraps') {
                    if (!Array.isArray(profile.stats.attributes[statName])) {
                        profile.stats.attributes[statName] = ['', '', '', '', '', ''];
                    }
                    if (slot.items && Array.isArray(slot.items)) {
                        slot.items.forEach((item, index) => {
                            profile.stats.attributes[statName][index] = item || '';
                        });
                    }
                } else {
                    profile.stats.attributes[statName] = slot.item || '';
                }

                profileChanges.push({
                    changeType: 'statModified',
                    name: statName,
                    value: profile.stats.attributes[statName]
                });
            }
        }

        await DatabaseManager.saveProfile(accountId, 'athena', profile);

        return this.createMCPResponse('athena', profile, profileChanges, baseRevision);
    }

    static async setActiveArchetype(accountId, profileId, archetypeGroup, archetype, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        if (!profile.stats.attributes.loadout_archetype_values) {
            profile.stats.attributes.loadout_archetype_values = {};
        }

        profile.stats.attributes.loadout_archetype_values[archetypeGroup] = archetype || '';

        profileChanges.push({
            changeType: 'statModified',
            name: 'loadout_archetype_values',
            value: profile.stats.attributes.loadout_archetype_values
        });

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async setHeroCosmeticVariants(accountId, profileId, heroItem, outfitVariants, backblingVariants, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        if (profile.items[heroItem]) {
            if (!profile.items[heroItem].attributes) {
                profile.items[heroItem].attributes = {};
            }

            profile.items[heroItem].attributes.outfitvariants = outfitVariants || [];
            profile.items[heroItem].attributes.backblingvariants = backblingVariants || [];

            profileChanges.push({
                changeType: 'itemAttrChanged',
                itemId: heroItem,
                attributeName: 'outfitvariants',
                attributeValue: profile.items[heroItem].attributes.outfitvariants
            });

            profileChanges.push({
                changeType: 'itemAttrChanged',
                itemId: heroItem,
                attributeName: 'backblingvariants',
                attributeValue: profile.items[heroItem].attributes.backblingvariants
            });

            await DatabaseManager.saveProfile(accountId, profileId, profile);
        }

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async claimLoginReward(accountId, profileId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async populatePrerolledOffers(accountId, profileId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async deleteIsland(accountId, profileId, islandId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        if (profile.items[islandId]) {
            delete profile.items[islandId];

            profileChanges.push({
                changeType: 'itemRemoved',
                itemId: islandId
            });

            await DatabaseManager.saveProfile(accountId, profileId, profile);
        }

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async createIsland(accountId, profileId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        const islandId = DatabaseManager.generateItemId();
        const newIsland = {
            templateId: 'CreativeIsland:defaultisland',
            attributes: {
                island_name: 'My Island',
                island_type: 'creative:island',
                created_at: new Date().toISOString()
            },
            quantity: 1
        };

        profile.items[islandId] = newIsland;

        profileChanges.push({
            changeType: 'itemAdded',
            itemId: islandId,
            item: newIsland
        });

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async slotItemInCollectionBook(accountId, profileId, itemId, slotId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }

    static async unslotItemFromCollectionBook(accountId, profileId, slotId, rvn = -1) {
        const profile = await DatabaseManager.getProfile(accountId, profileId);
        if (!profile) throw Errors.MCP.profileNotFound(accountId);
        
        const baseRevision = profile.rvn || 0;
        const profileChanges = [];

        await DatabaseManager.saveProfile(accountId, profileId, profile);

        return this.createMCPResponse(profileId, profile, profileChanges, baseRevision);
    }
}

module.exports = MCPService;