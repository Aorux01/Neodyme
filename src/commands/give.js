const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');
const https = require('https');

const FIXED_BACKEND_VALUES = {
    'AthenaEmoji': 'AthenaDance',
    'AthenaSpray': 'AthenaDance',
    'AthenaToy': 'AthenaDance',
    'AthenaPetCarrier': 'AthenaBackpack',
    'AthenaPet': 'AthenaBackpack',
    'SparksDrum': 'SparksDrums',
    'SparksMic': 'SparksMicrophone',
    'CosmeticCompanion': 'CosmeticMimosa'
};

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Neodyme/1.0' } }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode} from ${url}`));
                    return;
                }
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Invalid JSON from ${url}: ${e.message}`)); }
            });
        }).on('error', reject);
    });
}

const VALID_ATHENA_TYPES = [
    'AthenaCharacter',
    'AthenaBackpack',
    'AthenaPickaxe',
    'AthenaGlider',
    'AthenaDance',
    'AthenaItemWrap',
    'AthenaSkyDiveContrail',
    'AthenaMusicPack',
    'AthenaLoadingScreen',
    'AthenaBattleBus',
    'AthenaVehicleCosmetics',
    'AthenaPet',
    'AthenaPetCarrier',
    'AthenaSpray',
    'AthenaToy',
    'AthenaEmoji',
];

function register(CM) {
    CM.register('/give', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'vbucks': {
                if (args.length < 3) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/give vbucks <username> <amount>')}`);
                    return;
                }

                const username = args[1];
                const amount = parseInt(args[2]);

                if (isNaN(amount) || amount <= 0) {
                    LoggerService.log('error', `Amount must be a positive number`);
                    return;
                }

                try {
                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const before = await DatabaseManager.getVbucksBalance(account.accountId);
                    await DatabaseManager.addVbucks(account.accountId, amount);
                    const after = await DatabaseManager.getVbucksBalance(account.accountId);

                    LoggerService.log('success', `Gave ${colors.green(amount)} V-Bucks to ${colors.cyan(account.displayName)}`);
                    LoggerService.log('info', `  Balance: ${colors.cyan(before)} -> ${colors.green(after)}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to give V-Bucks: ${error.message}`);
                }
                break;
            }

            case 'item': {
                if (args.length < 3) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/give item <username> <templateId>')}`);
                    LoggerService.log('info', `Example: ${colors.gray('/give item JojoM AthenaCharacter:CID_A_248_Athena_Commando_M_ZombieElastic_E')}`);
                    return;
                }

                const username = args[1];
                const templateId = args[2];

                const typePrefix = templateId.split(':')[0];
                if (!VALID_ATHENA_TYPES.includes(typePrefix)) {
                    LoggerService.log('error', `Invalid item type: ${colors.cyan(typePrefix)}`);
                    LoggerService.log('info', `Valid types: ${VALID_ATHENA_TYPES.join(', ')}`);
                    return;
                }

                try {
                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const alreadyOwned = await DatabaseManager.userOwnsItem(account.accountId, templateId);
                    if (alreadyOwned) {
                        LoggerService.log('warn', `${colors.cyan(account.displayName)} already owns ${colors.yellow(templateId)}`);
                        return;
                    }

                    const itemId = DatabaseManager.generateItemId(templateId);
                    const item = {
                        templateId,
                        attributes: {
                            max_level_bonus: 0,
                            level: 1,
                            item_seen: false,
                            xp: 0,
                            favorite: false,
                        },
                        quantity: 1,
                    };

                    await DatabaseManager.addItemToProfile(account.accountId, 'athena', itemId, item);

                    LoggerService.log('success', `Gave ${colors.green(templateId)} to ${colors.cyan(account.displayName)}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to give item: ${error.message}`);
                }
                break;
            }

            case 'allcosmetics': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/give allcosmetics <username>')}`);
                    return;
                }

                const username = args[1];

                try {
                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    LoggerService.log('info', `[AllCosmetics] Fetching cosmetics from fortnite-api.com...`);
                    let resp;
                    try {
                        resp = await fetchJson('https://fortnite-api.com/v2/cosmetics');
                    } catch (apiErr) {
                        LoggerService.log('error', `[AllCosmetics] Could not reach fortnite-api.com (${apiErr.message}). The API may be temporarily down - try again later.`);
                        return;
                    }

                    const data = resp?.data;
                    if (!data || typeof data !== 'object') {
                        LoggerService.log('error', '[AllCosmetics] Unexpected response from fortnite-api.com (no cosmetics data). Try again later.');
                        return;
                    }

                    LoggerService.log('info', `[AllCosmetics] This may take some time, please be patient...`);

                    const existingProfile = await DatabaseManager.getProfile(account.accountId, 'athena');
                    if (!existingProfile) {
                        LoggerService.log('error', `${account.displayName} has no athena profile.`);
                        return;
                    }
                    if (!existingProfile.items) existingProfile.items = {};

                    const ownedTemplateIds = new Set(
                        Object.values(existingProfile.items).map(i => i.templateId)
                    );

                    let added = 0;
                    let skipped = 0;

                    for (const mode of Object.keys(data)) {
                        if (mode === 'lego' || mode === 'beans') continue;
                        // The API returns some modes (e.g. tracks/instruments) as objects,
                        // not arrays, depending on the version - skip anything non-iterable.
                        if (!Array.isArray(data[mode])) continue;

                        for (const item of data[mode]) {
                            if (!item || !item.id) continue;
                            if (mode !== 'tracks' && !item.hasOwnProperty('type')) continue;
                            if (item.id.toLowerCase().includes('random')) continue;

                            if (mode === 'tracks') item.type = { backendValue: 'SparksSong' };

                            // Skip items that have no usable backend type after normalization.
                            if (!item.type || !item.type.backendValue) continue;

                            if (FIXED_BACKEND_VALUES[item.type.backendValue]) {
                                item.type.backendValue = FIXED_BACKEND_VALUES[item.type.backendValue];
                            }

                            const templateId = `${item.type.backendValue}:${item.id}`;

                            if (ownedTemplateIds.has(templateId)) { skipped++; continue; }

                            let variants = [];
                            if (item.variants) {
                                for (const obj of item.variants) {
                                    if (obj.channel && obj.channel.toLowerCase() === 'pettemperament') continue;
                                    variants.push({
                                        channel: obj.channel || '',
                                        active: obj.options?.[0]?.tag || '',
                                        owned: obj.options?.map(v => v?.tag || '') || []
                                    });
                                }
                            }

                            const itemEntry = {
                                templateId,
                                attributes: {
                                    max_level_bonus: 0,
                                    level: 1,
                                    item_seen: true,
                                    xp: 0,
                                    variants,
                                    favorite: false
                                },
                                quantity: 1
                            };

                            // Accumulate in memory; the profile is saved once at the end
                            // to avoid thousands of full read/write cycles on one command.
                            existingProfile.items[templateId] = itemEntry;
                            ownedTemplateIds.add(templateId);
                            added++;
                        }
                    }

                    if (added > 0) {
                        await DatabaseManager.saveProfile(account.accountId, 'athena', existingProfile);
                    }

                    LoggerService.log('success', `Gave all cosmetics to ${colors.cyan(account.displayName)}: ${colors.green(added)} added, ${colors.yellow(skipped)} already owned`);
                } catch (error) {
                    LoggerService.log('error', `Failed to give all cosmetics: ${error.message}`);
                }
                break;
            }

            case 'xp': {
                if (args.length < 3) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/give xp <username> <amount>')}`);
                    return;
                }

                const username = args[1];
                const amount = parseInt(args[2]);

                if (isNaN(amount) || amount <= 0) {
                    LoggerService.log('error', `Amount must be a positive number`);
                    return;
                }

                try {
                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const profile = await DatabaseManager.getProfile(account.accountId, 'athena');
                    if (!profile) {
                        LoggerService.log('error', `Athena profile not found for "${username}"`);
                        return;
                    }

                    const currentXp = profile.stats?.attributes?.season_xp || 0;
                    const newXp = currentXp + amount;

                    await DatabaseManager.updateProfileStats(account.accountId, 'athena', {
                        season_xp: newXp
                    });

                    LoggerService.log('success', `Gave ${colors.green(amount)} XP to ${colors.cyan(account.displayName)}`);
                    LoggerService.log('info', `  Season XP: ${colors.cyan(currentXp)} -> ${colors.green(newXp)}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to give XP: ${error.message}`);
                }
                break;
            }

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/give <type> <username> ...')}`);
                LoggerService.log('info', 'Types:');
                LoggerService.log('info', `  ${colors.cyan('vbucks')}       - Give V-Bucks to a player  (usage: /give vbucks <username> <amount>)`);
                LoggerService.log('info', `  ${colors.cyan('item')}         - Give a cosmetic item       (usage: /give item <username> <templateId>)`);
                LoggerService.log('info', `  ${colors.cyan('allcosmetics')} - Give all cosmetics         (usage: /give allcosmetics <username>)`);
                LoggerService.log('info', `  ${colors.cyan('xp')}           - Give season XP             (usage: /give xp <username> <amount>)`);
                break;
        }
    });
}

module.exports = { register };
