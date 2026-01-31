const router = require('express').Router();
const DatabaseManager = require('../../src/manager/database-manager');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const { verifyToken } = require('../../src/middleware/auth-middleware');

router.get('/fortnite/api/v1/profile/:accountId/vbucks/get', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;

        if (accountId !== req.user.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        const balance = await DatabaseManager.getVbucksBalance(accountId);

        res.status(200).json({
            success: true,
            accountId,
            balance
        });

    } catch (error) {
        LoggerService.log('error', `Get V-Bucks error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/fortnite/api/v1/profile/:accountId/vbucks/add', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { amount } = req.body;

        if (accountId !== req.user.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const currentBalance = await DatabaseManager.getVbucksBalance(accountId);
        const newBalance = currentBalance + amount;

        const updated = await DatabaseManager.setVbucksBalance(accountId, newBalance);

        if (!updated) {
            return sendError(res, Errors.Internal.serverError());
        }

        LoggerService.log('info', `V-Bucks added: ${accountId} gained ${amount} V-Bucks (${currentBalance} -> ${newBalance})`);

        res.status(200).json({
            success: true,
            accountId,
            amountAdded: amount,
            previousBalance: currentBalance,
            newBalance
        });

    } catch (error) {
        LoggerService.log('error', `Add V-Bucks error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/fortnite/api/v1/profile/:accountId/vbucks/set', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { amount } = req.body;

        if (accountId !== req.user.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        if (typeof amount !== 'number' || amount < 0) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const currentBalance = await DatabaseManager.getVbucksBalance(accountId);
        const updated = await DatabaseManager.setVbucksBalance(accountId, amount);

        if (!updated) {
            return sendError(res, Errors.Internal.serverError());
        }

        LoggerService.log('info', `V-Bucks set: ${accountId} balance set to ${amount} (was ${currentBalance})`);

        res.status(200).json({
            success: true,
            accountId,
            previousBalance: currentBalance,
            newBalance: amount
        });

    } catch (error) {
        LoggerService.log('error', `Set V-Bucks error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/fortnite/api/v1/profile/:accountId/vbucks/purchase', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { price, paymentMethod } = req.body;

        if (accountId !== req.user.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        if (!price || typeof price !== 'number' || price <= 0) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const result = await DatabaseManager.processVbucksPurchase(
            accountId,
            price,
            price / 100,
            paymentMethod || 'card'
        );

        if (!result.success) {
            return sendError(res, Errors.Basic.badRequest());
        }

        LoggerService.log('success', `V-Bucks purchased: ${accountId} bought ${price} V-Bucks`);

        res.status(200).json({
            success: true,
            accountId,
            vbucksPurchased: price,
            newBalance: result.newBalance,
            purchaseId: result.purchaseId
        });

    } catch (error) {
        LoggerService.log('error', `V-Bucks purchase error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
