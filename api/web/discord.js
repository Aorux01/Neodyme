const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const ConfigManager = require('../../src/manager/config-manager');
const DiscordService = require('../../src/service/security/discord-service');
const TwoFactorService = require('../../src/service/security/two-factor-service');
const WebTokenService = require('../../src/service/token/web-token-service');
const LoggerService = require('../../src/service/logger/logger-service');
const WebService = require('../../src/service/api/web-service');
const { authRateLimit } = require('../../src/middleware/rate-limit-middleware');

const { setAuthCookies } = WebService;

const STATE_COOKIE = 'neodyme_oauth_state';
const COOKIE_PATH = '/neodyme/api/auth/discord';

// Lax on purpose: the callback is a top level navigation coming from discord.com,
// which a Strict cookie would not travel with.
const stateCookieOptions = () => ({
    httpOnly: true,
    secure: ConfigManager.get('secureCookies', false),
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: 10 * 60 * 1000
});

const errorPage = (mode, error) => `${mode === 'link' ? '/security' : '/login'}?oauth_error=${encodeURIComponent(error)}`;

router.get('/neodyme/api/auth/discord/login', authRateLimit(), async (req, res) => {
    try {
        if (!DiscordService.enabled()) return res.redirect(errorPage('login', 'unavailable'));

        const { state, url } = await DiscordService.begin({ mode: 'login', redirect: req.query.redirect });
        res.cookie(STATE_COOKIE, state, stateCookieOptions());
        return res.redirect(url);
    } catch (error) {
        LoggerService.log('error', `Discord login start failed: ${error.message}`);
        return res.redirect(errorPage('login', 'failed'));
    }
});

router.get('/neodyme/api/auth/discord/callback', authRateLimit(), async (req, res) => {
    const clearState = () => res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(), maxAge: undefined });

    try {
        if (!DiscordService.enabled()) return res.redirect(errorPage('login', 'unavailable'));

        const result = await DiscordService.complete({
            code: typeof req.query.code === 'string' ? req.query.code : '',
            state: typeof req.query.state === 'string' ? req.query.state : '',
            cookieState: req.cookies && req.cookies[STATE_COOKIE]
        });
        clearState();

        if (result.outcome === 'error') return res.redirect(errorPage(result.mode, result.error));
        if (result.outcome === 'linked') return res.redirect('/security?linked=discord');

        const { account, redirect } = result;

        if (account.tfaEnabled) {
            const challenge = await TwoFactorService.startLogin(account);
            const methods = Object.entries(challenge.methods).filter(([, on]) => on).map(([name]) => name).join(',');
            return res.redirect(`/login?mfa=${encodeURIComponent(challenge.token)}&m=${methods}&redirect=${encodeURIComponent(redirect)}`);
        }

        await DatabaseManager.updateLastLogin(account.accountId);
        const tokens = await WebTokenService.generateTokenPair(account.accountId, 'fortnite', account.displayName);
        setAuthCookies(res, tokens.access_token, false);
        return res.redirect(redirect);
    } catch (error) {
        clearState();
        LoggerService.log('error', `Discord callback failed: ${error.message}`);
        return res.redirect(errorPage('login', 'failed'));
    }
});

module.exports = router;
module.exports.STATE_COOKIE = STATE_COOKIE;
module.exports.stateCookieOptions = stateCookieOptions;
