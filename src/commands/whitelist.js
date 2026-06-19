const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');

// Resolve a console argument that may be either a displayName or a raw accountId
// into a full account object. Returns null if nothing matches.
async function resolveAccount(input) {
    const account = await DatabaseManager.getAccountByDisplayName(input);
    if (account) {
        return account;
    }

    const byId = await DatabaseManager.getAccount(input);
    return byId || null;
}

function register(CM) {
    CM.register('/whitelist', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'set': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/whitelist set <true|false>')}`);
                    LoggerService.log('info', 'Enable or disable the whitelist for the server.');
                    return;
                }

                const value = args[1].toLowerCase();
                if (value !== 'true' && value !== 'false') {
                    LoggerService.log('error', `Invalid value "${value}". Use "true" or "false".`);
                    return;
                }

                try {
                    const isEnabled = value === 'true';
                    await DatabaseManager.setWhitelistEnabled(isEnabled);
                    LoggerService.log('success', `Whitelist has been ${isEnabled ? colors.green('enabled') : colors.red('disabled')}.`);
                } catch (error) {
                    LoggerService.log('error', `Failed to set whitelist: ${error.message}`);
                }
                break;
            }

            case 'add': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/whitelist add <username|accountId>')}`);
                    return;
                }

                try {
                    const account = await resolveAccount(args[1]);
                    if (!account) {
                        LoggerService.log('error', `Player "${args[1]}" not found`);
                        return;
                    }

                    const added = await DatabaseManager.addToWhitelist(account.accountId);
                    if (added) {
                        LoggerService.log('success', `${colors.cyan(account.displayName)} has been ${colors.green('added')} to the whitelist.`);
                    } else {
                        LoggerService.log('info', `${colors.cyan(account.displayName)} is already on the whitelist.`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to add to whitelist: ${error.message}`);
                }
                break;
            }

            case 'remove': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/whitelist remove <username|accountId>')}`);
                    return;
                }

                try {
                    const account = await resolveAccount(args[1]);
                    // Fall back to the raw input so an account that was deleted can still be removed.
                    const accountId = account ? account.accountId : args[1];
                    const displayName = account ? account.displayName : args[1];

                    const removed = await DatabaseManager.removeFromWhitelist(accountId);
                    if (removed) {
                        LoggerService.log('success', `${colors.cyan(displayName)} has been ${colors.red('removed')} from the whitelist.`);
                    } else {
                        LoggerService.log('info', `${colors.cyan(displayName)} is not on the whitelist.`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to remove from whitelist: ${error.message}`);
                }
                break;
            }

            case 'list': {
                try {
                    const accounts = await DatabaseManager.getAllWhitelistedAccounts();
                    const whitelist = await DatabaseManager.getWhitelist();

                    if (whitelist.length === 0) {
                        LoggerService.log('info', 'The whitelist is empty.');
                        return;
                    }

                    LoggerService.log('info', `Found ${colors.cyan(whitelist.length)} whitelisted account(s):`);

                    const knownIds = new Set();
                    accounts.forEach((account, index) => {
                        knownIds.add(account.accountId);
                        LoggerService.log('info', `  ${index + 1}. ${colors.cyan(account.displayName)} (${account.accountId})`);
                    });

                    // Surface whitelist entries that no longer have a matching account.
                    const orphans = whitelist.filter(id => !knownIds.has(id));
                    orphans.forEach((accountId, index) => {
                        LoggerService.log('info', `  ${accounts.length + index + 1}. ${colors.yellow('<unknown account>')} (${accountId})`);
                    });
                } catch (error) {
                    LoggerService.log('error', `Failed to list whitelist: ${error.message}`);
                }
                break;
            }

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/whitelist <subcommand>')}`);
                LoggerService.log('info', 'Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('set <true|false>')}            - Enable or disable the whitelist`);
                LoggerService.log('info', `  ${colors.cyan('add <user|accountId>')}        - Add an account to the whitelist`);
                LoggerService.log('info', `  ${colors.cyan('remove <user|accountId>')}     - Remove an account from the whitelist`);
                LoggerService.log('info', `  ${colors.cyan('list')}                        - List all whitelisted accounts`);
                break;
        }
    });
}

module.exports = { register };
