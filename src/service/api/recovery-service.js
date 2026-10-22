const DatabaseManager = require('../../manager/database-manager');
const ConfigManager = require('../../manager/config-manager');
const LoggerService = require('../logger/logger-service');
const OneTimeTokenService = require('../token/one-time-token-service');
const EmailService = require('../email/email-service');
const EmailTemplateService = require('../email/email-template-service');
const FunctionsService = require('./functions-service');

const COOLDOWN_MS = 60 * 1000;

const MAIL = {
    verify: { template: 'verify-email', path: '/verify-email', param: 'token', subject: 'Verify your email' },
    reset: { template: 'reset-password', path: '/reset-password', param: 'token', subject: 'Reset your password' },
    magic: { template: 'magic-link', path: '/login', param: 'magic', subject: 'Your sign-in link' }
};

class RecoveryService {
    static publicUrl() {
        const configured = String(ConfigManager.get('publicUrl', '') || '').trim().replace(/\/+$/, '');
        if (configured) return configured;
        return `${ConfigManager.get('protocol', 'http')}://localhost:${ConfigManager.get('port')}`;
    }

    static mailAvailable() {
        return EmailService.isConfigured();
    }

    static verificationRequired() {
        return ConfigManager.get('requireEmailVerification', false) === true && this.mailAvailable();
    }

    static resetAvailable() {
        return ConfigManager.get('passwordResetEnabled', true) !== false && this.mailAvailable();
    }

    static magicLinkAvailable() {
        return ConfigManager.get('magicLinkEnabled', true) !== false && this.mailAvailable();
    }

    static describeDuration(ms) {
        const minutes = Math.round(ms / 60000);
        if (minutes >= 120) return `${Math.round(minutes / 60)} hours`;
        return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    static async findByEmail(email) {
        if (typeof email !== 'string' || email.length > 254 || !FunctionsService.isValidEmail(email)) return null;
        return (await DatabaseManager.getAccountByEmail(email)) || null;
    }

    static async deliver(type, account) {
        const remaining = OneTimeTokenService.takeCooldown(type, account.accountId, COOLDOWN_MS);
        if (remaining > 0) return { sent: false, cooldownMs: remaining };

        const { token, lifetimeMs } = await OneTimeTokenService.issue(type, account.accountId);
        const spec = MAIL[type];
        const actionUrl = `${this.publicUrl()}${spec.path}?${spec.param}=${encodeURIComponent(token)}`;
        const extra = { actionUrl, expiresIn: this.describeDuration(lifetimeMs) };

        const template = await EmailTemplateService.get(spec.template);
        let message;
        if (template) {
            message = await EmailTemplateService.render(template, account, extra);
        } else {
            const context = EmailTemplateService.buildContext(account, extra);
            message = {
                subject: `${context.serverName}: ${spec.subject}`,
                html: EmailService.buildTemplate({
                    title: spec.subject,
                    heading: spec.subject,
                    body: `This link expires in ${extra.expiresIn}.`,
                    ctaLabel: spec.subject,
                    ctaUrl: actionUrl
                }),
                text: actionUrl
            };
        }

        await EmailService.sendMail({ to: account.email, subject: message.subject, html: message.html, text: message.text });
        return { sent: true };
    }

    // Mail failures are logged and swallowed so the caller can answer identically
    // whether or not an account exists.
    static async deliverQuietly(type, account) {
        try {
            return await this.deliver(type, account);
        } catch (error) {
            LoggerService.log('error', `Could not send ${type} email: ${error.message}`);
            return { sent: false };
        }
    }

    static async onRegister(account) {
        if (!this.verificationRequired()) return false;
        await DatabaseManager.updateAccount(account.accountId, { emailVerified: false });
        await this.deliverQuietly('verify', account);
        return true;
    }

    static async requestVerification(email) {
        const account = await this.findByEmail(email);
        if (account && account.emailVerified === false) await this.deliverQuietly('verify', account);
    }

    static async confirmVerification(token) {
        const record = await OneTimeTokenService.consume('verify', token);
        if (!record) return null;

        const account = await DatabaseManager.getAccount(record.accountId);
        if (!account) return null;

        await DatabaseManager.updateAccount(account.accountId, { emailVerified: true });
        return account;
    }

    static async requestPasswordReset(email) {
        const account = await this.findByEmail(email);
        if (account) await this.deliverQuietly('reset', account);
    }

    static async completePasswordReset(token, newPassword) {
        const check = FunctionsService.isValidPassword(newPassword);
        if (!check.valid) return { success: false, message: check.errors.join('. ') };

        const record = await OneTimeTokenService.consume('reset', token);
        if (!record) return { success: false, message: 'This reset link is invalid or has expired.' };

        const account = await DatabaseManager.getAccount(record.accountId);
        if (!account) return { success: false, message: 'This reset link is invalid or has expired.' };

        await DatabaseManager.resetPassword(account.accountId, newPassword);
        await DatabaseManager.updateAccount(account.accountId, { emailVerified: true });
        OneTimeTokenService.revokeFor(account.accountId);
        await this.revokeSessions(account.accountId);

        LoggerService.log('info', `Password reset completed for ${account.displayName} (${account.accountId})`);
        return { success: true, account };
    }

    static async revokeSessions(accountId) {
        const GameTokens = require('../token/token-service');
        const WebTokens = require('../token/web-token-service');
        await GameTokens.removeAllTokensForAccount(accountId).catch(() => {});
        await WebTokens.revokeAllRefreshTokens(accountId).catch(() => {});
        await DatabaseManager.updateSecurityFields(accountId, { sessionsValidAfter: Date.now() }).catch(() => {});
    }

    static async issueResetLink(account) {
        const { token, lifetimeMs } = await OneTimeTokenService.issue('reset', account.accountId);
        return {
            link: `${this.publicUrl()}/reset-password?token=${encodeURIComponent(token)}`,
            expiresIn: this.describeDuration(lifetimeMs)
        };
    }

    static appealsAvailable() {
        return ConfigManager.get('banAppealsEnabled', true) !== false;
    }

    static async submitAppeal(email, message) {
        const account = await this.findByEmail(email);
        if (!account) return { created: false };

        const ban = await DatabaseManager.getBanInfo(account.accountId);
        const banned = ban && ban.banned && (!ban.banExpires || new Date(ban.banExpires) > new Date());
        if (!banned) return { created: false };

        const TicketService = require('./ticket-service');
        const result = await TicketService.createAppeal(account, email, message);
        return { created: result.success === true };
    }

    static async requestMagicLink(email) {
        const account = await this.findByEmail(email);
        if (account) await this.deliverQuietly('magic', account);
    }

    static async consumeMagicLink(token) {
        const record = await OneTimeTokenService.consume('magic', token);
        if (!record) return { error: 'This sign-in link is invalid or has expired.' };

        const account = await DatabaseManager.getAccount(record.accountId);
        if (!account) return { error: 'This sign-in link is invalid or has expired.' };

        const banInfo = await DatabaseManager.getBanInfo(account.accountId);
        if (banInfo && banInfo.banned && (!banInfo.banExpires || new Date(banInfo.banExpires) > new Date())) {
            return { error: 'This account has been disabled.', forbidden: true };
        }

        if (account.emailVerified === false) {
            await DatabaseManager.updateAccount(account.accountId, { emailVerified: true });
        }
        await DatabaseManager.updateLastLogin(account.accountId);

        return { account };
    }
}

module.exports = RecoveryService;
