const TestRegistry = require('../test-registry');
const AuthService = require('../../api/auth-service');
const RecoveryService = require('../../api/recovery-service');
const TokenService = require('../../token/token-service');
const OneTimeTokenService = require('../../token/one-time-token-service');
const DatabaseManager = require('../../../manager/database-manager');

const CLIENT_ID = 'neodyme-test-client';
const DEVICE_ID = 'neodyme-test-device';
const IP = '127.0.0.1';

const register = (id, title, run) => TestRegistry.register({ id, group: 'recovery', title, kind: 'functional', run });

const login = (email, password) => AuthService.authenticateWithPassword(email, password, CLIENT_ID, DEVICE_ID, IP);

const expectRejected = async (promise, what) => {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error(`${what} should have been rejected`);
};

register('recovery.one-time-tokens', 'One-time tokens are single use and typed', async (fx) => {
    const { account } = await fx.createAccount();
    const id = account.accountId;

    const first = await OneTimeTokenService.issue('verify', id);
    if (await OneTimeTokenService.consume('reset', first.token)) throw new Error('A token worked for the wrong type');
    if (!OneTimeTokenService.peek('verify', first.token)) throw new Error('A wrong-type attempt burned the token');
    if (!(await OneTimeTokenService.consume('verify', first.token))) throw new Error('A valid token was refused');
    if (await OneTimeTokenService.consume('verify', first.token)) throw new Error('A token worked twice');

    const expired = await OneTimeTokenService.issue('reset', id, { ttlMs: -1000 });
    if (await OneTimeTokenService.consume('reset', expired.token)) throw new Error('An expired token was accepted');

    const older = await OneTimeTokenService.issue('magic', id);
    const newer = await OneTimeTokenService.issue('magic', id);
    if (await OneTimeTokenService.consume('magic', older.token)) throw new Error('A superseded token was accepted');
    if (!(await OneTimeTokenService.consume('magic', newer.token))) throw new Error('The latest token was refused');

    if (await OneTimeTokenService.consume('magic', 'not-a-real-token-at-all-1234')) throw new Error('A random string was accepted');

    const cooldown = OneTimeTokenService.takeCooldown('verify', id, 60000);
    if (cooldown !== 0) throw new Error('First cooldown request was blocked');
    if (OneTimeTokenService.takeCooldown('verify', id, 60000) === 0) throw new Error('Cooldown did not block a second request');
});

register('recovery.password-reset', 'Reset changes the password and ends every session', async (fx) => {
    const user = await fx.createAccount();
    const id = user.account.accountId;
    const newPassword = `${user.password}Zz9!`;

    const session = await login(user.email, user.password);
    const { token } = await OneTimeTokenService.issue('reset', id);

    const weak = await RecoveryService.completePasswordReset(token, 'weak');
    if (weak.success) throw new Error('A weak password was accepted');
    if (!OneTimeTokenService.peek('reset', token)) throw new Error('A rejected password burned the token');

    const done = await RecoveryService.completePasswordReset(token, newPassword);
    if (!done.success) throw new Error(`Reset failed: ${done.message}`);

    if ((await RecoveryService.completePasswordReset(token, newPassword)).success) throw new Error('The reset link worked twice');
    if (await TokenService.isValidAccessToken(session.access_token)) throw new Error('An old session survived the reset');

    await expectRejected(login(user.email, user.password), 'The old password');
    await login(user.email, newPassword);
});

register('recovery.email-verification', 'Verification link marks the email as verified', async (fx) => {
    const { account } = await fx.createAccount();
    const id = account.accountId;

    await DatabaseManager.updateAccount(id, { emailVerified: false });
    if ((await DatabaseManager.getAccount(id)).emailVerified !== false) throw new Error('Could not mark the email unverified');

    const { token } = await OneTimeTokenService.issue('verify', id);
    if (!(await RecoveryService.confirmVerification(token))) throw new Error('A valid link was refused');
    if ((await DatabaseManager.getAccount(id)).emailVerified !== true) throw new Error('Email was not marked verified');
    if (await RecoveryService.confirmVerification(token)) throw new Error('The link worked twice');
});

register('recovery.magic-link', 'Magic link signs in once and respects bans', async (fx) => {
    const { account } = await fx.createAccount();
    const id = account.accountId;

    const first = await OneTimeTokenService.issue('magic', id);
    const ok = await RecoveryService.consumeMagicLink(first.token);
    if (!ok.account || ok.account.accountId !== id) throw new Error('A valid link did not identify the account');
    if (!(await RecoveryService.consumeMagicLink(first.token)).error) throw new Error('The link worked twice');

    await DatabaseManager.banAccount(id, ['test'], null);
    const second = await OneTimeTokenService.issue('magic', id);
    const banned = await RecoveryService.consumeMagicLink(second.token);
    if (!banned.error || !banned.forbidden) throw new Error('A banned account could use a magic link');
});
