const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');

const ROLES = { PLAYER: 0, MODERATOR: 1, DEVELOPER: 2, ADMIN: 3, OWNER: 4, SERVER: 5 };
const ROLE_NAMES = { 0: null, 1: '[MODERATOR]', 2: '[DEVELOPER]', 3: '[ADMIN]', 4: '[OWNER]', 5: '[SERVER]' };
const ROLE_COLORS = { 0: null, 1: colors.yellow, 2: colors.cyan, 3: colors.red, 4: colors.magenta, 5: colors.green };

function register(CM) {
    CM.register('/admin', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'set':
                if (args.length < 3) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/admin set <username> <role>')}`);
                    LoggerService.log('info', 'Available roles:');
                    LoggerService.log('info', `  0 - Player (no prefix)`);
                    LoggerService.log('info', `  1 - Moderator ${colors.yellow('[MODERATOR]')}`);
                    LoggerService.log('info', `  2 - Developer ${colors.cyan('[DEVELOPER]')}`);
                    LoggerService.log('info', `  3 - Admin ${colors.red('[ADMIN]')}`);
                    LoggerService.log('info', `  4 - Owner ${colors.magenta('[OWNER]')}`);
                    LoggerService.log('info', `  5 - Server ${colors.green('[SERVER]')}`);
                    return;
                }

                try {
                    const username = args[1];
                    const roleInput = args[2].toLowerCase();

                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const roleMap = { 'player': 0, 'mod': 1, 'moderator': 1, 'dev': 2, 'developer': 2, 'admin': 3, 'owner': 4, 'server': 5 };
                    let roleId = !isNaN(roleInput) ? parseInt(roleInput) : roleMap[roleInput];

                    if (roleId === undefined || roleId < 0 || roleId > 5) {
                        LoggerService.log('error', 'Invalid role. Use 0-5 or role name (player, mod, dev, admin, owner, server)');
                        return;
                    }

                    await DatabaseManager.updateAccountRole(account.accountId, roleId);

                    const roleName = Object.keys(ROLES).find(key => ROLES[key] === roleId);
                    const rolePrefix = ROLE_NAMES[roleId];

                    if (roleId === 0) {
                        LoggerService.log('success', `Player "${username}" is now a regular player`);
                    } else {
                        const colorFunc = ROLE_COLORS[roleId];
                        const displayRole = colorFunc ? colorFunc(rolePrefix) : rolePrefix;
                        LoggerService.log('success', `Player "${username}" is now ${roleName} ${displayRole}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to set role: ${error.message}`);
                }
                break;

            case 'list':
                try {
                    const allAccounts = await DatabaseManager.getAllAccounts();
                    const staffAccounts = allAccounts.filter(account => (account.clientType || 0) > 0);

                    if (staffAccounts.length === 0) {
                        LoggerService.log('info', 'No staff members found');
                        return;
                    }

                    LoggerService.log('info', `Found ${colors.cyan(staffAccounts.length)} staff member(s):`);

                    const groupedByRole = {};
                    staffAccounts.forEach(account => {
                        const roleId = account.clientType || 0;
                        if (!groupedByRole[roleId]) groupedByRole[roleId] = [];
                        groupedByRole[roleId].push(account);
                    });

                    [ROLES.OWNER, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.MODERATOR].forEach(roleId => {
                        if (groupedByRole[roleId]) {
                            const rolePrefix = ROLE_NAMES[roleId];
                            const colorFunc = ROLE_COLORS[roleId];
                            const displayRole = colorFunc ? colorFunc(rolePrefix) : rolePrefix;

                            LoggerService.log('info', `\n${displayRole} (${groupedByRole[roleId].length}):`);
                            groupedByRole[roleId].forEach((account, index) => {
                                LoggerService.log('info', `  ${index + 1}. ${colors.cyan(account.displayName)}`);
                            });
                        }
                    });
                } catch (error) {
                    LoggerService.log('error', `Failed to list staff: ${error.message}`);
                }
                break;

            case 'ban':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/admin ban <username> [reason]')}`);
                    return;
                }

                try {
                    const username = args[1];
                    const reason = args.slice(2).join(' ') || null;

                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    await DatabaseManager.setBanStatus(account.accountId, true, reason);
                    LoggerService.log('success', `Player "${username}" has been ${colors.red('BANNED')}${reason ? ': ' + reason : ''}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to ban player: ${error.message}`);
                }
                break;

            case 'unban':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/admin unban <username>')}`);
                    return;
                }

                try {
                    const username = args[1];

                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    await DatabaseManager.setBanStatus(account.accountId, false);
                    LoggerService.log('success', `Player "${username}" has been ${colors.green('UNBANNED')}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to unban player: ${error.message}`);
                }
                break;

            case 'info':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/admin info <username>')}`);
                    return;
                }

                try {
                    const username = args[1];

                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const roleId = account.clientType || 0;
                    const roleName = DatabaseManager.getRoleName(roleId);
                    const rolePrefix = ROLE_NAMES[roleId];
                    const colorFunc = ROLE_COLORS[roleId];

                    LoggerService.log('info', `\nPlayer Info: ${colors.cyan(account.displayName)}`);
                    LoggerService.log('info', `  Account ID: ${account.accountId}`);
                    LoggerService.log('info', `  Email: ${account.email || 'N/A'}`);
                    LoggerService.log('info', `  Role: ${rolePrefix ? (colorFunc ? colorFunc(rolePrefix) : rolePrefix) : 'Player'} (${roleName})`);
                    LoggerService.log('info', `  Banned: ${account.banned ? colors.red('Yes') : colors.green('No')}`);
                    if (account.banned && account.banReasons?.length > 0) {
                        LoggerService.log('info', `  Ban Reason: ${account.banReasons.join(', ')}`);
                    }
                    LoggerService.log('info', `  Created: ${account.created || 'Unknown'}`);
                    LoggerService.log('info', `  Last Login: ${account.lastLogin || 'Never'}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to get player info: ${error.message}`);
                }
                break;

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/admin <subcommand>')}`);
                LoggerService.log('info', 'Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('set <user> <role>')}  - Set a player's role`);
                LoggerService.log('info', `  ${colors.cyan('list')}               - List all staff members`);
                LoggerService.log('info', `  ${colors.cyan('ban <user> [reason]')}- Ban a player`);
                LoggerService.log('info', `  ${colors.cyan('unban <user>')}       - Unban a player`);
                LoggerService.log('info', `  ${colors.cyan('info <user>')}        - View player information`);
                break;
        }
    });

    CM.register('/broadcast', async (args) => {
        if (args.length === 0) {
            LoggerService.log('info', `Usage: ${colors.cyan('/broadcast <message>')}`);
            return;
        }

        const message = args.join(' ');

        try {
            const XmppManager = require('../manager/xmpp-manager');
            if (XmppManager.wss) {
                let sent = 0;
                XmppManager.wss.clients.forEach(client => {
                    if (client.readyState === 1) {
                        client.send(`<message from="broadcast@prod.ol.epicgames.com" type="chat"><body>${message}</body></message>`);
                        sent++;
                    }
                });
                LoggerService.log('success', `Broadcast sent to ${sent} connected client(s): "${message}"`);
            } else {
                LoggerService.log('success', `[BROADCAST] ${message}`);
                LoggerService.log('info', 'Note: XMPP not running - message logged to console only.');
            }
        } catch (err) {
            LoggerService.log('success', `[BROADCAST] ${message}`);
            LoggerService.log('info', `Note: XMPP unavailable (${err.message}).`);
        }
    });
}

module.exports = { register };
