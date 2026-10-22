const crypto = require('crypto');
const DatabaseManager = require('../../manager/database-manager');
const ConfigManager = require('../../manager/config-manager');
const LoggerService = require('../logger/logger-service');
const OneTimeTokenService = require('../token/one-time-token-service');
const EmailService = require('../email/email-service');
const EmailTemplateService = require('../email/email-template-service');
const TotpService = require('./totp-service');

const BACKUP_CODE_COUNT = 10;
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_SENSITIVE_FAILURES = 5;
const SENSITIVE_LOCK_MS = 15 * 60 * 1000;
const EMAIL_CODE_MINUTES = 10;
const EMAIL_CODE_COOLDOWN_MS = 60 * 1000;
const STAFF_MIN_LEVEL = 1;
const STAFF_MAX_LEVEL = 4;

class TwoFactorService {
    static failures = new Map();

    // ---- secret storage ----

    static key() {
        const configured = ConfigManager.key('tfaKey');
        if (!configured) throw new Error('tfaKey is missing from .env');
        return crypto.createHash('sha256').update(configured).digest();
    }

    static encrypt(plain) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
        const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
    }

    static decrypt(stored) {
        const [version, iv, tag, data] = String(stored).split('.');
        if (version !== 'v1') throw new Error('Unknown secret format');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    }

    static issuer() {
        return String(ConfigManager.get('serverName') || ConfigManager.get('websiteName') || 'Neodyme');
    }

    static mailAvailable() {
        return EmailService.isConfigured();
    }

    // ---- failure guard for actions done from an open session ----

    static guard(accountId) {
        const entry = this.failures.get(accountId);
        if (entry && entry.lockedUntil > Date.now()) {
            return Math.ceil((entry.lockedUntil - Date.now()) / 60000);
        }
        return 0;
    }

    static recordFailure(accountId) {
        const entry = this.failures.get(accountId) || { count: 0, lockedUntil: 0 };
        entry.count++;
        if (entry.count >= MAX_SENSITIVE_FAILURES) {
            entry.count = 0;
            entry.lockedUntil = Date.now() + SENSITIVE_LOCK_MS;
            LoggerService.log('warn', `Two-factor codes locked for account ${accountId} after repeated failures`);
        }
        this.failures.set(accountId, entry);
    }

    // ---- backup codes ----

    static hashBackupCode(accountId, code) {
        const normalized = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
        return crypto.createHash('sha256').update(`${accountId}:${normalized}`).digest('hex');
    }

    static generateBackupCodes() {
        return Array.from({ length: BACKUP_CODE_COUNT }, () => {
            const chars = Array.from({ length: 10 }, () => BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)]).join('');
            return `${chars.slice(0, 5)}-${chars.slice(5)}`;
        });
    }

    static backupRemaining(account) {
        return Array.isArray(account.tfaBackupCodes) ? account.tfaBackupCodes.length : 0;
    }

    static async regenerateBackupCodes(accountId) {
        const codes = this.generateBackupCodes();
        await DatabaseManager.updateSecurityFields(accountId, {
            tfaBackupCodes: codes.map(code => this.hashBackupCode(accountId, code))
        });
        return codes;
    }

    // ---- enrollment ----

    static async beginSetup(account) {
        const secret = TotpService.generateSecret();
        await DatabaseManager.updateSecurityFields(account.accountId, { tfaPendingSecret: this.encrypt(secret) });

        return {
            secret,
            uri: TotpService.otpauthUri({ secret, account: account.email || account.displayName, issuer: this.issuer() })
        };
    }

    static async confirmSetup(account, code) {
        if (!account.tfaPendingSecret) return { error: 'Start the setup first.' };

        const secret = this.decrypt(account.tfaPendingSecret);
        const step = TotpService.verify(secret, code);
        if (step === null) return { error: 'That code is not correct. Check the time on your phone and try again.' };

        const codes = this.generateBackupCodes();
        await DatabaseManager.updateSecurityFields(account.accountId, {
            tfaEnabled: true,
            tfaSecret: this.encrypt(secret),
            tfaPendingSecret: null,
            tfaLastStep: step,
            tfaBackupCodes: codes.map(c => this.hashBackupCode(account.accountId, c))
        });

        return { codes };
    }

    static async disable(accountId) {
        await DatabaseManager.updateSecurityFields(accountId, {
            tfaEnabled: false,
            tfaSecret: null,
            tfaPendingSecret: null,
            tfaLastStep: 0,
            tfaBackupCodes: []
        });
        OneTimeTokenService.revokeFor(accountId, 'mfa');
    }

    // ---- verification ----

    // Checks an authenticator code or a backup code. Backup codes are burned on use.
    static async verifySecondFactor(account, code) {
        const wait = this.guard(account.accountId);
        if (wait > 0) return { ok: false, locked: true, message: `Too many wrong codes. Try again in ${wait} minute(s).` };
        if (!account.tfaEnabled || !account.tfaSecret) return { ok: false, message: 'Two-factor authentication is not enabled.' };

        const submitted = String(code || '').trim();
        if (/^\d{6}$/.test(submitted.replace(/\s/g, ''))) {
            const step = TotpService.verify(this.decrypt(account.tfaSecret), submitted, { lastStep: account.tfaLastStep || 0 });
            if (step !== null) {
                await DatabaseManager.updateSecurityFields(account.accountId, { tfaLastStep: step });
                return { ok: true, method: 'totp' };
            }
        } else if (submitted.length >= 8) {
            const hash = this.hashBackupCode(account.accountId, submitted);
            const codes = account.tfaBackupCodes || [];
            if (codes.includes(hash)) {
                await DatabaseManager.updateSecurityFields(account.accountId, { tfaBackupCodes: codes.filter(c => c !== hash) });
                return { ok: true, method: 'backup' };
            }
        }

        this.recordFailure(account.accountId);
        return { ok: false, message: 'That code is not correct.' };
    }

    // ---- two step login ----

    static async startLogin(account, { remember = false } = {}) {
        const { token } = await OneTimeTokenService.issue('mfa', account.accountId, { meta: { remember } });
        return { token, methods: { totp: true, backup: true, email: this.mailAvailable() } };
    }

    static async sendEmailCode(mfaToken) {
        const attempt = OneTimeTokenService.attempt('mfa', mfaToken, MAX_LOGIN_ATTEMPTS * 2);
        if (!attempt.record) return { error: 'This sign-in has expired. Please start again.' };
        if (!this.mailAvailable()) return { error: 'Email codes are not available on this server.' };

        const account = await DatabaseManager.getAccount(attempt.record.accountId);
        if (!account || !account.email) return { error: 'This sign-in has expired. Please start again.' };

        if (OneTimeTokenService.takeCooldown('otp', account.accountId, EMAIL_CODE_COOLDOWN_MS) > 0) {
            return { sent: false };
        }

        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        OneTimeTokenService.updateMeta(mfaToken, {
            emailCode: { hash: this.hashEmailCode(mfaToken, code), expiresAt: Date.now() + EMAIL_CODE_MINUTES * 60000 }
        });

        const template = await EmailTemplateService.get('two-factor-code');
        const extra = { code, expiresIn: `${EMAIL_CODE_MINUTES} minutes` };
        const message = template
            ? await EmailTemplateService.render(template, account, extra)
            : {
                subject: `${this.issuer()} sign-in code`,
                html: EmailService.buildTemplate({ title: 'Sign-in code', heading: 'Your sign-in code', body: `Your code is <strong>${code}</strong>. It expires in ${extra.expiresIn}.` }),
                text: `Your sign-in code is ${code}. It expires in ${extra.expiresIn}.`
            };

        await EmailService.sendMail({ to: account.email, subject: message.subject, html: message.html, text: message.text });
        return { sent: true };
    }

    static hashEmailCode(mfaToken, code) {
        return crypto.createHash('sha256').update(`${mfaToken}:${code}`).digest('hex');
    }

    static async completeLogin(mfaToken, { method, code }) {
        const attempt = OneTimeTokenService.attempt('mfa', mfaToken, MAX_LOGIN_ATTEMPTS);
        if (attempt.error === 'locked') return { error: 'Too many wrong codes. Please sign in again.', restart: true };
        if (!attempt.record) return { error: 'This sign-in has expired. Please sign in again.', restart: true };

        const account = await DatabaseManager.getAccount(attempt.record.accountId);
        if (!account) return { error: 'This sign-in has expired. Please sign in again.', restart: true };

        let verified = false;
        let usedMethod = method;
        if (method === 'email') {
            const stored = attempt.record.meta && attempt.record.meta.emailCode;
            verified = !!stored && stored.expiresAt > Date.now()
                && stored.hash === this.hashEmailCode(mfaToken, String(code || '').trim());
        } else {
            const check = await this.verifySecondFactor(account, code);
            verified = check.ok;
            usedMethod = check.method || method;
        }

        if (!verified) {
            LoggerService.log('warn', `Failed two-factor attempt for ${account.displayName} (${account.accountId})`);
            return { error: 'That code is not correct.' };
        }

        await OneTimeTokenService.consume('mfa', mfaToken);
        await DatabaseManager.updateLastLogin(account.accountId);

        return { account, remember: attempt.record.meta && attempt.record.meta.remember === true, method: usedMethod };
    }

    // ---- staff policy ----

    static staffPolicyEnabled() {
        return ConfigManager.get('require2faForStaff', false) === true;
    }

    static isStaffBlocked(account, roleLevel) {
        const grants = Array.isArray(account.capabilityGrants) ? account.capabilityGrants : [];
        const isStaff = (roleLevel >= STAFF_MIN_LEVEL && roleLevel <= STAFF_MAX_LEVEL)
            || (roleLevel < STAFF_MIN_LEVEL && grants.length > 0);

        return this.staffPolicyEnabled() && isStaff && !account.tfaEnabled;
    }
}

module.exports = TwoFactorService;
