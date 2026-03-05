const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');

function register(CM) {
    CM.register('/ban', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'add':
                if (args.length < 3) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/ban add <username> <reason> [duration]')}`);
                    LoggerService.log('info', 'Examples:');
                    LoggerService.log('info', `  ${colors.cyan('/ban add Player123 Cheating')} - Permanent ban`);
                    LoggerService.log('info', `  ${colors.cyan('/ban add Player123 Toxicity 7d')} - 7 days ban`);
                    LoggerService.log('info', `  ${colors.cyan('/ban add Player123 Spamming 2h')} - 2 hours ban`);
                    return;
                }

                try {
                    const username = args[1];
                    const reason = args[2];
                    const duration = args[3] || 'permanent';

                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const isBanned = await DatabaseManager.AccountIsBanned(account.accountId);
                    if (isBanned) {
                        LoggerService.log('warn', `Player "${username}" is already banned. Use ${colors.cyan('/ban info ' + username)} to view details.`);
                        return;
                    }

                    let expiresAt = null;
                    if (duration !== 'permanent') {
                        const durationMatch = duration.match(/^(\d+)([hdm])$/);
                        if (!durationMatch) {
                            LoggerService.log('error', 'Invalid duration format. Use: 2h, 7d, 30d, etc.');
                            return;
                        }

                        const amount = parseInt(durationMatch[1]);
                        const unit = durationMatch[2];
                        let milliseconds = 0;

                        switch (unit) {
                            case 'h': milliseconds = amount * 60 * 60 * 1000; break;
                            case 'd': milliseconds = amount * 24 * 60 * 60 * 1000; break;
                            case 'm': milliseconds = amount * 30 * 24 * 60 * 60 * 1000; break;
                        }

                        expiresAt = new Date(Date.now() + milliseconds);
                    }

                    await DatabaseManager.banAccount(account.accountId, [reason], expiresAt);

                    const banType = expiresAt ? `until ${expiresAt.toLocaleString()}` : 'PERMANENTLY';
                    LoggerService.log('success', `Player "${username}" has been banned ${banType} for: ${reason}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to ban player: ${error.message}`);
                }
                break;

            case 'remove':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/ban remove <username>')}`);
                    return;
                }

                try {
                    const username = args[1];

                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const isBanned = await DatabaseManager.AccountIsBanned(account.accountId);
                    if (!isBanned) {
                        LoggerService.log('warn', `Player "${username}" is not banned`);
                        return;
                    }

                    await DatabaseManager.unbanAccount(account.accountId);
                    LoggerService.log('success', `Player "${username}" has been unbanned`);
                } catch (error) {
                    LoggerService.log('error', `Failed to unban player: ${error.message}`);
                }
                break;

            case 'info':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/ban info <username>')}`);
                    return;
                }

                try {
                    const username = args[1];

                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const banInfo = await DatabaseManager.getBanInfo(account.accountId);
                    if (!banInfo || !banInfo.banned) {
                        LoggerService.log('info', `Player "${username}" is not banned`);
                        return;
                    }

                    LoggerService.log('info', `Ban information for "${username}":`);
                    LoggerService.log('info', `  Account ID: ${colors.cyan(account.accountId)}`);
                    LoggerService.log('info', `  Banned: ${colors.red('YES')}`);
                    LoggerService.log('info', `  Banned at: ${colors.cyan(new Date(banInfo.bannedAt).toLocaleString())}`);

                    if (banInfo.expiresAt) {
                        const now = new Date();
                        const expires = new Date(banInfo.expiresAt);
                        const timeLeft = expires.getTime() - now.getTime();
                        const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));

                        LoggerService.log('info', `  Expires: ${colors.cyan(expires.toLocaleString())}`);
                        LoggerService.log('info', `  Time left: ${colors.cyan(`${daysLeft} days`)}`);
                    } else {
                        LoggerService.log('info', `  Expires: ${colors.red('PERMANENT')}`);
                    }

                    LoggerService.log('info', `  Reasons:`);
                    banInfo.reasons.forEach((reason, index) => {
                        LoggerService.log('info', `    ${index + 1}. ${reason}`);
                    });
                } catch (error) {
                    LoggerService.log('error', `Failed to get ban info: ${error.message}`);
                }
                break;

            case 'list':
                try {
                    const allAccounts = await DatabaseManager.getAllAccounts();
                    const bannedAccounts = [];

                    for (const account of allAccounts) {
                        const isBanned = await DatabaseManager.AccountIsBanned(account.accountId);
                        if (isBanned) {
                            const banInfo = await DatabaseManager.getBanInfo(account.accountId);
                            bannedAccounts.push({
                                username: account.displayName,
                                accountId: account.accountId,
                                banInfo
                            });
                        }
                    }

                    if (bannedAccounts.length === 0) {
                        LoggerService.log('info', 'No banned players found');
                        return;
                    }

                    LoggerService.log('info', `Found ${colors.cyan(bannedAccounts.length)} banned player(s):`);
                    bannedAccounts.forEach((player, index) => {
                        const expires = player.banInfo.expiresAt
                            ? new Date(player.banInfo.expiresAt).toLocaleString()
                            : colors.red('PERMANENT');

                        LoggerService.log('info',
                            `${index + 1}. ${colors.cyan(player.username)} - Expires: ${expires}`
                        );
                        LoggerService.log('info', `     Reason: ${colors.gray(player.banInfo.reasons[0] || 'No reason')}`);
                    });
                } catch (error) {
                    LoggerService.log('error', `Failed to list banned players: ${error.message}`);
                }
                break;

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/ban <add|remove|info|list>')}`);
                LoggerService.log('info', 'Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('add')}    - Ban a player (usage: /ban add <username> <reason> [duration])`);
                LoggerService.log('info', `  ${colors.cyan('remove')} - Unban a player (usage: /ban remove <username>)`);
                LoggerService.log('info', `  ${colors.cyan('info')}   - View ban details (usage: /ban info <username>)`);
                LoggerService.log('info', `  ${colors.cyan('list')}   - List all banned players`);
                LoggerService.log('info', '');
                LoggerService.log('info', 'Duration formats: 2h (hours), 7d (days), 1m (months)');
                LoggerService.log('info', 'Omit duration for permanent ban');
                break;
        }
    });
}

module.exports = { register };
