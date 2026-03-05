const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');
const TokenService = require('../service/token/token-service');

function register(CM) {
    CM.register('/tokens', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'stats':
                try {
                    const stats = TokenService.getTokenStats();
                    LoggerService.log('info', 'Token Statistics:');
                    LoggerService.log('info', `  Access tokens: ${colors.cyan(stats.accessTokens)}`);
                    LoggerService.log('info', `  Refresh tokens: ${colors.cyan(stats.refreshTokens)}`);
                    LoggerService.log('info', `  Client tokens: ${colors.cyan(stats.clientTokens)}`);
                    LoggerService.log('info', `  Total: ${colors.green(stats.total)}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to get token stats: ${error.message}`);
                }
                break;

            case 'cleanup':
                try {
                    LoggerService.log('info', 'Cleaning up expired tokens...');
                    TokenService.cleanupExpiredTokens();
                    const stats = TokenService.getTokenStats();
                    LoggerService.log('success', `Cleanup complete. Remaining tokens: ${stats.total}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to cleanup tokens: ${error.message}`);
                }
                break;

            case 'revoke':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/tokens revoke <username|all>')}`);
                    return;
                }

                try {
                    if (args[1].toLowerCase() === 'all') {
                        const count = TokenService.revokeAllTokens();
                        LoggerService.log('success', `Revoked all ${count} tokens`);
                    } else {
                        const username = args[1];
                        const account = await DatabaseManager.getAccountByDisplayName(username);

                        if (!account) {
                            LoggerService.log('error', `Player "${username}" not found`);
                            return;
                        }

                        TokenService.removeAllTokensForAccount(account.accountId);
                        LoggerService.log('success', `Revoked all tokens for "${username}"`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to revoke tokens: ${error.message}`);
                }
                break;

            case 'user':
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/tokens user <username>')}`);
                    return;
                }

                try {
                    const username = args[1];
                    const account = await DatabaseManager.getAccountByDisplayName(username);

                    if (!account) {
                        LoggerService.log('error', `Player "${username}" not found`);
                        return;
                    }

                    const userTokens = TokenService.getTokensForAccount(account.accountId);
                    LoggerService.log('info', `Tokens for "${username}":`);
                    LoggerService.log('info', `  Access tokens: ${colors.cyan(userTokens.accessTokens.length)}`);
                    LoggerService.log('info', `  Refresh tokens: ${colors.cyan(userTokens.refreshTokens.length)}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to get user tokens: ${error.message}`);
                }
                break;

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/tokens <stats|cleanup|revoke|user>')}`);
                LoggerService.log('info', 'Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('stats')}   - Show token statistics`);
                LoggerService.log('info', `  ${colors.cyan('cleanup')} - Clean up expired tokens`);
                LoggerService.log('info', `  ${colors.cyan('revoke')}  - Revoke tokens (usage: /tokens revoke <username|all>)`);
                LoggerService.log('info', `  ${colors.cyan('user')}    - Show user's tokens (usage: /tokens user <username>)`);
                break;
        }
    });
}

module.exports = { register };
