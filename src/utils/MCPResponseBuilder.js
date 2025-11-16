class MCPResponseBuilder {
    static sendResponse(res, profile, changes = []) {
        const baseRevision = profile.rvn || 0;
        
        res.json({
            profileRevision: profile.rvn || 0,
            profileId: profile.profileId,
            profileChangesBaseRevision: baseRevision,
            profileChanges: changes,
            profileCommandRevision: profile.commandRevision || 0,
            serverTime: new Date().toISOString(),
            responseVersion: 1
        });
    }

    static sendFullProfileUpdate(res, profile, queryRevision) {
        const baseRevision = profile.rvn || 0;
        let changes = [];

        if (queryRevision != baseRevision) {
            changes = [{
                changeType: 'fullProfileUpdate',
                profile: profile
            }];
        }

        this.sendResponse(res, profile, changes);
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

module.exports = MCPResponseBuilder;