const TestRegistry = require('../test-registry');
const TotpService = require('../../security/totp-service');
const TwoFactorService = require('../../security/two-factor-service');
const OneTimeTokenService = require('../../token/one-time-token-service');
const DatabaseManager = require('../../../manager/database-manager');
const ConfigManager = require('../../../manager/config-manager');

const register = (id, title, run) => TestRegistry.register({ id, group: 'security', title, kind: 'functional', run });

const expectEqual = (actual, expected, what) => {
    if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

async function enroll(fx) {
    const user = await fx.createAccount();
    const { secret } = await TwoFactorService.beginSetup(user.account);
    const pending = await DatabaseManager.getAccount(user.account.accountId);
    const result = await TwoFactorService.confirmSetup(pending, TotpService.generate(secret));
    if (!result.codes) throw new Error(`Enrollment failed: ${result.error}`);

    TwoFactorService.failures.delete(user.account.accountId);
    return { ...user, secret, codes: result.codes, account: await DatabaseManager.getAccount(user.account.accountId) };
}

// A code for the next 30 second step, which is accepted and newer than the one used to enroll.
const nextCode = (secret) => TotpService.generate(secret, Date.now() + 30000);

register('security.totp-vectors', 'TOTP matches the RFC 6238 test vectors', () => {
    const secret = TotpService.base32Encode(Buffer.from('12345678901234567890'));
    const vectors = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];

    for (const [seconds, expected] of vectors) {
        expectEqual(TotpService.generate(secret, seconds * 1000), expected, `Code at ${seconds}s`);
    }

    const random = TotpService.generateSecret();
    expectEqual(TotpService.base32Encode(TotpService.base32Decode(random)), random, 'Base32 round trip');
});

register('security.totp-window', 'Codes allow small clock drift but never replay', () => {
    const secret = TotpService.generateSecret();
    const now = 1700000000000;
    const step = TotpService.counterAt(now);

    expectEqual(TotpService.verify(secret, TotpService.generate(secret, now), { timeMs: now }), step, 'Current code');
    expectEqual(TotpService.verify(secret, TotpService.generate(secret, now - 30000), { timeMs: now }), step - 1, 'Previous step');
    expectEqual(TotpService.verify(secret, TotpService.generate(secret, now + 30000), { timeMs: now }), step + 1, 'Next step');
    expectEqual(TotpService.verify(secret, TotpService.generate(secret, now - 90000), { timeMs: now }), null, 'Code from 3 steps ago');
    expectEqual(TotpService.verify(secret, TotpService.generate(secret, now), { timeMs: now, lastStep: step }), null, 'Replayed code');
    expectEqual(TotpService.verify(secret, 'abcdef', { timeMs: now }), null, 'Non numeric code');
});

register('security.enrollment', 'Enrollment stores an encrypted secret and hashed backup codes', async (fx) => {
    const user = await enroll(fx);
    const { account, secret, codes } = user;

    if (!account.tfaEnabled) throw new Error('Two-factor was not switched on');
    if (!String(account.tfaSecret).startsWith('v1.') || String(account.tfaSecret).includes(secret)) {
        throw new Error('The secret is not stored encrypted');
    }
    expectEqual(codes.length, 10, 'Backup code count');
    if (JSON.stringify(account.tfaBackupCodes).includes(codes[0].replace('-', ''))) throw new Error('Backup codes are stored in clear text');
    if (account.tfaPendingSecret) throw new Error('The pending secret was not cleared');

    await TwoFactorService.disable(account.accountId);
    const after = await DatabaseManager.getAccount(account.accountId);
    if (after.tfaEnabled || after.tfaSecret || (after.tfaBackupCodes || []).length) throw new Error('Disable left data behind');
});

register('security.verify-code', 'Authenticator and backup codes are checked and limited', async (fx) => {
    const { account, secret, codes } = await enroll(fx);
    const id = account.accountId;
    const fresh = () => DatabaseManager.getAccount(id);

    if ((await TwoFactorService.verifySecondFactor(await fresh(), TotpService.generate(secret))).ok) throw new Error('The enrollment code was accepted twice');

    const good = await TwoFactorService.verifySecondFactor(await fresh(), nextCode(secret));
    if (!good.ok || good.method !== 'totp') throw new Error('A valid authenticator code was refused');

    const backup = await TwoFactorService.verifySecondFactor(await fresh(), codes[0]);
    if (!backup.ok || backup.method !== 'backup') throw new Error('A valid backup code was refused');
    if ((await TwoFactorService.verifySecondFactor(await fresh(), codes[0])).ok) throw new Error('A backup code worked twice');
    expectEqual(TwoFactorService.backupRemaining(await fresh()), 9, 'Remaining backup codes');

    for (let i = 0; i < 5; i++) await TwoFactorService.verifySecondFactor(await fresh(), '000000');
    const locked = await TwoFactorService.verifySecondFactor(await fresh(), codes[1]);
    if (locked.ok || !locked.locked) throw new Error('Repeated wrong codes did not lock verification');
    TwoFactorService.failures.delete(id);
});

register('security.two-step-login', 'Login needs the code and the temporary token is limited', async (fx) => {
    const { account, secret } = await enroll(fx);
    const id = account.accountId;

    const first = await TwoFactorService.startLogin(account, { remember: true });
    const wrong = await TwoFactorService.completeLogin(first.token, { method: 'code', code: '000000' });
    if (!wrong.error || wrong.restart) throw new Error('A wrong code should be refused without ending the attempt');

    const done = await TwoFactorService.completeLogin(first.token, { method: 'code', code: nextCode(secret) });
    if (!done.account || done.account.accountId !== id || done.remember !== true) throw new Error('A valid code did not finish the login');
    if (!(await TwoFactorService.completeLogin(first.token, { method: 'code', code: nextCode(secret) })).restart) {
        throw new Error('The temporary token worked twice');
    }

    const second = await TwoFactorService.startLogin(account);
    let last;
    for (let i = 0; i < 6; i++) last = await TwoFactorService.completeLogin(second.token, { method: 'email', code: '123456' });
    if (!last.restart) throw new Error('The temporary token survived too many wrong codes');

    OneTimeTokenService.revokeFor(id);
});

register('security.staff-policy', 'Staff policy blocks staff accounts without two-factor', () => {
    const original = ConfigManager.get('require2faForStaff', false);
    try {
        ConfigManager.set('require2faForStaff', true);
        expectEqual(TwoFactorService.isStaffBlocked({ tfaEnabled: false }, 1), true, 'Moderator without 2FA');
        expectEqual(TwoFactorService.isStaffBlocked({ tfaEnabled: true }, 3), false, 'Admin with 2FA');
        expectEqual(TwoFactorService.isStaffBlocked({ tfaEnabled: false }, 0), false, 'Player without 2FA');
        expectEqual(TwoFactorService.isStaffBlocked({ tfaEnabled: false }, 5), false, 'Server account');

        ConfigManager.set('require2faForStaff', false);
        expectEqual(TwoFactorService.isStaffBlocked({ tfaEnabled: false }, 4), false, 'Policy off');
    } finally {
        ConfigManager.set('require2faForStaff', original);
    }
});
