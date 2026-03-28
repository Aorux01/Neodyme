const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');

function register(CM) {
    CM.register('/account', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'create':
                if (args.length < 4) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/account create <email> <password> <displayName>')}`);
                    return;
                }

                try {
                    const [, email, password, ...displayNameParts] = args;
                    const displayName = displayNameParts.join(' ');

                    const account = await DatabaseManager.createAccount(email, password, displayName);
                    LoggerService.log('success', `Account created successfully!`);
                    LoggerService.log('info', `  Email: ${colors.cyan(account.email)}`);
                    LoggerService.log('info', `  Display Name: ${colors.cyan(account.displayName)}`);
                    LoggerService.log('info', `  Account ID: ${colors.cyan(account.accountId)}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to create account: ${error.message}`);
                }
                break;

            case 'info':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/account info <username>')}`);
                    return;
                }

                try {
                    const username = args[1];
                    const account = await DatabaseManager.getAccountByDisplayName(username);

                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const vbucks = await DatabaseManager.getVbucksBalance(account.accountId);
                    const roleName = DatabaseManager.getRoleName(account.clientType || 0);

                    LoggerService.log('info', `Player information for "${username}":`);
                    LoggerService.log('info', `  Account ID: ${colors.cyan(account.accountId)}`);
                    LoggerService.log('info', `  Email: ${colors.cyan(account.email || 'N/A')}`);
                    LoggerService.log('info', `  Role: ${colors.cyan(roleName)}`);
                    LoggerService.log('info', `  Banned: ${account.ban?.banned ? colors.red('YES') : colors.green('NO')}`);
                    LoggerService.log('info', `  V-Bucks: ${colors.green(vbucks)}`);
                    LoggerService.log('info', `  Last login: ${colors.cyan(new Date(account.lastLogin).toLocaleString())}`);
                    LoggerService.log('info', `  Created: ${colors.cyan(new Date(account.created).toLocaleString())}`);

                    if (account.ban?.banned && account.ban.banReasons?.length > 0) {
                        LoggerService.log('info', `  Ban reasons: ${colors.red(account.ban.banReasons.join(', '))}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to get player info: ${error.message}`);
                }
                break;

            case 'list':
                try {
                    const allAccounts = await DatabaseManager.getAllAccounts();
                    const page = parseInt(args[1]) || 1;
                    const perPage = 10;
                    const totalPages = Math.ceil(allAccounts.length / perPage);

                    if (page < 1 || page > totalPages) {
                        LoggerService.log('warn', `Invalid page. Available: 1-${totalPages}`);
                        return;
                    }

                    const startIndex = (page - 1) * perPage;
                    const pageAccounts = allAccounts.slice(startIndex, startIndex + perPage);

                    LoggerService.log('info', `Accounts (Page ${page}/${totalPages}) - Total: ${colors.cyan(allAccounts.length)}`);
                    pageAccounts.forEach((account, index) => {
                        const num = startIndex + index + 1;
                        LoggerService.log('info', `  ${num}. ${colors.cyan(account.displayName)} - ${account.email}`);
                    });

                    if (page < totalPages) {
                        LoggerService.log('info', `Type ${colors.cyan(`/account list ${page + 1}`)} for more`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to list accounts: ${error.message}`);
                }
                break;

            case 'delete': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/account delete <username>')}`);
                    return;
                }
                try {
                    const username = args[1];
                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }
                    CM.pendingAccountDelete = account.accountId;
                    CM.pendingAccountDeleteName = account.displayName;
                    LoggerService.log('warn', `You are about to PERMANENTLY delete account "${account.displayName}" (${account.accountId}).`);
                    LoggerService.log('warn', `This will remove all their data (cosmetics, V-Bucks, friends). This cannot be undone!`);
                    LoggerService.log('info', `Type ${colors.cyan('/confirm account-delete')} to confirm, or ${colors.cyan('/cancel')} to abort.`);
                } catch (error) {
                    LoggerService.log('error', `Failed to prepare account deletion: ${error.message}`);
                }
                break;
            }

            case 'reset': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/account reset <username>')}`);
                    return;
                }
                try {
                    const username = args[1];
                    const account = await DatabaseManager.getAccountByDisplayName(username);
                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }
                    CM.pendingAccountReset = account.accountId;
                    CM.pendingAccountResetName = account.displayName;
                    LoggerService.log('warn', `You are about to reset ALL game data for "${account.displayName}" (${account.accountId}).`);
                    LoggerService.log('warn', `This will erase cosmetics, V-Bucks, friends, etc. The account login will remain.`);
                    LoggerService.log('info', `Type ${colors.cyan('/confirm account-reset')} to confirm, or ${colors.cyan('/cancel')} to abort.`);
                } catch (error) {
                    LoggerService.log('error', `Failed to prepare account reset: ${error.message}`);
                }
                break;
            }

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/account <create|info|list|delete|reset>')}`);
                LoggerService.log('info', 'Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('create')} - Create a new account (usage: /account create <email> <password> <displayName>)`);
                LoggerService.log('info', `  ${colors.cyan('info')}   - View account details (usage: /account info <username>)`);
                LoggerService.log('info', `  ${colors.cyan('list')}   - List all accounts (usage: /account list [page])`);
                LoggerService.log('info', `  ${colors.cyan('delete')} - Delete an account permanently (usage: /account delete <username>)`);
                LoggerService.log('info', `  ${colors.cyan('reset')}  - Reset all game data for an account (usage: /account reset <username>)`);
                break;
        }
    });
}

module.exports = { register };
