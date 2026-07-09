const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');
const EmailService = require('../service/email/email-service');

// Resolve a console argument that may be either a displayName or a raw accountId.
async function resolveAccount(input) {
    const account = await DatabaseManager.getAccountByDisplayName(input);
    if (account) {
        return account;
    }
    const byId = await DatabaseManager.getAccount(input);
    return byId || null;
}

function register(CM) {
    CM.register('/email', async (args) => {
        const subCommand = args[0]?.toLowerCase();

        switch (subCommand) {
            case 'info': {
                try {
                    if (!EmailService.isConfigured()) {
                        LoggerService.log('info', `SMTP status: ${colors.red('not configured')}`);
                        LoggerService.log('info', `Use ${colors.cyan('/email create <host> <port> <user> <pass> [from]')} to set it up.`);
                        return;
                    }

                    const cfg = EmailService.getConfig();
                    LoggerService.log('info', `\nSMTP Configuration:`);
                    LoggerService.log('info', `  Host:   ${colors.cyan(cfg.host)}`);
                    LoggerService.log('info', `  Port:   ${colors.cyan(cfg.port)}`);
                    LoggerService.log('info', `  Secure: ${cfg.secure ? colors.green('yes (TLS)') : 'no (STARTTLS)'}`);
                    LoggerService.log('info', `  User:   ${colors.cyan(cfg.user)}`);
                    LoggerService.log('info', `  From:   ${colors.cyan(cfg.from)}`);

                    LoggerService.log('info', 'Verifying connection...');
                    const result = await EmailService.verify();
                    if (result.success) {
                        LoggerService.log('success', `Connection: ${colors.green('OK')}`);
                    } else {
                        LoggerService.log('error', `Connection: ${colors.red('FAILED')} - ${result.error}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to get email info: ${error.message}`);
                }
                break;
            }

            case 'create': {
                if (args.length < 5) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/email create <host> <port> <user> <pass> [from]')}`);
                    LoggerService.log('info', 'Example: /email create smtp.gmail.com 587 you@gmail.com app_password "Neodyme <you@gmail.com>"');
                    return;
                }

                try {
                    const [host, portRaw, user, pass] = [args[1], args[2], args[3], args[4]];
                    const from = args.slice(5).join(' ') || user;

                    const port = parseInt(portRaw, 10);
                    if (isNaN(port) || port < 1 || port > 65535) {
                        LoggerService.log('error', `Invalid port "${portRaw}". Must be a number between 1 and 65535.`);
                        return;
                    }

                    await EmailService.saveConfig({ host, port, user, pass, from, secure: port === 465 });
                    LoggerService.log('success', `SMTP configuration ${colors.green('saved')} to .env.`);

                    LoggerService.log('info', 'Verifying connection...');
                    const result = await EmailService.verify();
                    if (result.success) {
                        LoggerService.log('success', `Connection: ${colors.green('OK')}`);
                    } else {
                        LoggerService.log('warn', `Saved, but connection check ${colors.red('failed')}: ${result.error}`);
                    }
                } catch (error) {
                    LoggerService.log('error', `Failed to create email config: ${error.message}`);
                }
                break;
            }

            case 'delete': {
                try {
                    if (!EmailService.isConfigured()) {
                        LoggerService.log('info', 'SMTP is not configured, nothing to delete.');
                        return;
                    }

                    await EmailService.clearConfig();
                    LoggerService.log('success', `SMTP configuration ${colors.red('removed')} from .env.`);
                } catch (error) {
                    LoggerService.log('error', `Failed to delete email config: ${error.message}`);
                }
                break;
            }

            case 'test': {
                if (args.length < 2) {
                    LoggerService.log('info', `Usage: ${colors.cyan('/email test <username|accountId>')}`);
                    LoggerService.log('info', 'Sends an HTML test email to the account\'s email address.');
                    return;
                }

                try {
                    if (!EmailService.isConfigured()) {
                        LoggerService.log('error', 'SMTP is not configured. Use /email create first.');
                        return;
                    }

                    const account = await resolveAccount(args[1]);
                    if (!account) {
                        LoggerService.log('error', `Player "${args[1]}" not found`);
                        return;
                    }
                    if (!account.email) {
                        LoggerService.log('error', `${account.displayName} has no email address on file.`);
                        return;
                    }

                    LoggerService.log('info', `Sending test email to ${colors.cyan(account.email)}...`);
                    await EmailService.sendTestEmail(account.email, account.displayName, account);
                    LoggerService.log('success', `Test email ${colors.green('sent')} to ${account.displayName} (${account.email}).`);
                } catch (error) {
                    LoggerService.log('error', `Failed to send test email: ${error.message}`);
                }
                break;
            }

            default:
                LoggerService.log('info', `Usage: ${colors.cyan('/email <subcommand>')}`);
                LoggerService.log('info', 'SMTP email management. Subcommands:');
                LoggerService.log('info', `  ${colors.cyan('info')}                                  - Show SMTP config and test the connection`);
                LoggerService.log('info', `  ${colors.cyan('create <host> <port> <user> <pass> [from]')} - Configure SMTP`);
                LoggerService.log('info', `  ${colors.cyan('delete')}                                - Remove the SMTP config`);
                LoggerService.log('info', `  ${colors.cyan('test <user|accountId>')}                 - Send a test HTML email to a player`);
                break;
        }
    });
}

module.exports = { register };
