const crypto = require('crypto');
const ConfigManager = require('../../manager/config-manager');
const DatabaseManager = require('../../manager/database-manager');
const LoggerService = require('../logger/logger-service');
const OneTimeTokenService = require('../token/one-time-token-service');
const AuditService = require('../api/audit-service');
const RecoveryService = require('../api/recovery-service');

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const PROFILE_URL = 'https://discord.com/api/users/@me';
const REQUEST_TIMEOUT_MS = 8000;

class DiscordService {
    // Swapped in tests so no request leaves the machine.
    static fetchImpl = (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

    static clientId() {
        return ConfigManager.key('DISCORD_CLIENT_ID');
    }

    static clientSecret() {
        return ConfigManager.key('DISCORD_CLIENT_SECRET');
    }

    // Silently off until the host puts both keys in .env.
    static enabled() {
        return !!this.clientId() && !!this.clientSecret() && ConfigManager.get('discordLoginEnabled', true) !== false;
    }

    static redirectUri() {
        return `${RecoveryService.publicUrl()}/neodyme/api/auth/discord/callback`;
    }

    static safeRedirect(value) {
        const target = typeof value === 'string' ? value : '';
        return target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') ? target : '/dashboard';
    }

    static authorizeUrl(state) {
        const params = new URLSearchParams({
            client_id: this.clientId(),
            redirect_uri: this.redirectUri(),
            response_type: 'code',
            scope: 'identify',
            state,
            prompt: 'none'
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
    }

    static async begin({ mode, accountId = null, redirect = '/dashboard' }) {
        const key = accountId || `anon:${crypto.randomBytes(8).toString('hex')}`;
        const { token } = await OneTimeTokenService.issue('oauth', key, {
            meta: { mode, accountId, redirect: this.safeRedirect(redirect) }
        });
        return { state: token, url: this.authorizeUrl(token) };
    }

    static async identify(code) {
        const tokenResponse = await this.fetchImpl(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId(),
                client_secret: this.clientSecret(),
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.redirectUri()
            })
        });
        if (!tokenResponse.ok) throw new Error(`Discord refused the code (${tokenResponse.status})`);
        const { access_token: accessToken } = await tokenResponse.json();
        if (!accessToken) throw new Error('Discord returned no access token');

        const profileResponse = await this.fetchImpl(PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!profileResponse.ok) throw new Error(`Discord profile request failed (${profileResponse.status})`);
        const profile = await profileResponse.json();
        if (!profile.id) throw new Error('Discord returned no user id');

        return { id: String(profile.id), username: String(profile.global_name || profile.username || 'Discord user') };
    }

    static statesMatch(state, cookieState) {
        if (typeof state !== 'string' || typeof cookieState !== 'string' || state.length !== cookieState.length) return false;
        return crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState));
    }

    // Turns the callback into an outcome the route can act on. An account is only
    // ever linked from an authenticated session, never matched by email.
    static async complete({ code, state, cookieState }) {
        if (!this.statesMatch(state, cookieState)) return { outcome: 'error', error: 'state' };

        const record = await OneTimeTokenService.consume('oauth', state);
        if (!record) return { outcome: 'error', error: 'state' };

        const mode = record.meta && record.meta.mode;
        const fail = (error) => ({ outcome: 'error', error, mode });

        if (!code) return fail('denied');

        let profile;
        try {
            profile = await this.identify(code);
        } catch (error) {
            LoggerService.log('warn', `Discord sign-in failed: ${error.message}`);
            return fail('failed');
        }

        return mode === 'link'
            ? this.completeLink(record, profile, fail)
            : this.completeLogin(record, profile, fail);
    }

    static async completeLink(record, profile, fail) {
        const account = await DatabaseManager.getAccount(record.meta.accountId);
        if (!account) return fail('failed');

        const existing = await DatabaseManager.findAccountLink('discord', profile.id);
        if (existing) return existing.accountId === account.accountId ? { outcome: 'linked', mode: 'link' } : fail('taken');

        const added = await DatabaseManager.addAccountLink({
            provider: 'discord', providerId: profile.id, accountId: account.accountId, username: profile.username
        });
        if (!added) return fail('already_linked');

        await AuditService.log('security.link_added', account.accountId, account.displayName, 'account', account.accountId,
            { provider: 'discord', username: profile.username }, null).catch(() => {});
        LoggerService.log('info', `Discord account linked: ${account.displayName} (${account.accountId}) as ${profile.username}`);

        return { outcome: 'linked', mode: 'link', account };
    }

    static async completeLogin(record, profile, fail) {
        const link = await DatabaseManager.findAccountLink('discord', profile.id);
        const account = link && await DatabaseManager.getAccount(link.accountId);
        if (!account) return fail('not_linked');

        const ban = await DatabaseManager.getBanInfo(account.accountId);
        if (ban && ban.banned && (!ban.banExpires || new Date(ban.banExpires) > new Date())) return fail('banned');

        return { outcome: 'login', mode: 'login', account, redirect: record.meta.redirect };
    }
}

module.exports = DiscordService;
