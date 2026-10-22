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
