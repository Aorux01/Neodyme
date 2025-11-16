const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../../src/manager/DatabaseManager');
const { Errors, sendError } = require('../../src/service/error/Errors');
const LoggerService = require('../../src/service/logger/LoggerService');
const { verifyToken } = require('../../src/middleware/authMiddleware');

const EXP_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'EXP.json');

let expConfig;
try {
    expConfig = JSON.parse(fs.readFileSync(EXP_CONFIG_PATH, 'utf8'));
} catch (error) {
    LoggerService.log('error', `Failed to load EXP.json: ${error.message}`);
    expConfig = {
        xpPerLevel: 80000,
        bookXpPerLevel: 1,
        bookXpRequiredForStar: 10,
        maxLevel: 100,
        xpRewards: {
            kill: 20,
            win: 300
        }
    };
}

function calculateXpToNextLevel(currentLevel) {
    if (currentLevel >= expConfig.maxLevel) {
        return expConfig.xpPerLevel;
    }
    return expConfig.xpPerLevel;
}

function processXpGain(profile, xpToAdd) {
    const beforeChanges = {
        level: profile.stats.attributes.level,
        xp: profile.stats.attributes.xp,
        book_xp: profile.stats.attributes.book_xp || 0,
        book_level: profile.stats.attributes.book_level || 0,
        accountLevel: profile.stats.attributes.accountLevel || profile.stats.attributes.level
    };

    let currentLevel = profile.stats.attributes.level;
    let currentXp = profile.stats.attributes.xp;
    let bookXp = profile.stats.attributes.book_xp || 0;
    let bookLevel = profile.stats.attributes.book_level || 0;

    currentXp += xpToAdd;

    while (currentLevel < expConfig.maxLevel) {
        const xpNeeded = calculateXpToNextLevel(currentLevel);
        
        if (currentXp >= xpNeeded) {
            currentLevel++;
            currentXp -= xpNeeded;
            
            bookXp += expConfig.bookXpPerLevel;
            
            while (bookXp >= expConfig.bookXpRequiredForStar) {
                bookXp -= expConfig.bookXpRequiredForStar;
                bookLevel++;
            }
        } else {
            break;
        }
    }

    if (currentXp < 0) currentXp = 0;

    profile.stats.attributes.level = currentLevel;
    profile.stats.attributes.xp = currentXp;
    profile.stats.attributes.book_xp = bookXp;
    profile.stats.attributes.book_level = bookLevel;
    profile.stats.attributes.accountLevel = currentLevel;

    profile.rvn = (profile.rvn || 0) + 1;
    profile.commandRevision = (profile.commandRevision || 0) + 1;
    profile.updated = new Date().toISOString();

    const afterChanges = {
        level: profile.stats.attributes.level,
        xp: profile.stats.attributes.xp,
        book_xp: profile.stats.attributes.book_xp,
        book_level: profile.stats.attributes.book_level,
        accountLevel: profile.stats.attributes.accountLevel
    };

    return { beforeChanges, afterChanges, profile };
}

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

        const xpReward = expConfig.xpRewards[reason] || expConfig.xpRewards.kill || 20;

        const result = processXpGain(profile, xpReward);

        const updated = await DatabaseManager.updateProfile(accountId, 'athena', result.profile);
        
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

        const result = processXpGain(profile, amount);

        const updated = await DatabaseManager.updateProfile(accountId, 'athena', result.profile);
        
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

        const xpToNextLevel = calculateXpToNextLevel(profile.stats.attributes.level);
        const progress = (profile.stats.attributes.xp / xpToNextLevel) * 100;

        res.status(200).json({
            status: 'success',
            level: profile.stats.attributes.level,
            xp: profile.stats.attributes.xp,
            xpToNextLevel: xpToNextLevel,
            progressPercentage: Math.round(progress * 100) / 100,
            book_level: profile.stats.attributes.book_level || 0,
            book_xp: profile.stats.attributes.book_xp || 0,
            accountLevel: profile.stats.attributes.accountLevel || profile.stats.attributes.level
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

        if (!level || typeof level !== 'number' || level < 1 || level > expConfig.maxLevel) {
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

        const updated = await DatabaseManager.updateProfile(accountId, 'athena', profile);
        
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
        res.json({
            status: 'success',
            config: expConfig
        });
    } catch (error) {
        LoggerService.log('error', `XP config error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;