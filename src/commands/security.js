const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');
const DatabaseManager = require('../manager/database-manager');
const AuditService = require('../service/api/audit-service');
const TwoFactorService = require('../service/security/two-factor-service');
const OneTimeTokenService = require('../service/token/one-time-token-service');
const RecoveryService = require('../service/api/recovery-service');
const EmailService = require('../service/email/email-service');
const EmailTemplateService = require('../service/email/email-template-service');

const isStaff = (account) => typeof account.clientType === 'number' && account.clientType >= 1 && account.clientType <= 4;

async function resolveAccount(input) {
    return (await DatabaseManager.getAccountByDisplayName(input)) || (await DatabaseManager.getAccount(input)) || null;
}

const audit = (action, account) =>
    AuditService.log(action, 'console', 'Console', 'account', account.accountId, {}, null).catch(() => {});

function printUsage() {
    LoggerService.log('info', `Usage: ${colors.cyan('/security <subcommand>')}`);
    LoggerService.log('info', `  ${colors.cyan('enable')}                    Require two-factor authentication for staff accounts`);
    LoggerService.log('info', `  ${colors.cyan('disable')}                   Stop requiring it for staff accounts`);
    LoggerService.log('info', `  ${colors.cyan('status [user]')}             Show the policy, or the two-factor state of one account`);
    LoggerService.log('info', `  ${colors.cyan('disable-user <user>')}       Turn off two-factor on an account (lost phone and backup codes)`);
    LoggerService.log('info', `  ${colors.cyan('regen-codes <user>')}        Generate new backup codes, shown once in this console`);
    LoggerService.log('info', `  ${colors.cyan('force-reset <user>')}        End every session and send a password reset link`);
}

async function showStatus(args) {
    if (args[1]) {
        const account = await resolveAccount(args[1]);
        if (!account) return LoggerService.log('error', `Player "${args[1]}" not found`);

        LoggerService.log('info', `${colors.cyan(account.displayName)}: two-factor ${account.tfaEnabled ? colors.green('on') : colors.gray('off')}`
            + (account.tfaEnabled ? `, ${TwoFactorService.backupRemaining(account)} backup code(s) left` : ''));
        return;
    }

    const accounts = await DatabaseManager.getAllAccounts();
    const withTfa = accounts.filter(a => a.tfaEnabled).length;
    const exposed = accounts.filter(a => isStaff(a) && !a.tfaEnabled);

    LoggerService.log('info', `Staff two-factor policy: ${TwoFactorService.staffPolicyEnabled() ? colors.green('required') : colors.gray('not required')}`);
    LoggerService.log('info', `Accounts with two-factor: ${withTfa} of ${accounts.length}`);
    if (exposed.length > 0) {
        LoggerService.log('info', `Staff without two-factor: ${exposed.map(a => a.displayName).join(', ')}`);
    }
}

async function setPolicy(required) {
    await ConfigManager.save('require2faForStaff', required);

    if (!required) {
        LoggerService.log('success', `Two-factor authentication is ${colors.red('no longer required')} for staff accounts.`);
        return;
    }

    LoggerService.log('success', `Two-factor authentication is now ${colors.green('required')} for staff accounts.`);
    const exposed = (await DatabaseManager.getAllAccounts()).filter(a => isStaff(a) && !a.tfaEnabled);
    if (exposed.length > 0) {
        LoggerService.log('warn', `${exposed.length} staff account(s) cannot open the staff panels until they enable it on the Security page: ${exposed.map(a => a.displayName).join(', ')}`);
    }
}

async function disableUser(args) {
    const account = args[1] && await resolveAccount(args[1]);
    if (!account) return LoggerService.log('error', args[1] ? `Player "${args[1]}" not found` : 'Usage: /security disable-user <user>');
    if (!account.tfaEnabled) return LoggerService.log('info', `${account.displayName} does not use two-factor authentication.`);

    await TwoFactorService.disable(account.accountId);
    await audit('security.2fa_forced_disable', account);
    LoggerService.log('success', `Two-factor authentication turned off for ${colors.cyan(account.displayName)}.`);

    if (EmailService.isConfigured() && account.email) {
        try {
            const template = await EmailTemplateService.get('two-factor-disabled');
            if (template) {
                const message = await EmailTemplateService.render(template, account);
                await EmailService.sendMail({ to: account.email, subject: message.subject, html: message.html, text: message.text });
                LoggerService.log('info', `The player was notified at ${account.email}`);
            }
        } catch (error) {
            LoggerService.log('warn', `Could not notify the player: ${error.message}`);
        }
    }
}

async function regenerateCodes(args) {
    const account = args[1] && await resolveAccount(args[1]);
    if (!account) return LoggerService.log('error', args[1] ? `Player "${args[1]}" not found` : 'Usage: /security regen-codes <user>');
    if (!account.tfaEnabled) return LoggerService.log('error', `${account.displayName} does not use two-factor authentication.`);

    const codes = await TwoFactorService.regenerateBackupCodes(account.accountId);
    await audit('security.backup_codes_regenerated', account);

    // Printed with console.log on purpose: these codes must never reach the log files.
    console.log(`\nNew backup codes for ${account.displayName} (shown once, not written to the logs):`);
    console.log(codes.map(code => `  ${code}`).join('\n'));
    console.log('');
}

async function forceReset(args) {
    const account = args[1] && await resolveAccount(args[1]);
    if (!account) return LoggerService.log('error', args[1] ? `Player "${args[1]}" not found` : 'Usage: /security force-reset <user>');

    await RecoveryService.revokeSessions(account.accountId);
    await audit('security.force_reset', account);
    LoggerService.log('success', `All sessions ended for ${colors.cyan(account.displayName)}.`);

    if (RecoveryService.resetAvailable() && account.email) {
        const result = await RecoveryService.deliverQuietly('reset', account);
        if (result.sent) return LoggerService.log('info', `A password reset link was sent to ${account.email}`);
    }

    const { token } = await OneTimeTokenService.issue('reset', account.accountId);
    console.log(`\nEmail is not available. Give this password reset link to ${account.displayName} (not written to the logs):`);
    console.log(`  ${RecoveryService.publicUrl()}/reset-password?token=${encodeURIComponent(token)}\n`);
}

function register(CM) {
    CM.register('/security', async (args) => {
        try {
            switch (args[0]?.toLowerCase()) {
                case 'enable': return await setPolicy(true);
                case 'disable': return await setPolicy(false);
                case 'status': return await showStatus(args);
                case 'disable-user': return await disableUser(args);
                case 'regen-codes': return await regenerateCodes(args);
                case 'force-reset': return await forceReset(args);
                default: return printUsage();
            }
        } catch (error) {
            LoggerService.log('error', `Security command failed: ${error.message}`);
        }
    });
}

module.exports = { register };
