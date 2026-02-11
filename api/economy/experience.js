const router = require('express').Router();
const DatabaseManager = require('../../src/manager/database-manager');
const EXPService = require('../../src/service/api/experience-service');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const { verifyToken } = require('../../src/middleware/auth-middleware');

EXPService.loadConfig().catch(err => {
    LoggerService.log('error', `Failed to initialize EXP config: ${err.message}`);
});

router.post('/fortnite/api/v1/profile/:accountId/xp/add', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { reason } = req.body;

        if (accountId !== req.user.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        
        if (!profile) {
            return sendError(res, Errors.Account.accountNotFound(accountId));
        }

        if (!profile.stats || !profile.stats.attributes) {
            return sendError(res, Errors.Internal.serverError());
        }

        const xpReward = EXPService.getXpReward(reason);
        const result = EXPService.addXpToProfile(profile, xpReward);

        const updated = await DatabaseManager.saveProfile(accountId, 'athena', result.profile);
        
        if (!updated) {
            return sendError(res, Errors.Internal.serverError());
        }

        LoggerService.log('info', `XP added: ${accountId} gained ${xpReward} XP (${reason})`);

        res.status(200).json({
            status: 'success',
            reason: reason,
            xpAdded: xpReward,
            beforeChanges: result.beforeChanges,
            afterChanges: result.afterChanges
        });

    } catch (error) {
        LoggerService.log('error', `XP add error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/fortnite/api/v1/profile/:accountId/xp/addSpecificAmount', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { amount } = req.body;

        if (accountId !== req.user.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        
        if (!profile) {
            return sendError(res, Errors.Account.accountNotFound(accountId));
        }

        if (!profile.stats || !profile.stats.attributes) {
            return sendError(res, Errors.Internal.serverError());
        }

        const result = EXPService.addXpToProfile(profile, amount);

        const updated = await DatabaseManager.saveProfile(accountId, 'athena', result.profile);
        
        if (!updated) {
            return sendError(res, Errors.Internal.serverError());
        }

        LoggerService.log('info', `XP added (specific): ${accountId} gained ${amount} XP`);

        res.status(200).json({
            status: 'success',
            xpAdded: amount,
            beforeChanges: result.beforeChanges,
            afterChanges: result.afterChanges
        });

    } catch (error) {
        LoggerService.log('error', `XP add specific amount error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/fortnite/api/v1/profile/:accountId/xp/get', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;

        if (accountId !== req.user.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        
        if (!profile) {
            return sendError(res, Errors.Account.accountNotFound(accountId));
        }

        if (!profile.stats || !profile.stats.attributes) {
            return sendError(res, Errors.Internal.serverError());
        }

        const progressInfo = EXPService.getProgressInfo(profile);

        res.status(200).json({
            status: 'success',
            ...progressInfo
        });

    } catch (error) {
        LoggerService.log('error', `XP get error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/fortnite/api/v1/profile/:accountId/xp/setLevel', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { level } = req.body;

        if (accountId !== req.user.accountId) {
            return sendError(res, Errors.Authentication.notYourAccount());
        }

        const config = EXPService.getConfig();
        if (!level || typeof level !== 'number' || level < 1 || level > config.maxLevel) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const profile = await DatabaseManager.getProfile(accountId, 'athena');
        
        if (!profile) {
            return sendError(res, Errors.Account.accountNotFound(accountId));
        }

        if (!profile.stats || !profile.stats.attributes) {
            return sendError(res, Errors.Internal.serverError());
        }

        const beforeChanges = {
            level: profile.stats.attributes.level,
            xp: profile.stats.attributes.xp,
            book_xp: profile.stats.attributes.book_xp || 0,
            book_level: profile.stats.attributes.book_level || 0,
            accountLevel: profile.stats.attributes.accountLevel || profile.stats.attributes.level
        };

        profile.stats.attributes.level = level;
        profile.stats.attributes.xp = 0;
        profile.stats.attributes.accountLevel = level;
        profile.stats.attributes.book_level = level;
        profile.stats.attributes.book_xp = 0;

        profile.rvn = (profile.rvn || 0) + 1;
        profile.commandRevision = (profile.commandRevision || 0) + 1;
        profile.updated = new Date().toISOString();

        const updated = await DatabaseManager.saveProfile(accountId, 'athena', profile);
        
        if (!updated) {
            return sendError(res, Errors.Internal.serverError());
        }

        LoggerService.log('info', `Level set: ${accountId} set to level ${level}`);

        const afterChanges = {
            level: profile.stats.attributes.level,
            xp: profile.stats.attributes.xp,
            book_xp: profile.stats.attributes.book_xp,
            book_level: profile.stats.attributes.book_level,
            accountLevel: profile.stats.attributes.accountLevel
        };

        res.status(200).json({
            status: 'success',
            beforeChanges,
            afterChanges
        });

    } catch (error) {
        LoggerService.log('error', `XP set level error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/fortnite/api/v1/xp/config', async (req, res) => {
    try {
        const config = EXPService.getConfig();
        res.json({
            status: 'success',
            config: config
        });
    } catch (error) {
        LoggerService.log('error', `XP config error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
