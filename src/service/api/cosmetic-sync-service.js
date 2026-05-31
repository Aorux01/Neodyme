const SINGLE_SLOTS = {
    Character: 'favorite_character',
    Backpack: 'favorite_backpack',
    Pickaxe: 'favorite_pickaxe',
    Glider: 'favorite_glider',
    SkyDiveContrail: 'favorite_skydivecontrail',
    MusicPack: 'favorite_musicpack',
    LoadingScreen: 'favorite_loadingscreen'
};

class CosmeticSyncService {
    static resolveActiveLockerItem(profile) {
        const items = profile?.items || {};
        const key = this.resolveActiveLockerKey(profile);
        return key ? items[key] : null;
    }

    static resolveActiveLockerKey(profile) {
        const attrs = profile?.stats?.attributes || {};
        const items = profile?.items || {};

        const loadouts = Array.isArray(attrs.loadouts) ? attrs.loadouts : [];
        const idx = Number.isInteger(attrs.active_loadout_index) ? attrs.active_loadout_index : 0;
        const key = loadouts[idx] || attrs.last_applied_loadout || loadouts[0];

        if (key && items[key]?.attributes?.locker_slots_data) {
            return key;
        }

        for (const [itemKey, item] of Object.entries(items)) {
            if (typeof item.templateId === 'string'
                && item.templateId.startsWith('CosmeticLocker')
                && item.attributes?.locker_slots_data) {
                return itemKey;
            }
        }
        return null;
    }

    static reconcileFavorites(profile) {
        const result = { changed: false, fixedStats: [] };

        if (!profile?.stats?.attributes) return result;

        const locker = this.resolveActiveLockerItem(profile);
        if (!locker) return result;

        const slots = locker.attributes.locker_slots_data?.slots || {};
        const attrs = profile.stats.attributes;

        const activeKey = this.resolveActiveLockerKey(profile);
        if (activeKey && attrs.last_applied_loadout !== activeKey) {
            attrs.last_applied_loadout = activeKey;
            result.changed = true;
            result.fixedStats.push('last_applied_loadout');
        }

        for (const [slot, stat] of Object.entries(SINGLE_SLOTS)) {
            const slotData = slots[slot];
            if (!slotData || !Array.isArray(slotData.items)) continue; // slot non gere par cette saison

            const expected = slotData.items[0] || '';
            if (attrs[stat] !== expected) {
                attrs[stat] = expected;
                result.changed = true;
                result.fixedStats.push(stat);
            }
        }

        if (Array.isArray(slots.Dance?.items)) {
            if (!Array.isArray(attrs.favorite_dance)) attrs.favorite_dance = ['', '', '', '', '', ''];
            let danceChanged = false;
            for (let i = 0; i < slots.Dance.items.length; i++) {
                const expected = slots.Dance.items[i] || '';
                if (attrs.favorite_dance[i] !== expected) {
                    attrs.favorite_dance[i] = expected;
                    danceChanged = true;
                }
            }
            if (danceChanged) { result.changed = true; result.fixedStats.push('favorite_dance'); }
        }

        if (Array.isArray(slots.ItemWrap?.items)) {
            if (!Array.isArray(attrs.favorite_itemwraps)) attrs.favorite_itemwraps = ['', '', '', '', '', '', ''];
            let wrapChanged = false;
            for (let i = 0; i < slots.ItemWrap.items.length; i++) {
                const expected = slots.ItemWrap.items[i] || '';
                if (attrs.favorite_itemwraps[i] !== expected) {
                    attrs.favorite_itemwraps[i] = expected;
                    wrapChanged = true;
                }
            }
            if (wrapChanged) { result.changed = true; result.fixedStats.push('favorite_itemwraps'); }
        }

        return result;
    }
}

module.exports = CosmeticSyncService;
