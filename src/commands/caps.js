const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('../manager/database-manager');
const AuditService = require('../service/api/audit-service');
const CapabilityService = require('../service/security/capability-service');

async function resolveAccount(input) {
    return (await DatabaseManager.getAccountByDisplayName(input)) || (await DatabaseManager.getAccount(input)) || null;
}

const levelOf = (account) => (typeof account.clientType === 'number' ? account.clientType : 0);

function printUsage() {
    LoggerService.log('info', `Usage: ${colors.cyan('/caps <subcommand>')}`);
    LoggerService.log('info', `  ${colors.cyan('list')}                          List every capability and the role that has it by default`);
    LoggerService.log('info', `  ${colors.cyan('show <user>')}                   Show what a player can do, and why`);
    LoggerService.log('info', `  ${colors.cyan('grant <user> <capability>')}     Allow a capability on top of the player's role`);
    LoggerService.log('info', `  ${colors.cyan('deny <user> <capability>')}      Forbid a capability even if the role has it`);
    LoggerService.log('info', `  ${colors.cyan('reset <user> [capability]')}     Remove one adjustment, or all of them`);
}

function printList() {
    let group = null;
    for (const spec of CapabilityService.catalog()) {
        if (spec.group !== group) {
            group = spec.group;
            LoggerService.log('info', colors.yellow(`[ ${group} ]`));
        }
        LoggerService.log('info', `  ${colors.cyan(spec.id.padEnd(22))} ${spec.label} ${colors.gray(`(${spec.minRoleName}+)`)}`);
    }
}

async function show(args) {
    const account = args[1] && await resolveAccount(args[1]);
    if (!account) return LoggerService.log('error', args[1] ? `Player "${args[1]}" not found` : 'Usage: /caps show <user>');

    const level = levelOf(account);
    LoggerService.log('info', `${colors.cyan(account.displayName)} is ${CapabilityService.ROLE_NAMES[level] || 'player'}`);

    const grants = CapabilityService.grantsOf(account);
    const denies = CapabilityService.deniesOf(account);
    LoggerService.log('info', `  Granted: ${grants.length ? colors.green(grants.join(', ')) : colors.gray('none')}`);
    LoggerService.log('info', `  Denied:  ${denies.length ? colors.red(denies.join(', ')) : colors.gray('none')}`);

    const allowed = CapabilityService.allowed(account, level);
    LoggerService.log('info', `  Can do ${allowed.length} of ${CapabilityService.ids().length} capabilities`);
}

async function change(args, mode) {
    const [, input, capability] = args;
    if (!input || !capability) return LoggerService.log('info', `Usage: /caps ${mode} <user> <capability>`);
    if (!CapabilityService.isValid(capability)) return LoggerService.log('error', `Unknown capability "${capability}". Use /caps list.`);

    const account = await resolveAccount(input);
    if (!account) return LoggerService.log('error', `Player "${input}" not found`);
    if (levelOf(account) >= CapabilityService.OWNER_LEVEL) return LoggerService.log('warn', `${account.displayName} is an owner and already has every permission.`);

    const grants = CapabilityService.grantsOf(account).filter(id => id !== capability);
    const denies = CapabilityService.deniesOf(account).filter(id => id !== capability);
    (mode === 'grant' ? grants : denies).push(capability);

    await save(account, grants, denies);
    LoggerService.log('success', `${colors.cyan(account.displayName)}: ${capability} ${mode === 'grant' ? colors.green('granted') : colors.red('denied')}.`);
}

async function reset(args) {
    const [, input, capability] = args;
    if (!input) return LoggerService.log('info', 'Usage: /caps reset <user> [capability]');
    if (capability && !CapabilityService.isValid(capability)) return LoggerService.log('error', `Unknown capability "${capability}". Use /caps list.`);

    const account = await resolveAccount(input);
    if (!account) return LoggerService.log('error', `Player "${input}" not found`);

    const grants = capability ? CapabilityService.grantsOf(account).filter(id => id !== capability) : [];
    const denies = capability ? CapabilityService.deniesOf(account).filter(id => id !== capability) : [];

    await save(account, grants, denies);
    LoggerService.log('success', `${colors.cyan(account.displayName)}: ${capability || 'all adjustments'} back to the role default.`);
}

async function save(account, grants, denies) {
    const before = { grants: CapabilityService.grantsOf(account), denies: CapabilityService.deniesOf(account) };
    const clean = CapabilityService.sanitize(grants, denies);

    await DatabaseManager.updateSecurityFields(account.accountId, { capabilityGrants: clean.grants, capabilityDenies: clean.denies });
    await AuditService.log('capabilities.updated', 'console', 'Console', 'account', account.accountId, { before, after: clean }, null).catch(() => {});
}

function register(CM) {
    CM.register('/caps', async (args) => {
        try {
            switch (args[0]?.toLowerCase()) {
                case 'list': return printList();
                case 'show': return await show(args);
                case 'grant': return await change(args, 'grant');
                case 'deny': return await change(args, 'deny');
                case 'reset': return await reset(args);
                default: return printUsage();
            }
        } catch (error) {
            LoggerService.log('error', `Caps command failed: ${error.message}`);
        }
    });
}

module.exports = { register };
