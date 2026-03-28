const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../logger/logger-service');
const DatabaseManager = require('../../manager/database-manager');

class ReportService {
    static async createReport(reporterAccountId, reporterDisplayName, reportedAccountId, reportedDisplayName, reason, details) {
        const report = {
            reportId: `report_${uuidv4()}`,
            reporterAccountId,
            reporterDisplayName,
            reportedAccountId,
            reportedDisplayName,
            reason: typeof reason === 'string' ? reason.substring(0, 200) : 'No reason provided',
            details: typeof details === 'string' ? details.substring(0, 1000) : 'No details provided',
            createdAt: new Date().toISOString()
        };

        await DatabaseManager.createReport(report);
        LoggerService.log('info', `Report filed: ${reporterDisplayName} reported ${reportedDisplayName} - ${report.reason}`);

        return { success: true, reportId: report.reportId };
    }

    static async getAllReports(filters = {}) {
        let reports = await DatabaseManager.getAllReports();

        if (filters.reportedAccountId) {
            reports = reports.filter(r => r.reportedAccountId === filters.reportedAccountId);
        }
        if (filters.reporterAccountId) {
            reports = reports.filter(r => r.reporterAccountId === filters.reporterAccountId);
        }
        if (filters.search) {
            const s = filters.search.toLowerCase();
            reports = reports.filter(r =>
                r.reportedDisplayName.toLowerCase().includes(s) ||
                r.reporterDisplayName.toLowerCase().includes(s) ||
                r.reason.toLowerCase().includes(s)
            );
        }

        return reports;
    }

    static async getReportsByTarget(reportedAccountId) {
        return await DatabaseManager.getReportsByTarget(reportedAccountId);
    }

    static async deleteReport(reportId) {
        const report = await DatabaseManager.getReport(reportId);
        if (!report) {
            return { success: false, error: 'Report not found' };
        }

        await DatabaseManager.deleteReport(reportId);
        LoggerService.log('info', `Report ${reportId} dismissed`);
        return { success: true, message: 'Report dismissed' };
    }

    static async getStats() {
        const reports = await DatabaseManager.getAllReports();

        const byTarget = {};
        for (const r of reports) {
            byTarget[r.reportedAccountId] = byTarget[r.reportedAccountId] || {
                accountId: r.reportedAccountId,
                displayName: r.reportedDisplayName,
                count: 0
            };
            byTarget[r.reportedAccountId].count++;
        }

        const topReported = Object.values(byTarget)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            total: reports.length,
            uniqueTargets: Object.keys(byTarget).length,
            topReported
        };
    }
}

module.exports = ReportService;
