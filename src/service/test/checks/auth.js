const TestRegistry = require('../test-registry');
const AuthService = require('../../api/auth-service');
const TokenService = require('../../token/token-service');
const DatabaseManager = require('../../../manager/database-manager');
const ConfigManager = require('../../../manager/config-manager');

const CLIENT_ID = 'neodyme-test-client';
const DEVICE_ID = 'neodyme-test-device';
const IP = '127.0.0.1';

const register = (id, title, run) => TestRegistry.register({ id, group: 'auth', title, kind: 'functional', run });

const login = (user, password) =>
    AuthService.authenticateWithPassword(user.email, password || user.password, CLIENT_ID, DEVICE_ID, IP);

const expectRejected = async (promise, what) => {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error(`${what} should have been rejected`);
};

register('auth.account-lifecycle', 'Account create, lookup and delete', async (fx) => {
    const user = await fx.createAccount();
    const id = user.account.accountId;

    if (!(await DatabaseManager.getAccountByEmail(user.email))) throw new Error('Lookup by email failed');
    if (!(await DatabaseManager.getAccountByDisplayName(user.displayName))) throw new Error('Lookup by display name failed');
    for (const profile of ['athena', 'common_core']) {
        if (!(await DatabaseManager.getProfile(id, profile))) throw new Error(`Profile ${profile} was not created`);
    }

    await expectRejected(
        DatabaseManager.getDatabaseInstance().createAccount(user.email, user.password, `${user.displayName}x`),
        'A duplicate email'
    );

    await DatabaseManager.deleteAccount(id);
    if (await DatabaseManager.getAccount(id)) throw new Error('Account still exists after delete');
    if (await DatabaseManager.getProfile(id, 'athena')) throw new Error('Profiles still exist after delete');
});

register('auth.password-policy', 'Weak passwords are refused', async (fx) => {
    const user = await fx.createAccount();
    await expectRejected(
        DatabaseManager.getDatabaseInstance().createAccount(`w-${user.email}`, 'abc', `${user.displayName}w`),
        'A weak password'
    );
});

register('auth.login', 'Password login issues a valid token', async (fx) => {
    const user = await fx.createAccount();
    const session = await login(user);

    if (session.account_id !== user.account.accountId) throw new Error('Token was issued for another account');
    if (!(await TokenService.isValidAccessToken(session.access_token))) throw new Error('Access token is not valid');

    const decoded = TokenService.verifyToken(session.access_token);
    if (!decoded || decoded.sub !== user.account.accountId) throw new Error('Token subject does not match the account');
});

register('auth.bad-password', 'Wrong password is refused and counted', async (fx) => {
    const user = await fx.createAccount();

    const error = await expectRejected(login(user, `${user.password}x`), 'A wrong password');
    if (!error.errorCode) throw new Error('Rejection carries no error code');

    const afterFail = await DatabaseManager.getAccount(user.account.accountId);
    if (!(afterFail.failedLoginAttempts >= 1)) throw new Error('Failed attempt was not recorded');

    await login(user);
    const afterLogin = await DatabaseManager.getAccount(user.account.accountId);
    if (afterLogin.failedLoginAttempts !== 0) throw new Error('Failed attempts were not reset by a good login');
});

register('auth.refresh', 'Refresh token issues a new access token', async (fx) => {
    const user = await fx.createAccount();
    const session = await login(user);

    const refreshed = await AuthService.refreshAccessToken(session.refresh_token, CLIENT_ID, DEVICE_ID, IP);
    if (!refreshed.access_token || refreshed.access_token === session.access_token) throw new Error('No new access token');
    if (!(await TokenService.isValidAccessToken(refreshed.access_token))) throw new Error('Refreshed token is not valid');
});

register('auth.revoke', 'Tokens can be revoked one by one or all at once', async (fx) => {
    const user = await fx.createAccount();
    const id = user.account.accountId;

    const first = await login(user);
    await AuthService.killToken(first.access_token);
    if (await TokenService.isValidAccessToken(first.access_token)) throw new Error('Token still valid after killToken');

    const second = await login(user);
    const third = await login(user);
    await AuthService.killAllTokensForAccount(id);
    for (const session of [second, third]) {
        if (await TokenService.isValidAccessToken(session.access_token)) throw new Error('Token survived killAllTokensForAccount');
    }
});

register('auth.ban', 'Bans block login, expired bans lift themselves', async (fx) => {
    const user = await fx.createAccount();
    const id = user.account.accountId;

    await DatabaseManager.banAccount(id, ['test'], null);
    await expectRejected(login(user), 'A banned account');

    await DatabaseManager.unbanAccount(id);
    await login(user);

    await DatabaseManager.banAccount(id, ['test'], new Date(Date.now() - 1000).toISOString());
    await login(user);
    if ((await DatabaseManager.getBanInfo(id)).banned) throw new Error('Expired ban was not lifted');
});

register('auth.whitelist', 'Whitelist gate follows the whitelist data', async (fx) => {
    const user = await fx.createAccount();
    const id = user.account.accountId;

    if (await DatabaseManager.isWhitelisted(id)) throw new Error('New account is already whitelisted');
    await DatabaseManager.addToWhitelist(id);
    if (!(await DatabaseManager.isWhitelisted(id))) throw new Error('addToWhitelist had no effect');
    await AuthService.checkWhitelist(id);

    await DatabaseManager.removeFromWhitelist(id);
    if (await DatabaseManager.isWhitelisted(id)) throw new Error('removeFromWhitelist had no effect');

    if (ConfigManager.get('whitelistEnabled', false) === true) {
        await expectRejected(AuthService.checkWhitelist(id), 'A non whitelisted account');
        return { message: 'Whitelist is enabled and enforced' };
    }
    await AuthService.checkWhitelist(id);
    return { message: 'Whitelist data verified (feature is disabled)' };
});
