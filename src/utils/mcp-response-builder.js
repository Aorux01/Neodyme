class McpResponseBuilder {
    static sendResponse(res, profile, changes = [], baseRevision = undefined) {
        const currentRevision = profile.rvn || 0;

        const resolvedBase = (baseRevision !== undefined)
            ? baseRevision
            : (changes.length > 0 ? Math.max(0, currentRevision - 1) : currentRevision);

        res.json({
            profileRevision: currentRevision,
            profileId: profile.profileId,
            profileChangesBaseRevision: resolvedBase,
            profileChanges: changes,
            profileCommandRevision: profile.commandRevision || 0,
            serverTime: new Date().toISOString(),
            responseVersion: 1
        });
    }

    static sendFullProfileUpdate(res, profile, queryRevision) {
        const currentRevision = profile.rvn || 0;
        const qr = parseInt(queryRevision, 10);

        const clientIsSynced =
            Number.isFinite(qr) && qr !== -1 &&
            (qr === currentRevision || qr === currentRevision - 1);

        let changes = [];
        if (!clientIsSynced) {
            changes = [{
                changeType: 'fullProfileUpdate',
                profile: profile
            }];
        }

        this.sendResponse(res, profile, changes, currentRevision);
    }

    static createStatChange(name, value) {
        return {
            changeType: 'statModified',
            name,
            value
        };
    }

    static createItemAdded(itemId, item) {
        return {
            changeType: 'itemAdded',
            itemId,
            item
        };
    }

    static createItemRemoved(itemId) {
        return {
            changeType: 'itemRemoved',
            itemId
        };
    }

    static createItemQuantityChanged(itemId, quantity) {
        return {
            changeType: 'itemQuantityChanged',
            itemId,
            quantity
        };
    }
}

module.exports = McpResponseBuilder;