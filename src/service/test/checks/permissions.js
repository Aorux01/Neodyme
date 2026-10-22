const fs = require('fs');
const path = require('path');
const TestRegistry = require('../test-registry');
const CapabilityService = require('../../security/capability-service');
const DatabaseManager = require('../../../manager/database-manager');

const register = (id, title, run) => TestRegistry.register({ id, group: 'permissions', title, kind: 'functional', run });

const expectEqual = (actual, expected, what) => {
    if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

const API_DIR = path.join(__dirname, '../../../../api');

function routeFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return routeFiles(full);
        return entry.name.endsWith('.js') ? [full] : [];
    });
}

register('permissions.defaults', 'Role defaults match the role hierarchy', () => {
    for (const spec of CapabilityService.catalog()) {
        for (let level = 0; level <= 4; level++) {
            const expected = level >= spec.minRole || level >= 4;
            expectEqual(CapabilityService.has({}, level, spec.id), expected, `${spec.id} for role level ${level}`);
        }
    }
    expectEqual(CapabilityService.has({}, 4, 'does.not.exist'), false, 'Unknown capability');
});

register('permissions.overrides', 'A denial beats a grant and a role, a grant beats a missing role', () => {
    const player = { capabilityGrants: ['shop.edit'] };
    expectEqual(CapabilityService.has(player, 0, 'shop.edit'), true, 'Grant on a player');
    expectEqual(CapabilityService.has(player, 0, 'config.edit'), false, 'Other capability on that player');

    const admin = { capabilityDenies: ['users.ban'] };
    expectEqual(CapabilityService.has(admin, 3, 'users.ban'), false, 'Denial on an admin');
    expectEqual(CapabilityService.has(admin, 3, 'users.view'), true, 'Unrelated capability on that admin');

    const both = { capabilityGrants: ['shop.edit'], capabilityDenies: ['shop.edit'] };
    expectEqual(CapabilityService.has(both, 0, 'shop.edit'), false, 'Grant and denial together');
    expectEqual(CapabilityService.has({ capabilityDenies: ['users.ban'] }, 4, 'users.ban'), true, 'Owner with a denial');

    const clean = CapabilityService.sanitize(['shop.edit', 'shop.edit', 'nope', 'users.ban'], ['users.ban', 'also.nope']);
    expectEqual(JSON.stringify(clean), JSON.stringify({ grants: ['shop.edit'], denies: ['users.ban'] }), 'Sanitized lists');
});

register('permissions.escalation', 'Nobody can raise their own or a higher account', () => {
    const admin = { accountId: 'a', capabilityDenies: ['email.send'] };
    const moderator = { accountId: 'm' };
    const peer = { accountId: 'p' };

    const check = (actor, actorLevel, target, targetLevel, grants) =>
        CapabilityService.checkChange({ actor, actorLevel, target, targetLevel, grants });

    if (!check(admin, 3, admin, 3, [])) throw new Error('Self edit was allowed');
    if (!check(admin, 3, peer, 3, [])) throw new Error('Editing an equal role was allowed');
    if (check(admin, 3, moderator, 1, ['shop.edit'])) throw new Error('A legitimate change was refused');
    if (!check(admin, 3, moderator, 1, ['email.send'])) throw new Error('Granting a denied capability was allowed');
    if (check({ accountId: 'o' }, 4, peer, 3, ['email.send'])) throw new Error('An owner was refused');
});

register('permissions.storage', 'Adjustments are saved on the account', async (fx) => {
    const { account } = await fx.createAccount();
    await DatabaseManager.updateSecurityFields(account.accountId, { capabilityGrants: ['shop.edit'], capabilityDenies: ['users.ban'] });

    const stored = await DatabaseManager.getAccount(account.accountId);
    expectEqual(JSON.stringify(stored.capabilityGrants), JSON.stringify(['shop.edit']), 'Stored grants');
    expectEqual(JSON.stringify(stored.capabilityDenies), JSON.stringify(['users.ban']), 'Stored denials');

    await DatabaseManager.updateSecurityFields(account.accountId, { capabilityGrants: [], capabilityDenies: [] });
    const cleared = await DatabaseManager.getAccount(account.accountId);
    expectEqual(CapabilityService.hasOverrides(cleared), false, 'Overrides after reset');
});

register('permissions.routes-in-catalog', 'Every gated route uses a known capability, and every capability is used', () => {
    const used = new Set();
    const unknown = new Set();
    const pattern = /(?:gate|gateWrite|requireCap)\('([^']+)'\)/g;

    for (const file of routeFiles(API_DIR)) {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(pattern)) {
            used.add(match[1]);
            if (!CapabilityService.isValid(match[1])) unknown.add(`${match[1]} (${path.basename(file)})`);
        }
    }

    if (unknown.size > 0) throw new Error(`Unknown capabilities in routes: ${[...unknown].join(', ')}`);

    const unused = CapabilityService.ids().filter(id => !used.has(id) && id !== 'permissions.manage');
    if (unused.length > 0) throw new Error(`Capabilities no route uses: ${unused.join(', ')}`);

    return { message: `${used.size} capabilities in use` };
});
