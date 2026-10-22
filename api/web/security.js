const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const DatabaseManager = require('../../src/manager/database-manager');
const TwoFactorService = require('../../src/service/security/two-factor-service');
const DiscordService = require('../../src/service/security/discord-service');
const { STATE_COOKIE, stateCookieOptions } = require('./discord');
const AuditService = require('../../src/service/api/audit-service');
const WebTokenService = require('../../src/service/token/web-token-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const LoggerService = require('../../src/service/logger/logger-service');
const { authRateLimit } = require('../../src/middleware/rate-limit-middleware');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');

const { setAuthCookies, verifyToken } = WebService;
const secured = [verifyToken, csrfProtection, authRateLimit()];

const text = (value) => (typeof value === 'string' ? value : '');

const audit = (action, req, details = {}) =>
    AuditService.log(action, req.user.accountId, req.user.displayName, 'account', req.user.accountId, details, req.ip)
        .catch(() => {});

// Confirms the password and, when two-factor is on, a valid code. Returns the
// account on success, or sends the error response itself and returns null.
async function confirmIdentity(req, res, { needCode, codeIfEnabled = false }) {
    const account = await DatabaseManager.getAccount(req.user.accountId);
    if (!account) {
        WebResponse.unauthorized(res, 'Session expired. Please sign in again.');
        return null;
    }

    if (!(await bcrypt.compare(text(req.body.password), account.password))) {
        WebResponse.unauthorized(res, 'Incorrect password.');
        return null;
    }

    if (needCode || (codeIfEnabled && account.tfaEnabled)) {
        const check = await TwoFactorService.verifySecondFactor(account, req.body.code);
        if (!check.ok) {
            check.locked ? WebResponse.rateLimited(res, check.message) : WebResponse.fail(res, 'TWO_FACTOR_REQUIRED', check.message);
            return null;
        }
    }

    return account;
}

router.post('/neodyme/api/auth/login/2fa', authRateLimit(), async (req, res) => {
    try {
        const { mfaToken, method, code } = req.body || {};
        if (typeof mfaToken !== 'string' || !code) return WebResponse.badRequest(res, 'A code is required.');

        const result = await TwoFactorService.completeLogin(mfaToken, { method: text(method), code: text(code) });
        if (result.error) {
            return result.restart
                ? WebResponse.fail(res, 'MFA_EXPIRED', result.error)
                : WebResponse.unauthorized(res, result.error);
        }

        const { account } = result;
        const tokens = await WebTokenService.generateTokenPair(account.accountId, 'fortnite', account.displayName);
        setAuthCookies(res, tokens.access_token, result.remember);

        if (result.method === 'backup') {
            LoggerService.log('warn', `Backup code used to sign in: ${account.displayName} (${account.accountId})`);
            AuditService.log('security.backup_code_used', account.accountId, account.displayName, 'account', account.accountId, {}, req.ip).catch(() => {});
        }

        return WebResponse.ok(res, {
            message: 'Login successful.',
            backupCodesRemaining: TwoFactorService.backupRemaining(await DatabaseManager.getAccount(account.accountId)),
            user: { accountId: account.accountId, displayName: account.displayName, email: account.email }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'two-factor login', error);
    }
});

router.post('/neodyme/api/auth/login/2fa/email', authRateLimit(), async (req, res) => {
    try {
        const token = text(req.body && req.body.mfaToken);
        if (!token) return WebResponse.badRequest(res, 'Invalid request.');

        const result = await TwoFactorService.sendEmailCode(token);
        if (result.error) return WebResponse.fail(res, 'MFA_EXPIRED', result.error);

        return WebResponse.ok(res, { message: 'If email is available for this account, a code is on its way.' });
    } catch (error) {
        return WebResponse.serverError(res, 'two-factor email code', error);
    }
});

router.get('/neodyme/api/security/status', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) return WebResponse.unauthorized(res);

        return WebResponse.ok(res, {
            enabled: account.tfaEnabled === true,
            backupCodesRemaining: TwoFactorService.backupRemaining(account),
            emailFallback: TwoFactorService.mailAvailable(),
            staffPolicy: TwoFactorService.staffPolicyEnabled()
        });
    } catch (error) {
        return WebResponse.serverError(res, 'security status', error);
    }
});

router.post('/neodyme/api/security/2fa/setup', ...secured, async (req, res) => {
    try {
        const account = await confirmIdentity(req, res, { needCode: false });
        if (!account) return;
        if (account.tfaEnabled) return WebResponse.conflict(res, 'Two-factor authentication is already enabled.');

        const { secret, uri } = await TwoFactorService.beginSetup(account);
        return WebResponse.ok(res, { secret, uri });
    } catch (error) {
        return WebResponse.serverError(res, '2fa setup', error);
    }
});

router.post('/neodyme/api/security/2fa/enable', ...secured, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) return WebResponse.unauthorized(res);
        if (account.tfaEnabled) return WebResponse.conflict(res, 'Two-factor authentication is already enabled.');

        const wait = TwoFactorService.guard(account.accountId);
        if (wait > 0) return WebResponse.rateLimited(res, `Too many wrong codes. Try again in ${wait} minute(s).`);

        const result = await TwoFactorService.confirmSetup(account, text(req.body.code));
        if (result.error) {
            TwoFactorService.recordFailure(account.accountId);
            return WebResponse.badRequest(res, result.error);
        }

        LoggerService.log('info', `Two-factor authentication enabled: ${account.displayName} (${account.accountId}). It protects the website only, the game login still uses the password.`);
        await audit('security.2fa_enabled', req);

        return WebResponse.ok(res, { message: 'Two-factor authentication is on.', backupCodes: result.codes });
    } catch (error) {
        return WebResponse.serverError(res, '2fa enable', error);
    }
});

router.post('/neodyme/api/security/2fa/disable', ...secured, async (req, res) => {
    try {
        const account = await confirmIdentity(req, res, { needCode: true });
        if (!account) return;

        await TwoFactorService.disable(account.accountId);
        LoggerService.log('info', `Two-factor authentication disabled: ${account.displayName} (${account.accountId})`);
        await audit('security.2fa_disabled', req);

        return WebResponse.ok(res, { message: 'Two-factor authentication is off.' });
    } catch (error) {
        return WebResponse.serverError(res, '2fa disable', error);
    }
});

router.post('/neodyme/api/security/2fa/backup-codes', ...secured, async (req, res) => {
    try {
        const account = await confirmIdentity(req, res, { needCode: true });
        if (!account) return;

        const codes = await TwoFactorService.regenerateBackupCodes(account.accountId);
        await audit('security.backup_codes_regenerated', req);

        return WebResponse.ok(res, { message: 'New backup codes generated. The old ones no longer work.', backupCodes: codes });
    } catch (error) {
        return WebResponse.serverError(res, '2fa backup codes', error);
    }
});

router.get('/neodyme/api/security/links', verifyToken, async (req, res) => {
    try {
        const links = await DatabaseManager.getAccountLinks(req.user.accountId);
        return WebResponse.ok(res, {
            providers: { discord: DiscordService.enabled() },
            links: links.map(l => ({ provider: l.provider, username: l.username, linkedAt: l.linkedAt }))
        });
    } catch (error) {
        return WebResponse.serverError(res, 'list links', error);
    }
});

router.post('/neodyme/api/security/links/discord/start', ...secured, async (req, res) => {
    try {
        if (!DiscordService.enabled()) return WebResponse.fail(res, 'FEATURE_UNAVAILABLE', 'Discord is not set up on this server.');

        const { state, url } = await DiscordService.begin({ mode: 'link', accountId: req.user.accountId });
        res.cookie(STATE_COOKIE, state, stateCookieOptions());
        return WebResponse.ok(res, { url });
    } catch (error) {
        return WebResponse.serverError(res, 'discord link start', error);
    }
});

router.post('/neodyme/api/security/links/discord/unlink', ...secured, async (req, res) => {
    try {
        const account = await confirmIdentity(req, res, { needCode: false, codeIfEnabled: true });
        if (!account) return;

        const removed = await DatabaseManager.removeAccountLink(account.accountId, 'discord');
        if (!removed) return WebResponse.notFound(res, 'No Discord account is linked.');

        await audit('security.link_removed', req, { provider: 'discord' });
        return WebResponse.ok(res, { message: 'Discord unlinked.' });
    } catch (error) {
        return WebResponse.serverError(res, 'discord unlink', error);
    }
});

router.get('/neodyme/api/security/log', verifyToken, async (req, res) => {
    try {
        const entries = await AuditService.getTargetHistory('account', req.user.accountId, 100);
        const events = entries
            .filter(e => String(e.action).startsWith('security.'))
            .slice(0, 30)
            .map(e => ({ action: e.action, timestamp: e.timestamp, ip: e.ipAddress || null }));

        res.set('Cache-Control', 'no-store');
        return WebResponse.ok(res, { events });
    } catch (error) {
        return WebResponse.serverError(res, 'security log', error);
    }
});

module.exports = router;
