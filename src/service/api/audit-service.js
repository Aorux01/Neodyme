const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../logger/logger-service');
const DatabaseManager = require('../../manager/database-manager');

class AuditService {
    static initialized = false;

    static async initialize() {
        if (this.initialized) return;
        this.initialized = true;
        LoggerService.log('info', 'Audit service initialized');
    }

    // Log an action
    static async log(action, performedBy, performedByName, targetType, targetId, details = {}, ipAddress = null) {
        const logEntry = {
            logId: `audit_${Date.now()}_${uuidv4().substring(0, 8)}`,
            action,
            performedBy,
            performedByName,
            targetType,
            targetId,
            details,
            timestamp: new Date().toISOString(),
            ipAddress
        };

        try {
            await DatabaseManager.addAuditLog(logEntry);
        } catch (error) {
            LoggerService.log('error', `Failed to save audit log: ${error.message}`);
        }

        LoggerService.log('info', `AUDIT: ${performedByName} performed ${action} on ${targetType}:${targetId}`);

        return logEntry;
    }

    // Predefined action types
    static ACTIONS = {
        // User management
        BAN_USER: 'ban_user',
        UNBAN_USER: 'unban_user',
        CHANGE_ROLE: 'change_role',

        // Tickets
        CLOSE_TICKET: 'close_ticket',
        DELETE_TICKET: 'delete_ticket',
        ASSIGN_TICKET: 'assign_ticket',

        // Creator codes
        APPROVE_CODE: 'approve_code',
        REJECT_CODE: 'reject_code',
        DELETE_CODE: 'delete_code',
        TOGGLE_CODE: 'toggle_code',

        // Configuration
        UPDATE_CONFIG: 'update_config',
        UPDATE_CONFIG_FILE: 'update_config_file',

        // Content editor (typed editors over content-pages.json / motd.json)
        UPDATE_CONTENT: 'update_content',
        RESET_CONTENT:  'reset_content',

        // Assets manager
        UPLOAD_ASSET: 'upload_asset',
        DELETE_ASSET: 'delete_asset',

        // Shop editor
        UPDATE_SHOP_SLOT:    'update_shop_slot',
        CLEAR_SHOP_SLOT:     'clear_shop_slot',
        RANDOMIZE_SHOP_SLOT: 'randomize_shop_slot',

        // Server
        FORCE_SHOP_ROTATION: 'force_shop_rotation',
        TOGGLE_MAINTENANCE: 'toggle_maintenance'
    };

    // Helper methods for common actions
    static async logBan(moderatorId, moderatorName, targetUserId, targetUserName, reason, duration, ip) {
        return this.log(
            this.ACTIONS.BAN_USER,
            moderatorId,
            moderatorName,
            'user',
            targetUserId,
            { targetUserName, reason, duration },
            ip
        );
    }

    static async logUnban(moderatorId, moderatorName, targetUserId, targetUserName, ip) {
        return this.log(
            this.ACTIONS.UNBAN_USER,
            moderatorId,
            moderatorName,
            'user',
            targetUserId,
            { targetUserName },
            ip
        );
    }

    static async logRoleChange(adminId, adminName, targetUserId, targetUserName, oldRole, newRole, ip) {
        return this.log(
            this.ACTIONS.CHANGE_ROLE,
            adminId,
            adminName,
            'user',
            targetUserId,
            { targetUserName, oldRole, newRole },
            ip
        );
    }

    static async logConfigChange(userId, userName, configKey, oldValue, newValue, ip) {
        return this.log(
            this.ACTIONS.UPDATE_CONFIG,
            userId,
            userName,
            'config',
            configKey,
            { oldValue: String(oldValue), newValue: String(newValue) },
            ip
        );
    }

    static async logConfigFileChange(userId, userName, fileName, ip, extra = {}) {
        return this.log(
            this.ACTIONS.UPDATE_CONFIG_FILE,
            userId,
            userName,
            'config_file',
            fileName,
            { fileName, ...extra },
            ip
        );
    }

    // Content editor: PUT /dev/content/:scope/:section. Includes a short
    // human summary of what changed so the audit modal does not need to
    // re-fetch the file.
    static async logContentEdit(userId, userName, scope, section, ip, extra = {}) {
        return this.log(
            this.ACTIONS.UPDATE_CONTENT,
            userId,
            userName,
            'content',
            `${scope}:${section}`,
            { scope, section, ...extra },
            ip
        );
    }

    // Content editor reset (download canonical file from upstream).
    static async logContentReset(userId, userName, scopes, ip, results = []) {
        return this.log(
            this.ACTIONS.RESET_CONTENT,
            userId,
            userName,
            'content',
            scopes.join(','),
            { scopes, results },
            ip
        );
    }

    static async logAssetUpload(userId, userName, fileMeta, ip) {
        return this.log(
            this.ACTIONS.UPLOAD_ASSET,
            userId,
            userName,
            'asset',
            fileMeta.path || fileMeta.filename || '?',
            {
                filename: fileMeta.filename,
                path: fileMeta.path,
                originalName: fileMeta.originalName,
                size: fileMeta.size,
                ext: fileMeta.ext,
                url: fileMeta.url,
            },
            ip
        );
    }

    static async logAssetDelete(userId, userName, relPath, ip, extra = {}) {
        return this.log(
            this.ACTIONS.DELETE_ASSET,
            userId,
            userName,
            'asset',
            relPath,
            { path: relPath, ...extra },
            ip
        );
    }

    static async logShopSlotUpdate(userId, userName, slot, oldEntry, newEntry, ip) {
        return this.log(
            this.ACTIONS.UPDATE_SHOP_SLOT,
            userId,
            userName,
            'shop_slot',
            slot,
            {
                slot,
                oldItemGrants: oldEntry ? oldEntry.itemGrants : null,
                oldPrice:      oldEntry ? oldEntry.price      : null,
                newItemGrants: newEntry.itemGrants,
                newPrice:      newEntry.price,
            },
            ip
        );
    }

    static async logShopSlotClear(userId, userName, slot, oldEntry, ip) {
        return this.log(
            this.ACTIONS.CLEAR_SHOP_SLOT,
            userId,
            userName,
            'shop_slot',
            slot,
            {
                slot,
                clearedItemGrants: oldEntry ? oldEntry.itemGrants : null,
                clearedPrice:      oldEntry ? oldEntry.price      : null,
            },
            ip
        );
    }

    static async logShopSlotRandomize(userId, userName, slot, picked, oldEntry, newEntry, ip) {
        return this.log(
            this.ACTIONS.RANDOMIZE_SHOP_SLOT,
            userId,
            userName,
            'shop_slot',
            slot,
            {
                slot,
                pickedId: picked.id,
                pickedName: picked.name,
                pickedRarity: picked.rarity,
                pickedType: picked.type,
                oldItemGrants: oldEntry ? oldEntry.itemGrants : null,
                oldPrice:      oldEntry ? oldEntry.price      : null,
                newItemGrants: newEntry.itemGrants,
                newPrice:      newEntry.price,
            },
            ip
        );
    }

    static async logTicketAction(userId, userName, action, ticketId, details = {}, ip) {
        return this.log(
            action,
            userId,
            userName,
            'ticket',
            ticketId,
            details,
            ip
        );
    }

    // Get logs with filtering and pagination
    static async getLogs(filters = {}) {
        const data = await DatabaseManager.getAuditLogs();
        let logs = [...data.logs].reverse(); // Most recent first

        // Apply filters
        if (filters.action) {
            logs = logs.filter(l => l.action === filters.action);
        }
        if (filters.performedBy) {
            logs = logs.filter(l => l.performedBy === filters.performedBy);
        }
        if (filters.targetType) {
            logs = logs.filter(l => l.targetType === filters.targetType);
        }
        if (filters.targetId) {
            logs = logs.filter(l => l.targetId === filters.targetId);
        }
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            logs = logs.filter(l =>
                l.performedByName.toLowerCase().includes(searchLower) ||
                l.targetId.toLowerCase().includes(searchLower) ||
                l.action.toLowerCase().includes(searchLower) ||
                (l.details.targetUserName && l.details.targetUserName.toLowerCase().includes(searchLower))
            );
        }
        if (filters.startDate) {
            const start = new Date(filters.startDate);
            logs = logs.filter(l => new Date(l.timestamp) >= start);
        }
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            logs = logs.filter(l => new Date(l.timestamp) <= end);
        }

        const page = filters.page || 1;
        const limit = filters.limit || 50;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const paginatedLogs = logs.slice(startIndex, endIndex);

        return {
            logs: paginatedLogs,
            total: logs.length,
            page,
            limit,
            totalPages: Math.ceil(logs.length / limit)
        };
    }

    // Get recent activity summary
    static async getRecentSummary(hours = 24) {
        const data = await DatabaseManager.getAuditLogs();
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

        const recentLogs = data.logs.filter(l => new Date(l.timestamp) >= cutoff);

        const actionCounts = {};
        recentLogs.forEach(log => {
            actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        });

        return {
            totalActions: recentLogs.length,
            actionCounts,
            period: `${hours} hours`
        };
    }

    // Get actions by a specific user
    static async getUserActions(accountId, limit = 50) {
        const data = await DatabaseManager.getAuditLogs();
        return data.logs
            .filter(l => l.performedBy === accountId)
            .slice(-limit)
            .reverse();
    }

    // Get actions on a specific target
    static async getTargetHistory(targetType, targetId, limit = 50) {
        const data = await DatabaseManager.getAuditLogs();
        return data.logs
            .filter(l => l.targetType === targetType && l.targetId === targetId)
            .slice(-limit)
            .reverse();
    }
}

module.exports = AuditService;
