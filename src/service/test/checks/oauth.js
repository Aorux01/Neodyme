const crypto = require('crypto');
const TestRegistry = require('../test-registry');
const DiscordService = require('../../security/discord-service');
const OneTimeTokenService = require('../../token/one-time-token-service');
const DatabaseManager = require('../../../manager/database-manager');
const ConfigManager = require('../../../manager/config-manager');

const register = (id, title, run) => TestRegistry.register({ id, group: 'oauth', title, kind: 'functional', run });

const expectEqual = (actual, expected, what) => {
    if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

// Runs a body with Discord keys in place and a stubbed Discord API, then puts everything back.
async function withFakeDiscord(profile, body) {
    const env = ConfigManager.env;
    const saved = { id: env.DISCORD_CLIENT_ID, secret: env.DISCORD_CLIENT_SECRET, fetch: DiscordService.fetchImpl };

    env.DISCORD_CLIENT_ID = 'test-client-id';
    env.DISCORD_CLIENT_SECRET = 'test-client-secret';
    DiscordService.fetchImpl = async (url) => {
        const payload = String(url).endsWith('/oauth2/token') ? { access_token: 'fake-token' } : profile.current;
        return { ok: true, status: 200, json: async () => payload };
    };

    try {
        return await body();
    } finally {
        env.DISCORD_CLIENT_ID = saved.id;
        env.DISCORD_CLIENT_SECRET = saved.secret;
        DiscordService.fetchImpl = saved.fetch;
    }
}

register('oauth.off-without-keys', 'Discord stays off until both keys are in .env', () => {
    const env = ConfigManager.env;
    const saved = { id: env.DISCORD_CLIENT_ID, secret: env.DISCORD_CLIENT_SECRET };

    try {
        delete env.DISCORD_CLIENT_ID;
        delete env.DISCORD_CLIENT_SECRET;
        expectEqual(DiscordService.enabled(), false, 'No keys');
        env.DISCORD_CLIENT_ID = 'only-the-id';
        expectEqual(DiscordService.enabled(), false, 'Only the client id');
        env.DISCORD_CLIENT_SECRET = 'and-the-secret';
        expectEqual(DiscordService.enabled(), true, 'Both keys');
    } finally {
        env.DISCORD_CLIENT_ID = saved.id;
        env.DISCORD_CLIENT_SECRET = saved.secret;
    }
});

register('oauth.authorize-url', 'The authorize link carries a one-time state and the right scope', async () => {
    await withFakeDiscord({ current: {} }, async () => {
        const { url, state } = await DiscordService.begin({ mode: 'login', redirect: '//evil.example' });
        const parsed = new URL(url);

        expectEqual(parsed.origin, 'https://discord.com', 'Authorize host');
        expectEqual(parsed.searchParams.get('client_id'), 'test-client-id', 'client_id');
        expectEqual(parsed.searchParams.get('scope'), 'identify', 'scope');
        expectEqual(parsed.searchParams.get('response_type'), 'code', 'response_type');
        expectEqual(parsed.searchParams.get('state'), state, 'state');
        if (!parsed.searchParams.get('redirect_uri').endsWith('/neodyme/api/auth/discord/callback')) throw new Error('Wrong redirect_uri');
        if (!OneTimeTokenService.peek('oauth', state)) throw new Error('The state is not stored');

        const record = await OneTimeTokenService.consume('oauth', state);
        expectEqual(record.meta.redirect, '/dashboard', 'A redirect to another site must fall back to the dashboard');
    });
});

register('oauth.link-and-login', 'Accounts are linked from a session and never matched by email', async (fx) => {
    const discordId = String(crypto.randomInt(1e9, 9e9));
    const profile = { current: { id: discordId, username: 'neo' } };
    const first = await fx.createAccount();
    const second = await fx.createAccount();

    await withFakeDiscord(profile, async () => {
        const run = async (mode, accountId, overrides = {}) => {
            const { state } = await DiscordService.begin({ mode, accountId });
            return DiscordService.complete({ code: 'abc', state, cookieState: state, ...overrides });
        };

        let result = await run('link', first.account.accountId);
        expectEqual(result.outcome, 'linked', 'Link the first account');
        expectEqual((await DatabaseManager.getAccountLinks(first.account.accountId)).length, 1, 'Stored links');

        expectEqual((await run('link', first.account.accountId)).outcome, 'linked', 'Linking twice is harmless');

        result = await run('link', second.account.accountId);
        expectEqual(`${result.outcome}:${result.error}`, 'error:taken', 'Same Discord on another account');

        result = await run('login', null);
        expectEqual(result.outcome, 'login', 'Login through the link');
        expectEqual(result.account.accountId, first.account.accountId, 'Account behind the link');

        const { state } = await DiscordService.begin({ mode: 'login' });
        expectEqual((await DiscordService.complete({ code: 'abc', state, cookieState: 'not-the-cookie' })).error, 'state', 'Cookie mismatch');
        expectEqual((await DiscordService.complete({ code: 'abc', state, cookieState: state })).outcome, 'login', 'A cookie mismatch does not burn the state');

        const reused = await DiscordService.begin({ mode: 'login' });
        await DiscordService.complete({ code: 'abc', state: reused.state, cookieState: reused.state });
        expectEqual((await DiscordService.complete({ code: 'abc', state: reused.state, cookieState: reused.state })).error, 'state', 'Reused state');

        expectEqual((await run('login', null, { code: '' })).error, 'denied', 'Cancelled on Discord');

        await DatabaseManager.banAccount(first.account.accountId, ['test'], null);
        expectEqual((await run('login', null)).error, 'banned', 'Banned account');
        await DatabaseManager.unbanAccount(first.account.accountId);

        profile.current = { id: String(crypto.randomInt(1e9, 9e9)), username: 'stranger' };
        expectEqual((await run('login', null)).error, 'not_linked', 'Unknown Discord profile');
        profile.current = { id: discordId, username: 'neo' };

        expectEqual(await DatabaseManager.removeAccountLink(first.account.accountId, 'discord'), true, 'Unlink');
        expectEqual((await run('login', null)).error, 'not_linked', 'Login after unlink');
    });
});
