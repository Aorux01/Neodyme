const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const DatabaseManager = require('../../src/manager/database-manager');
const TwoFactorService = require('../../src/service/security/two-factor-service');
const DiscordService = require('../../src/service/security/discord-service');
const { STATE_COOKIE, stateCookieOptions } = require('./discord');
const AuditService = require('../../src/service/api/audit-service');
const TicketService = require('../../src/service/api/ticket-service');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const AuthService = require('../../src/service/api/auth-service');
const { buildZip } = require('../../src/utils/zip-builder');
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

const EXPORT_ACCOUNT_FIELDS = ['accountId', 'displayName', 'email', 'created', 'createdAt', 'lastLogin', 'emailVerified', 'tfaEnabled', 'role', 'roleLevel'];
const EXPORT_GAME_PROFILES = ['athena', 'common_core', 'common_public', 'campaign', 'creative', 'collections', 'metadata'];

const attempt = async (job, fallback) => {
    try {
        return await job();
    } catch {
        return fallback;
    }
};

const FAVORITE_PREFIX = 'favorite_';

// Readable views of the athena profile: what is equipped and what is owned.
function lockerFiles(athena) {
    if (!athena || typeof athena !== 'object') return [];
    const items = athena.items || {};
    const attributes = (athena.stats && athena.stats.attributes) || {};

    const favorites = {};
    for (const [key, value] of Object.entries(attributes)) {
        if (key.startsWith(FAVORITE_PREFIX)) favorites[key] = value;
    }

    const lockers = Object.entries(items)
        .filter(([, item]) => String(item.templateId).startsWith('CosmeticLocker:'))
        .map(([id, item]) => ({ id, templateId: item.templateId, attributes: item.attributes || {} }));

    const cosmetics = Object.entries(items)
        .filter(([, item]) => String(item.templateId).startsWith('Athena') && !String(item.templateId).startsWith('AthenaSeason'))
        .map(([id, item]) => ({
            id,
            templateId: item.templateId,
            favorite: !!(item.attributes && item.attributes.favorite),
            seen: !!(item.attributes && item.attributes.item_seen),
            variants: (item.attributes && item.attributes.variants) || []
        }));

    return [
        { name: 'locker.json', data: JSON.stringify({
            lastAppliedLoadout: attributes.last_applied_loadout || null,
            loadouts: attributes.loadouts || [],
            favorites,
            lockers
        }, null, 2) },
        { name: 'cosmetics.json', data: JSON.stringify({ count: cosmetics.length, items: cosmetics }, null, 2) }
    ];
}

const README = (account, now) => [
    'Neodyme account export',
    `Account: ${account.displayName} (${account.accountId})`,
    `Created: ${now.toISOString()}`,
    '',
    'Every file is plain JSON. Passwords, password hashes, two-factor secrets, backup codes and session tokens are never included.',
    '',
    'account.json: profile',
    'settings.json: website and privacy settings',
    'friends.json: friends, requests and blocked players',
    'purchases.json: purchase history',
    'linked-accounts.json: linked sign-in providers',
    'security-events.json: security activity on your account',
    'sessions.json: active sessions',
    'tickets.json: your support tickets and their messages',
    'creator-code.json: your creator code and requests',
    'locker.json: your locker, equipped items and loadouts',
    'cosmetics.json: every cosmetic you own',
    'game-profiles/: your full game profiles (items, stats, V-Bucks)',
    ''
].join('\r\n');

router.post('/neodyme/api/security/export', ...secured, async (req, res) => {
    try {
        const account = await confirmIdentity(req, res, { needCode: false, codeIfEnabled: true });
        if (!account) return;

        const accountId = account.accountId;
        const [settings, friends, purchases, links, entries, tickets, creatorCode, creatorRequest, sessions] = await Promise.all([
            attempt(() => DatabaseManager.getUserSettings(accountId), {}),
            attempt(() => DatabaseManager.getFriends(accountId), {}),
            attempt(() => DatabaseManager.getUserPurchaseHistory(accountId), []),
            attempt(() => DatabaseManager.getAccountLinks(accountId), []),
            attempt(() => AuditService.getTargetHistory('account', accountId, 1000), []),
            attempt(() => TicketService.getPlayerTickets(accountId), []),
            attempt(() => CreatorCodeService.getUserCode(accountId), null),
            attempt(() => CreatorCodeService.getUserRequest(accountId), null),
            attempt(() => AuthService.getActiveSessions(accountId), [])
        ]);

        const profile = {};
        for (const field of EXPORT_ACCOUNT_FIELDS) {
            if (account[field] !== undefined) profile[field] = account[field];
        }

        const json = (value) => JSON.stringify(value, null, 2);
        const now = new Date();
        const files = [
            { name: 'README.txt', data: README(account, now) },
            { name: 'account.json', data: json(profile) },
            { name: 'settings.json', data: json(settings) },
            { name: 'friends.json', data: json({
                friends: (friends.friends || []).map(f => f.accountId || f),
                incoming: friends.incoming || [],
                outgoing: friends.outgoing || [],
                blocked: friends.blocklist || []
            }) },
            { name: 'purchases.json', data: json(purchases || []) },
            { name: 'linked-accounts.json', data: json((links || []).map(l => ({ provider: l.provider, username: l.username, linkedAt: l.linkedAt }))) },
            { name: 'security-events.json', data: json(entries
                .filter(e => String(e.action).startsWith('security.'))
                .map(e => ({ action: e.action, timestamp: e.timestamp, ip: AuditService.normalizeIp(e.ipAddress) || null }))) },
            { name: 'sessions.json', data: json((Array.isArray(sessions) ? sessions : []).map(x => ({
                sessionId: x.sessionId, deviceId: x.deviceId, ip: x.ip, createdAt: x.createdAt, lastActivity: x.lastActivity, expiresAt: x.expiresAt
            }))) },
            { name: 'tickets.json', data: json(tickets) },
            { name: 'creator-code.json', data: json({ code: creatorCode, request: creatorRequest }) }
        ];

        for (const id of EXPORT_GAME_PROFILES) {
            const data = await attempt(() => DatabaseManager.getProfile(accountId, id), null);
            if (!data) continue;
            files.push({ name: `game-profiles/${id}.json`, data: json(data) });
            if (id === 'athena') files.push(...lockerFiles(data));
        }

        await audit('security.data_export', req);

        res.set('Cache-Control', 'no-store');
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename="neodyme-account-${accountId}.zip"`);
        return res.send(buildZip(files, now));
    } catch (error) {
        return WebResponse.serverError(res, 'account export', error);
    }
});

module.exports = router;
