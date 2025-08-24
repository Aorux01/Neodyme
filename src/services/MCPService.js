const fs = require('fs');
const path = require('path');
const { Errors } = require('../errors/errors');
const Functions = require('../utils/functions');
const LoggerService = require('../utils/logger');
const ConfigService = require('./ConfigService');

class MCPService {
    constructor(accountId) {
        this.accountId = accountId;
        this.profilesPath = path.join(ConfigService.getPlayersDirectory(), accountId);
        this.profiles = {};
        
        // Assurer que le répertoire des joueurs existe
        this.ensurePlayersDirectory();
    }

    // Assurer que la structure des répertoires existe
    ensurePlayersDirectory() {
        const playersDir = ConfigService.getPlayersDirectory();
        const playersJsonPath = path.join(ConfigService.getDatabasePath(), 'players.json');
        
        // Créer le répertoire data/players s'il n'existe pas
        if (!fs.existsSync(playersDir)) {
            fs.mkdirSync(playersDir, { recursive: true });
        }
        
        // Créer le fichier data/players.json s'il n'existe pas
        if (!fs.existsSync(playersJsonPath)) {
            fs.writeFileSync(playersJsonPath, JSON.stringify([], null, 2));
        }
        
        // Créer le répertoire du joueur s'il n'existe pas
        if (!fs.existsSync(this.profilesPath)) {
            fs.mkdirSync(this.profilesPath, { recursive: true });
        }
    }

    // Enregistrer un joueur dans data/players.json
    static async registerPlayerInList(accountId, displayName, email) {
        try {
            const playersJsonPath = path.join(ConfigService.getDatabasePath(), 'players.json');
            let players = [];
            
            if (fs.existsSync(playersJsonPath)) {
                players = JSON.parse(fs.readFileSync(playersJsonPath, 'utf8'));
            }
            
            // Vérifier si le joueur existe déjà
            const existingPlayer = players.find(p => p.accountId === accountId);
            if (!existingPlayer) {
                players.push({
                    accountId,
                    displayName,
                    email,
                    created: new Date().toISOString(),
                    lastLogin: new Date().toISOString()
                });
                
                fs.writeFileSync(playersJsonPath, JSON.stringify(players, null, 2));
                LoggerService.log('info', `Player registered in players.json: ${displayName}`);
            }
        } catch (error) {
            LoggerService.log('error', `Failed to register player in list: ${error.message}`);
        }
    }

    // Mettre à jour la dernière connexion dans data/players.json
    static async updatePlayerLastLogin(accountId) {
        try {
            const playersJsonPath = path.join(ConfigService.getDatabasePath(), 'players.json');
            
            if (fs.existsSync(playersJsonPath)) {
                const players = JSON.parse(fs.readFileSync(playersJsonPath, 'utf8'));
                const player = players.find(p => p.accountId === accountId);
                
                if (player) {
                    player.lastLogin = new Date().toISOString();
                    fs.writeFileSync(playersJsonPath, JSON.stringify(players, null, 2));
                }
            }
        } catch (error) {
            LoggerService.log('error', `Failed to update player last login: ${error.message}`);
        }
    }

    // Récupérer un profil
    async getProfile(profileId) {
        try {
            if (this.profiles[profileId]) {
                return this.profiles[profileId];
            }

            const profilePath = path.join(this.profilesPath, `${profileId}.json`);
            
            if (!fs.existsSync(profilePath)) {
                // Créer un profil par défaut
                const defaultProfile = this.createDefaultProfile(profileId);
                await this.saveProfile(profileId, defaultProfile);
                return defaultProfile;
            }

            const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            this.profiles[profileId] = profileData;
            
            return profileData;
        } catch (error) {
            LoggerService.log('error', `Failed to get profile ${profileId}: ${error.message}`);
            throw Errors.MCP.profileLoadFailed(profileId);
        }
    }

    // Sauvegarder un profil
    async saveProfile(profileId, profileData) {
        try {
            // Créer le répertoire si nécessaire
            if (!fs.existsSync(this.profilesPath)) {
                fs.mkdirSync(this.profilesPath, { recursive: true });
            }

            const profilePath = path.join(this.profilesPath, `${profileId}.json`);
            fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2), 'utf8');
            
            // Mettre en cache
            this.profiles[profileId] = profileData;
            
            LoggerService.log('debug', `Profile ${profileId} saved for account ${this.accountId}`);
        } catch (error) {
            LoggerService.log('error', `Failed to save profile ${profileId}: ${error.message}`);
            throw Errors.MCP.profileSaveFailed(profileId);
        }
    }

    // Récupérer tous les profils
    async getAllProfiles() {
        const profileIds = ['athena', 'common_core', 'profile0', 'campaign', 'theater0'];
        const profiles = {};

        for (const profileId of profileIds) {
            profiles[profileId] = await this.getProfile(profileId);
        }

        return profiles;
    }

    // Sauvegarder tous les profils
    async saveAllProfiles(profiles) {
        for (const [profileId, profileData] of Object.entries(profiles)) {
            await this.saveProfile(profileId, profileData);
        }
    }

    // Créer un profil par défaut
    createDefaultProfile(profileId) {
        const now = new Date().toISOString();
        
        const baseProfile = {
            _id: this.accountId,
            Created: now,
            Updated: now,
            rvn: 0,
            wipeNumber: 1,
            accountId: this.accountId,
            profileId: profileId,
            version: "neodyme_1.0",
            stats: {
                attributes: {}
            },
            items: {},
            commandRevision: 0
        };

        switch (profileId) {
            case 'athena':
                return this.createAthenaProfile(baseProfile);
            case 'common_core':
                return this.createCommonCoreProfile(baseProfile);
            case 'profile0':
                return this.createProfile0(baseProfile);
            case 'campaign':
                return this.createCampaignProfile(baseProfile);
            case 'theater0':
                return this.createTheaterProfile(baseProfile);
            default:
                return baseProfile;
        }
    }

    // Créer le profil Athena (Battle Royale)
    createAthenaProfile(baseProfile) {
        baseProfile.stats.attributes = {
            past_seasons: [],
            season_match_boost: 0,
            loadouts: ["sandbox_loadout"],
            use_random_loadout: false,
            mfa_reward_claimed: true,
            rested_xp_overflow: 0,
            level: 1,
            xp: 0,
            season_num: 2,
            season_update: 0,
            book_level: 1,
            book_xp: 0,
            book_purchased: false,
            lifetime_wins: 0,
            party_assist_quest: "",
            purchased_battle_pass_tier_offers: {},
            rested_xp: 0,
            rested_xp_mult: 1,
            rested_xp_exchange: 1,
            inventory_limit_bonus: 0,
            daily_rewards: {},
            competitive_identity: {},
            season_friend_match_boost: 0,
            active_loadout_index: 0,
            last_applied_loadout: "sandbox_loadout",
            favorite_character: "",
            favorite_backpack: "",
            favorite_pickaxe: "DefaultPickaxe",
            favorite_glider: "DefaultGlider",
            favorite_skydivecontrail: "",
            favorite_musicpack: "",
            favorite_loadingscreen: "",
            favorite_dance: ["", "", "", "", "", ""],
            favorite_itemwraps: ["", "", "", "", "", "", ""],
            banner_icon: "StandardBanner1",
            banner_color: "DefaultColor1",
            battlestars: 0,
            battlestars_season_total: 0,
            alien_style_points: 0
        };

        // Créer le loadout par défaut
        const loadoutId = "sandbox_loadout";
        baseProfile.items[loadoutId] = {
            templateId: "CosmeticLocker:cosmeticlocker_athena",
            attributes: {
                locker_slots_data: {
                    slots: {
                        Character: { items: [""] },
                        Backpack: { items: [""] },
                        Pickaxe: { items: ["DefaultPickaxe"] },
                        Glider: { items: ["DefaultGlider"] },
                        SkyDiveContrail: { items: [""] },
                        MusicPack: { items: [""] },
                        LoadingScreen: { items: [""] },
                        Dance: { items: ["", "", "", "", "", ""] },
                        ItemWrap: { items: ["", "", "", "", "", "", ""] }
                    }
                },
                use_random_loadout: false,
                banner_icon_template: "StandardBanner1",
                banner_color_template: "DefaultColor1",
                item_seen: false
            },
            quantity: 1
        };

        return baseProfile;
    }

    // Créer le profil Common Core
    createCommonCoreProfile(baseProfile) {
        const now = new Date().toISOString();
        
        baseProfile.stats.attributes = {
            survey_data: {},
            personal_offers: {},
            intro_game_played: true,
            import_friends_claimed: {},
            mtx_purchase_history: {
                refundsUsed: 0,
                refundCredits: 3
            },
            undo_cooldowns: [],
            mtx_affiliate_set_time: now,
            inventory_limit_bonus: 0,
            current_mtx_platform: "EpicPC",
            mtx_affiliate: "",
            weekly_purchases: {},
            daily_purchases: {},
            ban_history: {},
            in_app_purchases: {},
            permissions: [],
            undo_timeout: "9999-12-31T23:59:59.999Z",
            monthly_purchases: {},
            allowed_to_send_gifts: true,
            mfa_enabled: true,
            allowed_to_receive_gifts: true,
            gift_history: {}
        };

        // Ajouter de la monnaie par défaut
        const currencyId = Functions.MakeID();
        baseProfile.items[currencyId] = {
            templateId: "Currency:MtxCurrency",
            attributes: {
                platform: "shared"
            },
            quantity: 0
        };

        return baseProfile;
    }

    // Créer le profil Profile0 (STW legacy)
    createProfile0(baseProfile) {
        baseProfile.stats.attributes = {
            collection_book: {},
            quest_manager: {},
            research: {},
            tutorials_completed: [],
            node_costs: {},
            twitch_prime_linked: false,
            client_settings: {},
            homebase: {
                townName: "",
                bannerIconId: "StandardBanner1",
                bannerColorId: "DefaultColor1"
            }
        };

        return baseProfile;
    }

    // Créer le profil Campaign (STW)
    createCampaignProfile(baseProfile) {
        baseProfile.stats.attributes = {
            collection_book: {
                maxBookXpLevelAchieved: 1
            },
            research: {
                research_levels: {}
            },
            quest_manager: {
                dailyLoginInterval: now,
                dailyQuestRerolls: 1
            },
            inventory_limit_bonus: 0,
            daily_rewards: {},
            gameplay_stats: [],
            missions: {},
            selected_hero_loadout: "",
            homebase: {
                townName: "",
                bannerIconId: "StandardBanner1",
                bannerColorId: "DefaultColor1"
            },
            tutorials_completed: []
        };

        return baseProfile;
    }

    // Créer le profil Theater
    createTheaterProfile(baseProfile) {
        baseProfile.stats.attributes = {
            theater_purchased: false,
            pieces_set: [],
            user_options: {},
            party_assist_quest: "",
            gameplay_stats: [],
            islands: {},
            plot_data: {}
        };

        return baseProfile;
    }

    // Incrémenter la révision d'un profil
    incrementRevision(profile) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.Updated = new Date().toISOString();
    }

    // Créer une réponse MCP
    createMCPResponse(profile, req, changes = [], notifications = []) {
        const memory = this.getVersionInfo(req);
        const queryRevision = parseInt(req.query.rvn) || -1;
        const profileRevisionCheck = memory.build >= 12.20 ? profile.commandRevision : profile.rvn;

        // Si la révision ne correspond pas, renvoyer le profil complet
        if (queryRevision !== profileRevisionCheck) {
            changes = [{
                changeType: "fullProfileUpdate",
                profile: profile
            }];
        }

        return {
            profileRevision: profile.rvn || 0,
            profileId: req.query.profileId,
            profileChangesBaseRevision: profile.rvn || 0,
            profileChanges: changes,
            notifications: notifications,
            profileCommandRevision: profile.commandRevision || 0,
            serverTime: new Date().toISOString(),
            responseVersion: 1
        };
    }

    // Obtenir les informations de version
    getVersionInfo(req) {
        const userAgent = req.headers['user-agent'] || '';
        const buildMatch = userAgent.match(/\+\+Fortnite\+Release-(\d+)\.(\d+)/);
        
        if (buildMatch) {
            const major = parseInt(buildMatch[1]);
            const minor = parseInt(buildMatch[2]);
            return {
                build: parseFloat(`${major}.${minor}`),
                season: this.calculateSeason(major, minor)
            };
        }

        return { build: 2.0, season: 2 };
    }

    // Calculer la saison basée sur la version
    calculateSeason(major, minor) {
        if (major >= 19) return 19;
        if (major >= 18) return 18;
        if (major >= 17) return 17;
        if (major >= 16) return 16;
        if (major >= 15) return 15;
        if (major >= 14) return 14;
        if (major >= 13) return 13;
        if (major >= 12) return 12;
        if (major >= 11) return 11;
        if (major >= 10) return 10;
        if (major >= 9) return 9;
        if (major >= 8) return 8;
        if (major >= 7) return 7;
        if (major >= 6) return 6;
        if (major >= 5) return 5;
        if (major >= 4) return 4;
        if (major >= 3) return 3;
        return 2;
    }

    // Gestion du gestionnaire de quêtes
    ensureQuestManager(profile) {
        if (!profile.stats.attributes.quest_manager) {
            profile.stats.attributes.quest_manager = {
                dailyLoginInterval: new Date().toISOString(),
                dailyQuestRerolls: 1
            };
        }
    }

    // Nettoyer les quêtes expirées
    cleanupExpiredQuests(profile, currentSeason) {
        const removedQuests = [];
        
        if (!profile.items) return removedQuests;

        for (const [itemId, item] of Object.entries(profile.items)) {
            if (item.templateId.includes('quest:') && item.attributes.quest_season !== currentSeason) {
                delete profile.items[itemId];
                removedQuests.push(itemId);
            }
        }

        return removedQuests;
    }

    // Vérifier si une quête quotidienne doit être accordée
    async shouldGrantDailyQuest(profile) {
        const lastLogin = profile.stats.attributes.quest_manager?.dailyLoginInterval;
        if (!lastLogin) return true;

        const lastLoginDate = new Date(lastLogin);
        const now = new Date();
        const hoursDiff = (now - lastLoginDate) / (1000 * 60 * 60);

        return hoursDiff >= 24;
    }

    // Obtenir une quête quotidienne aléatoire
    getRandomDailyQuest(dailyQuests, profile) {
        if (!dailyQuests.length) return null;

        // Filtrer les quêtes déjà possédées
        const availableQuests = dailyQuests.filter(quest => {
            if (!profile.items) return true;
            
            return !Object.values(profile.items).some(item => 
                item.templateId.toLowerCase() === quest.templateId.toLowerCase()
            );
        });

        if (!availableQuests.length) return null;

        return availableQuests[Math.floor(Math.random() * availableQuests.length)];
    }

    // Créer un item de quête
    createQuestItem(questData) {
        const quest = {
            templateId: questData.templateId,
            attributes: {
                creation_time: new Date().toISOString(),
                level: -1,
                item_seen: false,
                sent_new_notification: false,
                xp_reward_scalar: 1,
                quest_state: "Active",
                last_state_change_time: new Date().toISOString(),
                max_level_bonus: 0,
                xp: 0,
                favorite: false
            },
            quantity: 1
        };

        // Ajouter les objectifs si définis
        if (questData.objectives) {
            for (const [objName, objValue] of Object.entries(questData.objectives)) {
                quest.attributes[`completion_${objName}`] = 0;
            }
        }

        return quest;
    }
}

module.exports = MCPService;