const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const DatabaseManager = require('../../src/manager/DatabaseManager');
const TokenService = require('../../src/service/token/TokenWebService');
const ConfigManager = require('../../src/manager/ConfigManager');
const { Errors, sendError } = require('../../src/service/error/Errors');
const FunctionsService = require('../../src/service/api/FunctionsService');
const LoggerService = require("../../src/service/logger/LoggerService");
const ShopManager = require('../../src/manager/ShopManager');
const bcrypt = require('bcrypt');

// TODO: in server.properties
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { message: 'Too many registration attempts' }
});

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return sendError(res, Errors.Authentication.invalidHeader());
        }

        const token = TokenService.extractTokenFromHeader(authHeader);
        
        if (!token) {
            return sendError(res, Errors.Authentication.invalidToken('malformed'));
        }

        const verification = TokenService.verifyToken(token);
        
        if (!verification.valid) {
            return sendError(res, Errors.Authentication.invalidToken(verification.error));
        }

        const accountId = verification.payload.accountId || verification.payload.account_id;
        
        if (!accountId) {
            return sendError(res, Errors.Authentication.invalidToken('missing account id'));
        }

        const account = await DatabaseManager.getAccount(accountId);
        if (!account) {
            return sendError(res, Errors.Authentication.invalidToken('account not found'));
        }

        req.user = {
            accountId: account.accountId,
            displayName: account.displayName,
            email: account.email
        };
        next();
    } catch (error) {
        LoggerService.log('error', `Token verification error: ${error}`);
        return sendError(res, Errors.Authentication.invalidToken());
    }
};

router.post('*auth/register', registerLimiter, async (req, res) => {
    try {
        const { email, username, password } = req.body;
        
        if (!email || !username || !password) {
            return sendError(res, Errors.Basic.badRequest());
        }

        if (!FunctionsService.isValidEmail(email)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        if (!FunctionsService.isValidUsername(username)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        if (!FunctionsService.isValidPassword(password)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const newAccount = await DatabaseManager.createAccount(email, password, username);

        if (!newAccount || !newAccount.accountId) {
            LoggerService.log('error', 'Account creation returned null account');
            return sendError(res, Errors.Internal.serverError());
        }

        const tokens = TokenService.generateTokenPair(newAccount.accountId, 'fortnite', username);

        //LoggerService.log('success', `Account created successfully: ${username} (${newAccount.accountId})`);

        res.status(201).json({
            success: true,
            message: 'Account created',
            token: tokens.access_token,
            user: {
                accountId: newAccount.accountId,
                displayName: newAccount.displayName,
                email: newAccount.email
            }
        });

    } catch (error) {
        LoggerService.log('error', `Registration error: ${error}`);
        
        if (error.message && error.message.includes('already exists')) {
            return sendError(res, Errors.Basic.badRequest());
        }
        
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        let account = await DatabaseManager.getAccountByEmail(email);

        if (!account) {
            account = await DatabaseManager.getAccountByDisplayName(email);
        }

        if (!account || !account.accountId) {
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        const passwordMatch = await bcrypt.compare(password, account.password);

        if (!passwordMatch) {
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        const banInfo = DatabaseManager.getBanInfo(account.accountId);
        if (banInfo && banInfo.banned) {
            return sendError(res, Errors.Account.disabledAccount());
        }

        await DatabaseManager.updateLastLogin(account.accountId);

        const tokens = TokenService.generateTokenPair(account.accountId, 'fortnite', account.displayName);

        res.json({
            success: true,
            message: 'Login successful',
            token: tokens.access_token,
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email
            }
        });

    } catch (error) {
        LoggerService.log('error', `Login error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('*user/vbucks', verifyToken, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        
        const balance = await DatabaseManager.getVbucksBalance(accountId);
        
        res.json({
            success: true,
            balance: balance,
            currency: 'V-Bucks'
        });
    } catch (error) {
        LoggerService.log('error', `Get V-Bucks balance error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*purchase/vbucks', verifyToken, async (req, res) => {
    try {
        const { packageAmount, price, paymentMethod } = req.body;
        const accountId = req.user.accountId;
        
        if (!packageAmount || !price) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const validPackages = [1000, 2800, 5000, 13500];
        if (!validPackages.includes(packageAmount)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        let bonus = 0;
        switch(packageAmount) {
            case 1000: bonus = 0; break;
            case 2800: bonus = 300; break;
            case 5000: bonus = 800; break;
            case 13500: bonus = 1500; break;
        }

        const totalVbucks = packageAmount;

        await DatabaseManager.processVbucksPurchase(accountId, totalVbucks, price, paymentMethod);

        LoggerService.log('info', `V-Bucks purchase: ${accountId} purchased ${totalVbucks} V-Bucks for $${price}`);

        res.json({
            success: true,
            message: 'Purchase successful',
            vbucksAdded: totalVbucks,
            baseAmount: packageAmount,
            bonusAmount: bonus,
            totalPaid: price
        });

    } catch (error) {
        LoggerService.log('error', `V-Bucks purchase error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*purchase/item', verifyToken, async (req, res) => {
    try {
        const { itemKey } = req.body;
        const accountId = req.user.accountId;
        
        if (!itemKey) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const shopData = await ShopManager.getShopData();
        const item = shopData[itemKey];

        if (!item) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const itemPrice = item.price || 0;

        const userBalance = await DatabaseManager.getVbucksBalance(accountId);
        if (userBalance < itemPrice) {
            return sendError(res, Errors.Economy.insufficientFunds());
        }

        const purchaseResult = await DatabaseManager.processItemPurchase(accountId, itemKey, item);

        if (!purchaseResult.success) {
            return sendError(res, Errors.Economy.purchaseFailed());
        }

        LoggerService.log('info', `Item purchase: ${accountId} purchased ${itemKey} for ${itemPrice} V-Bucks`);

        res.json({
            success: true,
            message: 'Item purchased successfully',
            item: itemKey,
            price: itemPrice,
            newBalance: purchaseResult.newBalance,
            purchaseId: purchaseResult.purchaseId
        });

    } catch (error) {
        LoggerService.log('error', `Item purchase error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*purchase/refund', verifyToken, async (req, res) => {
    try {
        const { purchaseId } = req.body;
        const accountId = req.user.accountId;
        
        if (!purchaseId) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const refundResult = await DatabaseManager.processPurchaseRefund(accountId, purchaseId);

        if (!refundResult.success) {
            return sendError(res, Errors.Economy.refundFailed());
        }

        LoggerService.log('info', `Purchase refund: ${accountId} refunded purchase ${purchaseId}`);

        res.json({
            success: true,
            message: 'Refund processed successfully',
            vbucksRefunded: refundResult.refundAmount,
            newBalance: refundResult.newBalance
        });

    } catch (error) {
        LoggerService.log('error', `Refund error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('*user/purchases', verifyToken, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const purchases = await DatabaseManager.getUserPurchaseHistory(accountId);
        
        res.json({
            success: true,
            purchases: purchases
        });

    } catch (error) {
        LoggerService.log('error', `Get purchases error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*auth/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.json({ exists: false });
        }

        const account = await DatabaseManager.getAccountByEmail(email);
        res.json({ exists: !!account });
    } catch (error) {
        LoggerService.log('warn', `Check email error: ${error}`);
        res.json({ exists: false });
    }
});

router.post('*auth/check-username', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.json({ exists: false });
        }

        const account = await DatabaseManager.getAccountByDisplayName(username);
        res.json({ exists: !!account });
    } catch (error) {
        LoggerService.log('error', `Check username error: ${error}`);
        res.json({ exists: false });
    }
});

router.get('*auth/verify', verifyToken, async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user
        });
    } catch (error) {
        LoggerService.log('error', `Token verification error: ${error}`);
        sendError(res, Errors.Authentication.invalidToken());
    }
});

router.get('*auth/profile', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        
        if (!account) {
            return sendError(res, Errors.Account.accountNotFound(req.user.accountId));
        }

        res.json({
            success: true,
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email,
                created: account.created,
                lastLogin: account.lastLogin
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get profile error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('*auth/profile', verifyToken, async (req, res) => {
    try {
        const { displayName, email } = req.body;
        
        if (displayName && displayName !== req.user.displayName) {
            if (!FunctionsService.isValidUsername(displayName)) {
                return sendError(res, Errors.Basic.badRequest());
            }
            
            try {
                const existingAccount = await DatabaseManager.getAccountByDisplayName(displayName);
                if (existingAccount && existingAccount.accountId !== req.user.accountId) {
                    return sendError(res, Errors.Basic.badRequest());
                }
            } catch (error) {}
        }

        if (email && email !== req.user.email) {
            if (!FunctionsService.isValidEmail(email)) {
                return sendError(res, Errors.Basic.badRequest());
            }
            
            try {
                const existingAccount = await DatabaseManager.getAccountByEmail(email);
                if (existingAccount && existingAccount.accountId !== req.user.accountId) {
                    return sendError(res, Errors.Basic.badRequest());
                }
            } catch (error) {}
        }

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        LoggerService.log('error', `Update profile error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('*auth/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return sendError(res, Errors.Basic.badRequest());
        }

        if (!FunctionsService.isValidPassword(newPassword)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        LoggerService.log('info', `Password changed for: ${req.user.displayName} (${req.user.accountId})`);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        LoggerService.log('error', `Change password error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*auth/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

router.get('*web/status', async (req, res) => {
    try {
        res.json({
            online: true,
            playerCount: "UNKNOWN",
            registeredUsers: "UNKNOWN",
            serverVersion: ConfigManager.get('version', '1.0.0'),
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({ 
            online: false,
            error: 'Failed to get server status'
        });
    }
});

router.get('*users/search', verifyToken, async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        
        if (!q || q.length < 2) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const limitedResults = [];

        res.json({
            success: true,
            users: limitedResults.map(account => ({
                accountId: account.accountId,
                displayName: account.displayName,
                email: `${account.displayName}@neodyme.local`
            }))
        });

    } catch (error) {
        LoggerService.log('error', `Search users error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('*users/:accountId', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const account = await DatabaseManager.getAccount(accountId);
        
        if (!account) {
            return sendError(res, Errors.Account.accountNotFound(accountId));
        }

        res.json({
            success: true,
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                email: `${account.displayName}@neodyme.local`,
                lastLogin: account.lastLogin,
                created: account.created
            }
        });

    } catch (error) {
        LoggerService.log('error', `Get user error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/*shop', async (req, res) => {
    try {
        const shopData = await ShopManager.getShopData();
        const state = await ShopManager.getShopState();
        
        const items = Object.keys(shopData).filter(key => !key.startsWith('//'));
        const dailyItems = items.filter(key => key.startsWith('daily'));
        const featuredItems = items.filter(key => key.startsWith('featured'));

        res.json({
            success: true,
            shop: shopData,
            metadata: {
                totalItems: items.length,
                dailyCount: dailyItems.length,
                featuredCount: featuredItems.length,
                lastRotation: state.lastRotation,
                nextRotation: state.nextRotation
            }
        });
    } catch (error) {
        LoggerService.log('error', 'Shop API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/*shop/status', async (req, res) => {
    try {
        const state = await ShopManager.getShopState();
        
        res.json({
            success: true,
            lastRotation: state.lastRotation,
            nextRotation: state.nextRotation
        });
    } catch (error) {
        LoggerService.log('error', 'Shop status API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/*shop/items', async (req, res) => {
    try {
        const shopData = await ShopManager.getShopData();
        
        const items = Object.keys(shopData)
            .filter(key => !key.startsWith('//'))
            .map(key => {
                const item = shopData[key];
                const [type, id] = item.itemGrants[0]?.split(':') || ['Unknown', 'Unknown'];
                
                return {
                    key: key,
                    id: id,
                    type: type,
                    price: item.price,
                    category: key.startsWith('daily') ? 'daily' : 'featured'
                };
            });

        res.json({
            success: true,
            items: items,
            count: items.length
        });
    } catch (error) {
        LoggerService.log('error', 'Shop items API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/*shop/rotate', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return sendError(res, Errors.Authentication.invalidHeader());
        }

        await ShopManager.forceRotation();
        
        LoggerService.log('info', 'Shop manually rotated via API');

        res.json({
            success: true,
            message: 'Shop rotated successfully'
        });
    } catch (error) {
        LoggerService.log('error', 'Shop rotation API error:', { error: error.message });
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;