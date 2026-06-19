const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');
const CreatorCodeService = require('../service/api/creator-code-service');

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
    CM.register('/sac', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'add': {
                if (args.length < 3) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/sac add <username|accountId> <code>')}`);
                    LoggerService.log('info', 'Create a creator code directly for an account.');
                    return;
                }

                try {
                    const requestedCode = args[2];
                    if (!/^[a-zA-Z0-9_-]{3,16}$/.test(requestedCode)) {
                        LoggerService.log('error', 'Code must be 3-16 characters, alphanumeric with _ or -.');
                        return;
                    }

                    const account = await resolveAccount(args[1]);
                    if (!account) {
                        LoggerService.log('error', `Player "${args[1]}" not found`);
                        return;
                    }

                    const normalizedCode = requestedCode.toLowerCase();

                    const existingCode = await DatabaseManager.getCreatorCode(normalizedCode);
                    if (existingCode) {
                        LoggerService.log('error', `Code "${normalizedCode}" is already taken.`);
                        return;
                    }

                    const ownerCode = (await CreatorCodeService.getUserCode(account.accountId));
                    if (ownerCode) {
                        LoggerService.log('error', `${account.displayName} already owns the code "${ownerCode.code}".`);
                        return;
                    }

                    await DatabaseManager.createCreatorCode({
                        code: normalizedCode,
                        accountId: account.accountId,
                        displayName: account.displayName,
                        createdAt: new Date().toISOString(),
                        approvedBy: 'console',
                        approvedByName: 'Console',
                        totalEarnings: 0,
                        totalUses: 0,
                        isActive: true
                    });

                    LoggerService.log('success', `Creator code ${colors.cyan(normalizedCode)} created for ${colors.cyan(account.displayName)}.`);
                } catch (error) {
                    LoggerService.log('error', `Failed to create code: ${error.message}`);
                }
                break;
            }

            case 'list': {
                try {
                    const codes = await CreatorCodeService.getAllCodes();

                    if (codes.length === 0) {
                        LoggerService.log('info', 'No creator codes found.');
                        return;
                    }

                    LoggerService.log('info', `Found ${colors.cyan(codes.length)} creator code(s):`);
                    codes
                        .sort((a, b) => (b.totalUses || 0) - (a.totalUses || 0))
                        .forEach((code, index) => {
                            const status = code.isActive ? colors.green('active') : colors.red('disabled');
                            LoggerService.log('info', `  ${index + 1}. ${colors.cyan(code.code)} - ${code.displayName} [${status}] - ${code.totalUses || 0} uses, ${code.totalEarnings || 0} V-Bucks`);
                        });
                } catch (error) {
                    LoggerService.log('error', `Failed to list codes: ${error.message}`);
                }
                break;
            }

            case 'delete': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/sac delete <code>')}`);
                    return;
                }

                try {
                    const result = await CreatorCodeService.deleteCode(args[1], 'console', 'Console');
                    if (result.success) {
                        LoggerService.log('success', `Creator code ${colors.cyan(args[1].toLowerCase())} has been ${colors.red('deleted')}.`);
                    } else {
                        LoggerService.log('error', result.error);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to delete code: ${error.message}`);
                }
                break;
            }

            case 'info': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/sac info <code>')}`);
                    return;
                }

                try {
                    const code = await DatabaseManager.getCreatorCode(args[1].toLowerCase());
                    if (!code) {
                        LoggerService.log('error', `Code "${args[1]}" not found`);
                        return;
                    }

                    LoggerService.log('info', `\nCreator Code: ${colors.cyan(code.code)}`);
                    LoggerService.log('info', `  Owner: ${colors.cyan(code.displayName)} (${code.accountId})`);
                    LoggerService.log('info', `  Status: ${code.isActive ? colors.green('Active') : colors.red('Disabled')}`);
                    LoggerService.log('info', `  Total Uses: ${code.totalUses || 0}`);
                    LoggerService.log('info', `  Total Earnings: ${code.totalEarnings || 0} V-Bucks`);
                    LoggerService.log('info', `  Created: ${code.createdAt || 'Unknown'}`);
                    if (code.approvedByName) {
                        LoggerService.log('info', `  Approved By: ${code.approvedByName}`);
                    }
                    if (code.lastUsedAt) {
                        LoggerService.log('info', `  Last Used: ${code.lastUsedAt}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to get code info: ${error.message}`);
                }
                break;
            }

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/sac <subcommand>')}`);
                LoggerService.log('info', 'Support-A-Creator code management. Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('add <user|accountId> <code>')} - Create a code for an account`);
                LoggerService.log('info', `  ${colors.cyan('list')}                        - List all creator codes`);
                LoggerService.log('info', `  ${colors.cyan('delete <code>')}               - Delete a creator code`);
                LoggerService.log('info', `  ${colors.cyan('info <code>')}                 - View code information`);
                break;
        }
    });
}

module.exports = { register };
