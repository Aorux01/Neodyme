const ROLE_NAMES = { 0: 'player', 1: 'moderator', 2: 'developer', 3: 'admin', 4: 'owner', 5: 'server' };

const OWNER_LEVEL = 4;

// minRole is the lowest role that has the capability by default, so the defaults
// behave exactly like the role hierarchy always did.
const CATALOG = {
    'users.view': { label: 'View players', group: 'moderation', minRole: 1 },
    'users.ban': { label: 'Ban and unban players', group: 'moderation', minRole: 1 },
    'users.logout': { label: 'Log players out of every session', group: 'moderation', minRole: 1 },
    'tickets.manage': { label: 'Handle support tickets', group: 'moderation', minRole: 1 },
    'reports.manage': { label: 'Handle player reports', group: 'moderation', minRole: 1 },
    'feedback.manage': { label: 'Read and delete feedback', group: 'moderation', minRole: 1 },
    'creators.manage': { label: 'Review and manage creator codes', group: 'moderation', minRole: 1 },

    'system.view': { label: 'View logs, live stats and system health', group: 'developer', minRole: 2 },
    'config.edit': { label: 'Edit configuration and game files', group: 'developer', minRole: 2 },
    'content.edit': { label: 'Edit in-game content', group: 'developer', minRole: 2 },
    'assets.manage': { label: 'Upload and delete assets', group: 'developer', minRole: 2 },
    'shop.edit': { label: 'Edit the shop slots', group: 'developer', minRole: 2 },
    'email.manage': { label: 'Edit email templates, layouts and automations', group: 'developer', minRole: 2 },
    'plugins.manage': { label: 'Load, unload and edit plugins', group: 'developer', minRole: 2 },
    'tests.run': { label: 'Run functional tests', group: 'developer', minRole: 2 },

    'users.manage': { label: 'See every account and ban from the Admin panel', group: 'admin', minRole: 3 },
    'users.role': { label: 'Change player roles', group: 'admin', minRole: 3 },
    'users.reset': { label: 'Reset a player password', group: 'admin', minRole: 3 },
    'stats.view': { label: 'View detailed statistics', group: 'admin', minRole: 3 },
    'audit.view': { label: 'Read the audit log', group: 'admin', minRole: 3 },
    'settings.edit': { label: 'Edit server properties', group: 'admin', minRole: 3 },
    'whitelist.manage': { label: 'Manage the whitelist', group: 'admin', minRole: 3 },
    'email.send': { label: 'Send mass emails', group: 'admin', minRole: 3 },
    'shop.rotate': { label: 'Rotate the shop', group: 'admin', minRole: 3 },
    'creators.commission': { label: 'Change the creator commission', group: 'admin', minRole: 3 },
    'permissions.manage': { label: 'Manage particular authorizations', group: 'admin', minRole: 3 }
};

const listOf = (value) => (Array.isArray(value) ? value : []);

class CapabilityService {
    static catalog() {
        return Object.entries(CATALOG).map(([id, spec]) => ({
            id,
            ...spec,
            minRoleName: ROLE_NAMES[spec.minRole]
        }));
    }

    static ids() {
        return Object.keys(CATALOG);
    }

    static isValid(id) {
        return Object.prototype.hasOwnProperty.call(CATALOG, id);
    }

    static grantsOf(account) {
        return listOf(account && account.capabilityGrants);
    }

    static deniesOf(account) {
        return listOf(account && account.capabilityDenies);
    }

    static hasOverrides(account) {
        return this.grantsOf(account).length > 0 || this.deniesOf(account).length > 0;
    }

    // Owners always pass. Otherwise a denial wins, then a grant, then the role default.
    static has(account, roleLevel, capability) {
        if (!this.isValid(capability)) return false;
        if (roleLevel >= OWNER_LEVEL) return true;
        if (this.deniesOf(account).includes(capability)) return false;
        if (this.grantsOf(account).includes(capability)) return true;
        return roleLevel >= CATALOG[capability].minRole;
    }

    static allowed(account, roleLevel) {
        return this.ids().filter(id => this.has(account, roleLevel, id));
    }

    static effective(account, roleLevel) {
        return this.catalog().map(spec => {
            const byRole = roleLevel >= OWNER_LEVEL || roleLevel >= spec.minRole;
            const denied = roleLevel < OWNER_LEVEL && this.deniesOf(account).includes(spec.id);
            const granted = roleLevel < OWNER_LEVEL && this.grantsOf(account).includes(spec.id);
            return { ...spec, byRole, granted, denied, allowed: this.has(account, roleLevel, spec.id) };
        });
    }

    static panelsFor(account, roleLevel) {
        const allowed = this.allowed(account, roleLevel);
        const anyIn = (group) => allowed.some(id => CATALOG[id].group === group);
        return { moderation: anyIn('moderation'), developer: anyIn('developer'), admin: anyIn('admin') };
    }

    // Keeps known capabilities only, without duplicates, and lets a denial win over a grant.
    static sanitize(grants, denies) {
        const clean = (list) => [...new Set(listOf(list).filter(id => this.isValid(id)))];
        const denied = clean(denies);
        return { grants: clean(grants).filter(id => !denied.includes(id)), denies: denied };
    }

    // Rules that stop staff from escalating: no self edit, no edit of an equal or
    // higher role (owners aside), and only capabilities the actor holds can be granted.
    static checkChange({ actor, actorLevel, target, targetLevel, grants }) {
        if (actor.accountId === target.accountId) return 'You cannot change your own authorizations.';
        if (actorLevel < OWNER_LEVEL && targetLevel >= actorLevel) return 'You can only change accounts below your own role.';

        const added = grants.filter(id => !this.grantsOf(target).includes(id));
        const missing = added.filter(id => !this.has(actor, actorLevel, id));
        if (missing.length > 0) return `You cannot grant what you do not have yourself: ${missing.join(', ')}`;

        return null;
    }
}

CapabilityService.ROLE_NAMES = ROLE_NAMES;
CapabilityService.OWNER_LEVEL = OWNER_LEVEL;

module.exports = CapabilityService;
