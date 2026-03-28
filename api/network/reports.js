const router = require('express').Router();
const DatabaseManager = require('../../src/manager/database-manager');
const LoggerService = require('../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const { verifyToken } = require('../../src/middleware/auth-middleware');
const ConfigManager = require('../../src/manager/config-manager');
const ReportService = require('../../src/service/api/report-service');

router.post('/fortnite/api/game/v2/toxicity/account/:reporterId/report/:reportedId', verifyToken, async (req, res) => {
    if (!ConfigManager.get('enableReports', true)) {
        return res.status(200).json({});
    }

    try {
        const reportedAccount = await DatabaseManager.getAccount(req.params.reportedId);
        if (!reportedAccount) {
            return sendError(res, Errors.custom(
                'errors.com.epicgames.account.account_not_found',
                `User ${req.params.reportedId} not found`,
                18007, 404
            ));
        }

        const reporterAccount = await DatabaseManager.getAccount(req.user.accountId);

        await ReportService.createReport(
            req.user.accountId,
            reporterAccount?.displayName || req.user.accountId,
            req.params.reportedId,
            reportedAccount.displayName,
            req.body?.reason,
            req.body?.details
        );

        res.status(200).json({});
    } catch (error) {
        LoggerService.log('error', `Report endpoint error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
