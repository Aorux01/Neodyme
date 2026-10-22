const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const CapabilityService = require('../../src/service/security/capability-service');
const AuditService = require('../../src/service/api/audit-service');
const WebResponse = require('../../src/service/api/web-response-service');
const LoggerService = require('../../src/service/logger/logger-service');
const { getUserRoleLevel } = require('../../src/service/api/role-middleware-service');
const { gate, gateWrite } = require('../../src/service/api/capability-middleware');

const MAX_LIST = 60;
const MAX_RESULTS = 25;

const summary = (account) => {
    const roleLevel = getUserRoleLevel(account);
    return {
        accountId: account.accountId,
        displayName: account.displayName,
        email: account.email,
        role: CapabilityService.ROLE_NAMES[roleLevel] || 'player',
        roleLevel,
        grants: CapabilityService.grantsOf(account),
        denies: CapabilityService.deniesOf(account)
    };
};

const detail = (account) => ({
    ...summary(account),
    capabilities: CapabilityService.effective(account, getUserRoleLevel(account))
});

async function applyChange(req, res, grants, denies) {
    const target = await DatabaseManager.getAccount(req.params.accountId);
    if (!target) return WebResponse.notFound(res, 'Account not found.');

    const actor = await DatabaseManager.getAccount(req.user.accountId);
    const targetLevel = getUserRoleLevel(target);
    if (targetLevel >= CapabilityService.OWNER_LEVEL) {
        return WebResponse.badRequest(res, 'Owners already have every permission.');
    }

    const clean = CapabilityService.sanitize(grants, denies);
    const refusal = CapabilityService.checkChange({
        actor, actorLevel: req.userRoleLevel, target, targetLevel, grants: clean.grants
    });
    if (refusal) return WebResponse.forbidden(res, refusal);

    const before = { grants: CapabilityService.grantsOf(target), denies: CapabilityService.deniesOf(target) };
    await DatabaseManager.updateSecurityFields(target.accountId, { capabilityGrants: clean.grants, capabilityDenies: clean.denies });

    await AuditService.log('capabilities.updated', req.user.accountId, req.user.displayName, 'account', target.accountId,
        { before, after: clean }, req.ip).catch(() => {});
    LoggerService.log('info', `Authorizations of ${target.displayName} changed by ${req.user.displayName}: +[${clean.grants.join(', ')}] -[${clean.denies.join(', ')}]`);

    return WebResponse.ok(res, { message: 'Authorizations saved.', user: detail(await DatabaseManager.getAccount(target.accountId)) });
}

router.get('/neodyme/api/admin/permissions/catalog', ...gate('permissions.manage'), (req, res) => {
    return WebResponse.ok(res, {
        capabilities: CapabilityService.catalog(),
        roles: Object.entries(CapabilityService.ROLE_NAMES)
            .filter(([level]) => Number(level) <= CapabilityService.OWNER_LEVEL)
            .map(([level, name]) => ({ level: Number(level), name }))
    });
});

router.get('/neodyme/api/admin/permissions/users', ...gate('permissions.manage'), async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
        let accounts = await DatabaseManager.getAllAccounts();

        if (search) {
            accounts = accounts.filter(a =>
                String(a.displayName).toLowerCase().includes(search)
                || String(a.email).toLowerCase().includes(search)
                || String(a.accountId).toLowerCase().includes(search));
        } else {
            accounts = accounts.filter(a => {
                const level = getUserRoleLevel(a);
                return (level >= 1 && level <= CapabilityService.OWNER_LEVEL) || CapabilityService.hasOverrides(a);
            });
        }

        return WebResponse.ok(res, { users: accounts.slice(0, MAX_RESULTS).map(summary) });
    } catch (error) {
        return WebResponse.serverError(res, 'list permissions users', error);
    }
});

router.get('/neodyme/api/admin/permissions/users/:accountId', ...gate('permissions.manage'), async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.params.accountId);
        if (!account) return WebResponse.notFound(res, 'Account not found.');
        return WebResponse.ok(res, { user: detail(account) });
    } catch (error) {
        return WebResponse.serverError(res, 'get permissions user', error);
    }
});

router.put('/neodyme/api/admin/permissions/users/:accountId', ...gateWrite('permissions.manage'), async (req, res) => {
    try {
        const { grants, denies } = req.body || {};
        if (!Array.isArray(grants) || !Array.isArray(denies) || grants.length > MAX_LIST || denies.length > MAX_LIST) {
            return WebResponse.badRequest(res, 'grants and denies must be lists.');
        }
        return await applyChange(req, res, grants, denies);
    } catch (error) {
        return WebResponse.serverError(res, 'update permissions', error);
    }
});

router.delete('/neodyme/api/admin/permissions/users/:accountId', ...gateWrite('permissions.manage'), async (req, res) => {
    try {
        return await applyChange(req, res, [], []);
    } catch (error) {
        return WebResponse.serverError(res, 'reset permissions', error);
    }
});

module.exports = router;
