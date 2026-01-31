const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../logger/logger-service');
const ConfigManager = require('../../manager/config-manager');
const DatabaseManager = require('../../manager/database-manager');

class CreatorCodeService {
    static initialized = false;

    static async initialize() {
        if (this.initialized) return;
        this.initialized = true;
        LoggerService.log('info', 'Creator Code service initialized');
    }

    static getCommissionPercent() {
        return ConfigManager.get('creatorCodeCommissionPercent', 1);
    }

    static async requestCode(accountId, displayName, requestedCode, reason = '') {
        const normalizedCode = requestedCode.toLowerCase().trim();

        // Validate code format
        if (!/^[a-zA-Z0-9_-]{3,16}$/.test(requestedCode)) {
            return { success: false, error: 'Code must be 3-16 characters, alphanumeric with _ or -' };
        }

        const data = await DatabaseManager.getCreatorCodesData();

        // Check if user already has a code
        const existingCode = Object.values(data.codes).find(c => c.accountId === accountId);
        if (existingCode) {
            return { success: false, error: 'You already have a creator code', code: existingCode.code };
        }

        // Check if user already has a pending request
        const existingRequest = Object.values(data.requests).find(
            r => r.accountId === accountId && r.status === 'pending'
        );
        if (existingRequest) {
            return { success: false, error: 'You already have a pending request' };
        }

        // Check if code is already taken
        if (data.codes[normalizedCode]) {
            return { success: false, error: 'This code is already taken' };
        }

        const requestId = uuidv4();
        const request = {
            requestId,
            id: requestId,
            accountId,
            displayName,
            requestedCode: normalizedCode,
            reason,
            status: 'pending',
            createdAt: new Date().toISOString(),
            reviewedBy: null,
            reviewedByName: null,
            reviewedAt: null,
            reviewNote: null
        };

        await DatabaseManager.createCreatorCodeRequest(request);
        LoggerService.log('info', `Creator code request: ${displayName} requested "${requestedCode}"`);

        return { success: true, requestId, message: 'Request submitted successfully' };
    }

    static async getPendingRequests() {
        const data = await DatabaseManager.getCreatorCodesData();
        return Object.values(data.requests).filter(r => r.status === 'pending');
    }

    static async getAllRequests() {
        const data = await DatabaseManager.getCreatorCodesData();
        return Object.values(data.requests);
    }

    static async approveRequest(requestId, reviewerId, reviewerName, note = '') {
        const request = await DatabaseManager.getCreatorCodeRequest(requestId);

        if (!request) {
            return { success: false, error: 'Request not found' };
        }
        if (request.status !== 'pending') {
            return { success: false, error: 'Request already processed' };
        }

        // Check if code is still available
        const existingCode = await DatabaseManager.getCreatorCode(request.requestedCode);
        if (existingCode) {
            return { success: false, error: 'Code is no longer available' };
        }

        // Create the code
        const codeData = {
            code: request.requestedCode,
            accountId: request.accountId,
            displayName: request.displayName,
            createdAt: new Date().toISOString(),
            approvedBy: reviewerId,
            approvedByName: reviewerName,
            totalEarnings: 0,
            totalUses: 0,
            isActive: true
        };

        await DatabaseManager.createCreatorCode(codeData);

        // Update request
        await DatabaseManager.updateCreatorCodeRequest(requestId, {
            status: 'approved',
            reviewedBy: reviewerId,
            reviewedByName: reviewerName,
            reviewedAt: new Date().toISOString(),
            reviewNote: note
        });

        LoggerService.log('info', `Creator code approved: "${request.requestedCode}" for ${request.displayName} by ${reviewerName}`);
        return { success: true, code: request.requestedCode };
    }

    static async rejectRequest(requestId, reviewerId, reviewerName, note = '') {
        const request = await DatabaseManager.getCreatorCodeRequest(requestId);

        if (!request) {
            return { success: false, error: 'Request not found' };
        }
        if (request.status !== 'pending') {
            return { success: false, error: 'Request already processed' };
        }

        await DatabaseManager.updateCreatorCodeRequest(requestId, {
            status: 'rejected',
            reviewedBy: reviewerId,
            reviewedByName: reviewerName,
            reviewedAt: new Date().toISOString(),
            reviewNote: note
        });

        LoggerService.log('info', `Creator code rejected: "${request.requestedCode}" for ${request.displayName} by ${reviewerName}`);
        return { success: true };
    }

    static async getUserCode(accountId) {
        const data = await DatabaseManager.getCreatorCodesData();
        return Object.values(data.codes).find(c => c.accountId === accountId) || null;
    }

    static async getUserRequest(accountId) {
        const data = await DatabaseManager.getCreatorCodesData();
        return Object.values(data.requests)
            .filter(r => r.accountId === accountId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
    }

    static async deleteCode(code, deletedBy, deletedByName) {
        const normalizedCode = code.toLowerCase();
        const codeData = await DatabaseManager.getCreatorCode(normalizedCode);

        if (!codeData) {
            return { success: false, error: 'Code not found' };
        }

        const result = await DatabaseManager.deleteCreatorCode(normalizedCode);

        if (!result) {
            return { success: false, error: 'Failed to delete code' };
        }

        LoggerService.log('info', `Creator code deleted: "${code}" (owned by ${codeData.displayName}) by ${deletedByName}`);
        return { success: true };
    }

    static async validateCode(code) {
        const normalizedCode = code.toLowerCase();
        const codeData = await DatabaseManager.getCreatorCode(normalizedCode);

        if (!codeData || !codeData.isActive) {
            return null;
        }

        return codeData;
    }

    static async recordUsage(code, purchaseAmount) {
        const normalizedCode = code.toLowerCase();
        const commissionPercent = this.getCommissionPercent();
        const commission = Math.floor(purchaseAmount * (commissionPercent / 100));

        const codeData = await DatabaseManager.getCreatorCode(normalizedCode);

        if (!codeData) {
            return { success: false, error: 'Code not found' };
        }

        await DatabaseManager.updateCreatorCode(normalizedCode, {
            totalUses: (codeData.totalUses || 0) + 1,
            totalEarnings: (codeData.totalEarnings || 0) + commission,
            lastUsedAt: new Date().toISOString()
        });

        LoggerService.log('info', `Creator code "${code}" used: +${commission} V-Bucks commission (${commissionPercent}% of ${purchaseAmount})`);

        return {
            success: true,
            commission,
            creatorAccountId: codeData.accountId,
            creatorDisplayName: codeData.displayName
        };
    }

    static async getAllCodes() {
        const data = await DatabaseManager.getCreatorCodesData();
        return Object.values(data.codes);
    }

    static async toggleCodeStatus(code, isActive) {
        const normalizedCode = code.toLowerCase();
        const codeData = await DatabaseManager.getCreatorCode(normalizedCode);

        if (!codeData) {
            return { success: false, error: 'Code not found' };
        }

        await DatabaseManager.updateCreatorCode(normalizedCode, { isActive });

        return { success: true, isActive };
    }

    static async updateCommissionPercent(percent) {
        if (percent < 0 || percent > 100) {
            return { success: false, error: 'Percent must be between 0 and 100' };
        }

        return { success: true, percent };
    }

    static async getStats() {
        const data = await DatabaseManager.getCreatorCodesData();
        const codes = Object.values(data.codes);
        const requests = Object.values(data.requests);

        return {
            totalCodes: codes.length,
            activeCodes: codes.filter(c => c.isActive).length,
            totalEarnings: codes.reduce((sum, c) => sum + (c.totalEarnings || 0), 0),
            totalUses: codes.reduce((sum, c) => sum + (c.totalUses || 0), 0),
            pendingRequests: requests.filter(r => r.status === 'pending').length,
            approvedRequests: requests.filter(r => r.status === 'approved').length,
            rejectedRequests: requests.filter(r => r.status === 'rejected').length,
            commissionPercent: this.getCommissionPercent()
        };
    }
}

module.exports = CreatorCodeService;
