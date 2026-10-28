const TestRegistry = require('../test-registry');
const DatabaseManager = require('../../../manager/database-manager');
const KeyedLock = require('../../../utils/keyed-lock');
const { redact } = require('../../../utils/redact');

const register = (id, title, run) => TestRegistry.register({ id, group: 'core', title, kind: 'functional', run });

register('core.keyed-lock', 'Per-key lock serializes work', async () => {
    const order = [];
    const job = (key, id, delay) => KeyedLock.run(key, async () => {
        order.push(`s${id}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        order.push(`e${id}`);
    });

    await Promise.all([job('a', 1, 30), job('a', 2, 5), job('b', 3, 1)]);

    const a = order.filter(entry => entry.endsWith('1') || entry.endsWith('2')).join(' ');
    if (a !== 's1 e1 s2 e2') throw new Error(`Jobs on one key overlapped: ${a}`);
    await new Promise(resolve => setImmediate(resolve));
    if (KeyedLock.tails.size !== 0) throw new Error('Lock table was not cleaned up');
});

register('core.redact', 'Debug logs mask secrets', () => {
    const out = redact({
        headers: { Authorization: 'Bearer abc' },
        body: JSON.stringify({ password: 'hunter2', name: 'ok' })
    });
    const serialized = JSON.stringify(out);
    if (serialized.includes('abc') || serialized.includes('hunter2')) throw new Error('A secret leaked through redact()');
    if (!serialized.includes('ok')) throw new Error('Non secret fields were removed');
});

register('core.profile-writes', 'Concurrent profile writes keep every update', async (fx) => {
    const { account } = await fx.createAccount();
    const before = await DatabaseManager.getProfile(account.accountId, 'athena');
    if (!before) throw new Error('New account has no athena profile');

    const writes = 15;
    await Promise.all(Array.from({ length: writes }, () =>
        KeyedLock.run(`mcp:${account.accountId}`, async () => {
            const profile = await DatabaseManager.getProfile(account.accountId, 'athena');
            profile.rvn += 1;
            await DatabaseManager.saveProfile(account.accountId, 'athena', profile);
        })
    ));

    const after = await DatabaseManager.getProfile(account.accountId, 'athena');
    if (after.rvn !== before.rvn + writes) {
        throw new Error(`Lost updates: expected rvn ${before.rvn + writes}, got ${after.rvn}`);
    }
});

register('core.logger-closed-prompt', 'Logging survives a closed console prompt', () => {
    const LoggerService = require('../../logger/logger-service');
    const saved = { rl: LoggerService.rl, tty: process.stdout.isTTY };
    const fake = { handlers: {}, on(event, handler) { this.handlers[event] = handler; }, prompt() { throw new Error('readline was closed'); } };

    try {
        LoggerService.setReadline(fake);
        fake.handlers.close();
        if (LoggerService.rl !== null) throw new Error('The logger kept a closed prompt');

        LoggerService.setReadline(fake);
        process.stdout.isTTY = true;
        LoggerService.log('info', 'Logger test: prompt that throws');
        if (LoggerService.rl !== null) throw new Error('A throwing prompt was not dropped');
    } finally {
        process.stdout.isTTY = saved.tty;
        LoggerService.rl = saved.rl;
    }
});

register('core.account-is-banned', 'AccountIsBanned sees active, expired and lifted bans', async (fx) => {
    const { account } = await fx.createAccount();
    const id = account.accountId;

    if (await DatabaseManager.AccountIsBanned(id)) throw new Error('A new account was reported as banned');

    await DatabaseManager.banAccount(id, ['test'], null);
    if (!(await DatabaseManager.AccountIsBanned(id))) throw new Error('A permanent ban was not seen');

    await DatabaseManager.unbanAccount(id);
    if (await DatabaseManager.AccountIsBanned(id)) throw new Error('A lifted ban was still seen');

    await DatabaseManager.banAccount(id, ['test'], new Date(Date.now() - 1000).toISOString());
    if (await DatabaseManager.AccountIsBanned(id)) throw new Error('An expired ban was still seen');
});
