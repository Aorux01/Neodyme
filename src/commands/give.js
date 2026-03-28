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
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
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
                    const resp = await fetchJson('https://fortnite-api.com/v2/cosmetics');
                    const data = resp.data;

                    LoggerService.log('info', `[AllCosmetics] This may take some time, please be patient...`);

                    const existingProfile = await DatabaseManager.getProfile(account.accountId, 'athena');
                    const ownedTemplateIds = new Set(
                        Object.values(existingProfile?.items || {}).map(i => i.templateId)
                    );

                    let added = 0;
                    let skipped = 0;

                    for (const mode of Object.keys(data)) {
                        if (mode === 'lego' || mode === 'beans') continue;

                        for (const item of data[mode]) {
                            if (!item.hasOwnProperty('type')) continue;
                            if (item.id.toLowerCase().includes('random')) continue;

                            if (mode === 'tracks') item.type = { backendValue: 'SparksSong' };

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

                            await DatabaseManager.addItemToProfile(account.accountId, 'athena', templateId, itemEntry);
                            ownedTemplateIds.add(templateId);
                            added++;
                        }
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
