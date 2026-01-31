const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const TokenService = require('../../src/service/token/web-token-service');
const ConfigManager = require('../../src/manager/config-manager');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const FunctionsService = require('../../src/service/api/functions-service');
const LoggerService = require("../../src/service/logger/logger-service");
const ShopManager = require('../../src/manager/shop-manager');
const AuthService = require('../../src/service/api/auth-service');
const bcrypt = require('bcrypt');
const { authRateLimit, expensiveRateLimit } = require('../../src/middleware/rate-limit-middleware');
const { csrfProtection, generateCsrfToken } = require('../../src/service/token/csrf-token-service');
const WebService = require('../../src/service/api/web-service');
const CreatorCodeService = require('../../src/service/api/creator-code-service');
const TicketService = require('../../src/service/api/ticket-service');
const AuditService = require('../../src/service/api/audit-service');
const { ROLE_LEVELS, getUserRoleLevel, requireModerator, requireAdmin, requireDeveloper } = require('../../src/service/api/role-middleware-service');
const os = require('os');
const fs = require('fs');
const path = require('path');

const setAuthCookies = WebService.setAuthCookies;
const clearAuthCookies = WebService.clearAuthCookies;
const verifyToken = WebService.verifyToken;

router.post('*auth/register', authRateLimit(), async (req, res) => {
    try {
        const { email, username, password } = req.body;

        if (!email || !username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'Email, username, and password are required'
            });
        }

        if (email.length > 254 || username.length > 20 || password.length > 128) {
            return res.status(400).json({
                success: false,
                error: 'Invalid input length',
                message: 'Input exceeds maximum allowed length'
            });
        }

        if (!FunctionsService.isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email',
                message: 'Please provide a valid email address'
            });
        }

        if (!FunctionsService.isValidUsername(username)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid username',
                message: 'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores'
            });
        }

        const passwordValidation = FunctionsService.isValidPassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                success: false,
                error: 'Weak password',
                message: passwordValidation.errors.join('. ')
            });
        }

        const newAccount = await DatabaseManager.createAccount(email, password, username);

        if (!newAccount || !newAccount.accountId) {
            LoggerService.log('error', 'Account creation returned null account');
            return sendError(res, Errors.Internal.serverError());
        }

        const tokens = await TokenService.generateTokenPair(newAccount.accountId, 'fortnite', username);

        setAuthCookies(res, tokens.access_token, false);

        res.status(201).json({
            success: true,
            message: 'Account created',
            user: {
                accountId: newAccount.accountId,
                displayName: newAccount.displayName,
                email: newAccount.email
            }
        });

    } catch (error) {
        LoggerService.log('error', `Registration error: ${error}`);

        if (error.message && error.message.includes('already exists')) {
            return res.status(400).json({
                success: false,
                error: 'Account exists',
                message: error.message
            });
        }

        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*auth/login', authRateLimit(), async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        if (!email || !password) {
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        if (email.length > 254 || password.length > 128) {
            return sendError(res, Errors.Basic.badRequest());
        }

        let account = await DatabaseManager.getAccountByEmail(email);

        if (!account) {
            account = await DatabaseManager.getAccountByDisplayName(email);
        }

        if (!account || !account.accountId) {
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        const lockStatus = await DatabaseManager.isAccountLocked(account.accountId);
        if (lockStatus.locked) {
            const remainingMinutes = Math.ceil(lockStatus.remainingMs / 60000);
            return res.status(429).json({
                success: false,
                error: 'Account temporarily locked',
                message: `Too many failed login attempts. Try again in ${remainingMinutes} minute(s).`,
                lockedUntil: lockStatus.lockedUntil
            });
        }

        const passwordMatch = await bcrypt.compare(password, account.password);

        if (!passwordMatch) {
            const attemptResult = await DatabaseManager.recordFailedLoginAttempt(account.accountId);

            if (attemptResult && attemptResult.locked) {
                return res.status(429).json({
                    success: false,
                    error: 'Account locked',
                    message: 'Too many failed login attempts. Account has been temporarily locked.',
                    lockedUntil: attemptResult.lockedUntil
                });
            }

            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        await DatabaseManager.resetFailedAttempts(account.accountId);

        const banInfo = DatabaseManager.getBanInfo(account.accountId);
        if (banInfo && banInfo.banned) {
            return sendError(res, Errors.Account.disabledAccount());
        }

        await DatabaseManager.updateLastLogin(account.accountId);

        const tokens = await TokenService.generateTokenPair(account.accountId, 'fortnite', account.displayName);

        setAuthCookies(res, tokens.access_token, remember === true);

        res.json({
            success: true,
            message: 'Login successful',
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

router.get('*user/vbucks', verifyToken, csrfProtection, async (req, res) => {
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

router.post('*purchase/vbucks', expensiveRateLimit(), verifyToken, csrfProtection, async (req, res) => {
    try {
        const { packageAmount, price, paymentMethod, creatorCode } = req.body;
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

        let creatorCommission = null;
        if (creatorCode) {
            const commissionResult = await CreatorCodeService.recordUsage(creatorCode, packageAmount);
            if (commissionResult.success && commissionResult.commission > 0) {
                await DatabaseManager.addVbucks(commissionResult.creatorAccountId, commissionResult.commission);
                creatorCommission = {
                    code: creatorCode,
                    creatorName: commissionResult.creatorDisplayName,
                    amount: commissionResult.commission
                };
                LoggerService.log('info', `Creator code commission: ${commissionResult.creatorDisplayName} earned ${commissionResult.commission} V-Bucks from ${req.user.displayName}'s purchase`);
            }
        }

        LoggerService.log('info', `V-Bucks purchase: ${accountId} purchased ${totalVbucks} V-Bucks for $${price}`);

        res.json({
            success: true,
            message: 'Purchase successful',
            vbucksAdded: totalVbucks,
            baseAmount: packageAmount,
            bonusAmount: bonus,
            totalPaid: price,
            creatorSupported: creatorCommission
        });

    } catch (error) {
        LoggerService.log('error', `V-Bucks purchase error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*purchase/item', expensiveRateLimit(), verifyToken, csrfProtection, async (req, res) => {
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

router.post('*purchase/refund', expensiveRateLimit(), verifyToken, csrfProtection,async (req, res) => {
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

router.get('*user/purchases', verifyToken, csrfProtection, async (req, res) => {
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
    const delay = 100 + Math.random() * 100;
    await new Promise(resolve => setTimeout(resolve, delay));
    res.json({ valid: true, message: 'Validation completed' });
});

router.post('*auth/check-username', async (req, res) => {
    const delay = 100 + Math.random() * 100;
    await new Promise(resolve => setTimeout(resolve, delay));
    res.json({ valid: true, message: 'Validation completed' });
});

router.get('*auth/verify', verifyToken, async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user
        });
    } catch (error) {
        //LoggerService.log('error', `Token verification error: ${error}`);
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
        const updates = {};

        if (displayName && displayName !== req.user.displayName) {
            if (!FunctionsService.isValidUsername(displayName)) {
                return res.status(400).json({ success: false, message: 'Invalid display name format' });
            }
            updates.displayName = displayName;
        }

        if (email && email !== req.user.email) {
            if (!FunctionsService.isValidEmail(email)) {
                return res.status(400).json({ success: false, message: 'Invalid email format' });
            }
            updates.email = email;
        }

        if (Object.keys(updates).length > 0) {
            const updatedAccount = await DatabaseManager.updateAccount(req.user.accountId, updates);
            if (!updatedAccount) {
                return res.status(400).json({ success: false, message: 'Failed to update profile' });
            }

            LoggerService.log('info', `Profile updated for: ${req.user.accountId}`);

            res.json({
                success: true,
                message: 'Profile updated successfully',
                user: {
                    accountId: updatedAccount.accountId,
                    displayName: updatedAccount.displayName,
                    email: updatedAccount.email
                }
            });
        } else {
            res.json({ success: true, message: 'No changes to update' });
        }

    } catch (error) {
        LoggerService.log('error', `Update profile error: ${error}`);
        if (error.message && error.message.includes('already exists')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('*auth/change-password', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }

        const passwordValidation = FunctionsService.isValidPassword(newPassword);
        if (!passwordValidation.valid) {
            return res.status(400).json({ success: false, message: passwordValidation.errors.join('. ') });
        }

        const result = await DatabaseManager.updatePassword(req.user.accountId, currentPassword, newPassword);

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message || 'Failed to change password' });
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
    clearAuthCookies(res);
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

router.get('*auth/csrf-token', (req, res) => {
    generateCsrfToken(req, res);
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
            return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
        }

        const users = await DatabaseManager.searchUsers(q, parseInt(limit));

        res.json({
            success: true,
            users: users.filter(u => u.accountId !== req.user.accountId)
        });

    } catch (error) {
        LoggerService.log('error', `Search users error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('*user/settings', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { language, region, privacy } = req.body;

        const currentSettings = await DatabaseManager.getUserSettings(req.user.accountId);
        const newSettings = {
            language: language || currentSettings.language,
            region: region || currentSettings.region,
            privacy: privacy ? { ...currentSettings.privacy, ...privacy } : currentSettings.privacy
        };

        await DatabaseManager.saveUserSettings(req.user.accountId, newSettings);

        res.json({ success: true, message: 'Settings saved successfully', settings: newSettings });
    } catch (error) {
        LoggerService.log('error', `Save settings error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('*user/friends', verifyToken, csrfProtection, async (req, res) => {
    try {
        const friendsData = await DatabaseManager.getFriends(req.user.accountId);

        const friendsWithDetails = await Promise.all(
            friendsData.friends.map(async (friend) => {
                const account = await DatabaseManager.getAccount(friend.accountId);
                return {
                    accountId: friend.accountId,
                    displayName: account?.displayName || 'Unknown',
                    status: 'offline',
                    created: friend.created
                };
            })
        );

        const incomingWithDetails = await Promise.all(
            friendsData.incoming.map(async (accountId) => {
                const account = await DatabaseManager.getAccount(accountId);
                return {
                    accountId,
                    displayName: account?.displayName || 'Unknown'
                };
            })
        );

        const outgoingWithDetails = await Promise.all(
            friendsData.outgoing.map(async (accountId) => {
                const account = await DatabaseManager.getAccount(accountId);
                return {
                    accountId,
                    displayName: account?.displayName || 'Unknown'
                };
            })
        );

        res.json({
            success: true,
            friends: friendsWithDetails,
            incoming: incomingWithDetails,
            outgoing: outgoingWithDetails,
            blocklist: friendsData.blocklist
        });
    } catch (error) {
        LoggerService.log('error', `Get friends error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*user/friends/add', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({ success: false, message: 'Account ID is required' });
        }

        if (accountId === req.user.accountId) {
            return res.status(400).json({ success: false, message: 'Cannot add yourself as a friend' });
        }

        const targetAccount = await DatabaseManager.getAccount(accountId);
        if (!targetAccount) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const result = await DatabaseManager.sendFriendRequest(req.user.accountId, accountId);

        if (!result.success) {
            return res.status(400).json({ success: false, message: 'Friend request already sent or already friends' });
        }

        res.json({ success: true, message: 'Friend request sent' });
    } catch (error) {
        LoggerService.log('error', `Add friend error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*user/friends/accept', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({ success: false, message: 'Account ID is required' });
        }

        const result = await DatabaseManager.acceptFriendRequest(req.user.accountId, accountId);

        if (!result.success) {
            return res.status(400).json({ success: false, message: 'No pending request from this user' });
        }

        res.json({ success: true, message: 'Friend request accepted' });
    } catch (error) {
        LoggerService.log('error', `Accept friend error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*user/friends/reject', csrfProtection, verifyToken, async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({ success: false, message: 'Account ID is required' });
        }

        const result = await DatabaseManager.rejectOrRemoveFriend(req.user.accountId, accountId);

        if (!result.success) {
            return res.status(400).json({ success: false, message: 'Failed to reject request' });
        }

        res.json({ success: true, message: 'Friend request rejected' });
    } catch (error) {
        LoggerService.log('error', `Reject friend error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('*user/friends/:accountId', csrfProtection, verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;

        const result = await DatabaseManager.rejectOrRemoveFriend(req.user.accountId, accountId);

        if (!result.success) {
            return res.status(400).json({ success: false, message: 'Failed to remove friend' });
        }

        res.json({ success: true, message: 'Friend removed' });
    } catch (error) {
        LoggerService.log('error', `Remove friend error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('*users/:accountId', verifyToken, csrfProtection, async (req, res) => {
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

router.post('/*shop/rotate', expensiveRateLimit(), csrfProtection,async (req, res) => {
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

router.get('/api/sessions/active', verifyToken, async (req, res) => {
    try {
        //LoggerService.log('debug', `Sessions active route hit`);
        //LoggerService.log('debug', `req.user exists = ${!!req.user}`);

        if (!req.user || !req.user.accountId) {
            //LoggerService.log('error', 'Sessions active: req.user or accountId is missing');
            return sendError(res, Errors.Authentication.invalidToken('missing user'));
        }

        const accountId = req.user.accountId;
        //LoggerService.log('debug', `Getting active sessions for account: ${accountId}`);

        const sessions = await AuthService.getActiveSessions(accountId);
        //LoggerService.log('debug', `Found ${sessions ? sessions.length : 0} sessions`);

        if (!sessions || !Array.isArray(sessions)) {
            return res.status(200).json({
                success: true,
                sessions: []
            });
        }

        res.status(200).json({
            success: true,
            sessions: sessions.map(session => ({
                sessionId: session.sessionId,
                deviceId: session.deviceId,
                ip: session.ip,
                ipSubnet: session.ipSubnet,
                createdAt: new Date(session.createdAt).toISOString(),
                lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : null,
                expiresAt: new Date(session.expiresAt).toISOString(),
                isCurrent: req.token && req.token.includes(session.sessionId),
                hasRefreshToken: session.hasRefreshToken || false
            }))
        });
    } catch (error) {
        LoggerService.log('error', `Get active sessions error: ${error.message}`);
        LoggerService.log('error', `Stack trace: ${error.stack}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/sessions/:sessionId', verifyToken, expensiveRateLimit(), async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const sessionId = req.params.sessionId;

        if (!sessionId) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const result = await AuthService.killSpecificSession(accountId, sessionId);

        if (result) {
            res.status(200).json({
                success: true,
                message: 'Session terminated successfully'
            });
        } else {
            return sendError(res, Errors.Basic.notFound());
        }
    } catch (error) {
        LoggerService.log('error', `Kill session error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/sessions/all', verifyToken, expensiveRateLimit(), async (req, res) => {
    try {
        const accountId = req.user.accountId;

        await AuthService.killAllTokensForAccount(accountId);

        res.status(200).json({
            success: true,
            message: 'All sessions terminated successfully. Please log in again.'
        });
    } catch (error) {
        LoggerService.log('error', `Kill all sessions error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/sessions/count', verifyToken, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const sessions = await AuthService.getActiveSessions(accountId);

        res.status(200).json({
            success: true,
            count: sessions.length
        });
    } catch (error) {
        LoggerService.log('error', `Get session count error: ${error.message}`);
        return sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/creator-code/me', verifyToken, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const code = await CreatorCodeService.getUserCode(accountId);
        const request = await CreatorCodeService.getUserRequest(accountId);

        res.json({
            success: true,
            hasCode: !!code,
            code: code,
            pendingRequest: request && request.status === 'pending' ? request : null,
            lastRequest: request
        });
    } catch (error) {
        LoggerService.log('error', `Get creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/creator-code/request', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { code, reason } = req.body;
        const accountId = req.user.accountId;
        const displayName = req.user.displayName;

        if (!code) {
            return res.status(400).json({ success: false, error: 'Code is required' });
        }

        const result = await CreatorCodeService.requestCode(accountId, displayName, code, reason);
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Request creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/creator-code/me', verifyToken, csrfProtection, async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const displayName = req.user.displayName;
        const code = await CreatorCodeService.getUserCode(accountId);

        if (!code) {
            return res.status(404).json({ success: false, error: 'You do not have a creator code' });
        }

        const result = await CreatorCodeService.deleteCode(code.code, accountId, displayName);
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Delete creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/user/role', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        const roleLevel = getUserRoleLevel(account);
        const roleName = DatabaseManager.getRoleName(roleLevel);

        const panels = {
            moderation: roleLevel >= ROLE_LEVELS.MODERATOR,
            developer: roleLevel >= ROLE_LEVELS.DEVELOPER,
            admin: roleLevel >= ROLE_LEVELS.ADMIN
        };

        res.json({
            success: true,
            role: roleName,
            roleLevel: roleLevel,
            panels
        });
    } catch (error) {
        LoggerService.log('error', `Get user role error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/creator-codes/requests', verifyToken, requireModerator, async (req, res) => {
    try {
        const requests = await CreatorCodeService.getPendingRequests();
        res.json({ success: true, requests });
    } catch (error) {
        LoggerService.log('error', `Get creator code requests error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/creator-codes/requests/all', verifyToken, requireModerator, async (req, res) => {
    try {
        const requests = await CreatorCodeService.getAllRequests();
        res.json({ success: true, requests });
    } catch (error) {
        LoggerService.log('error', `Get all creator code requests error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/creator-codes/approve/:requestId', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { note } = req.body;
        const result = await CreatorCodeService.approveRequest(
            requestId,
            req.user.accountId,
            req.user.displayName,
            note
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Approve creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/creator-codes/reject/:requestId', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { note } = req.body;
        const result = await CreatorCodeService.rejectRequest(
            requestId,
            req.user.accountId,
            req.user.displayName,
            note
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Reject creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/creator-codes', verifyToken, requireModerator, async (req, res) => {
    try {
        const codes = await CreatorCodeService.getAllCodes();
        res.json({ success: true, codes });
    } catch (error) {
        LoggerService.log('error', `Get all creator codes error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/mod/creator-codes/:code', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { code } = req.params;
        const result = await CreatorCodeService.deleteCode(
            code,
            req.user.accountId,
            req.user.displayName
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Delete creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/creator-codes/:code/toggle', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { code } = req.params;
        const { isActive } = req.body;
        const result = await CreatorCodeService.toggleCodeStatus(code, isActive);
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Toggle creator code error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/creator-codes/stats', verifyToken, requireModerator, async (req, res) => {
    try {
        const stats = await CreatorCodeService.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        LoggerService.log('error', `Get creator code stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/admin/creator-codes/commission', verifyToken, requireAdmin, csrfProtection, async (req, res) => {
    try {
        const { percent } = req.body;

        if (typeof percent !== 'number' || percent < 0 || percent > 100) {
            return res.status(400).json({ success: false, error: 'Percent must be a number between 0 and 100' });
        }

        const saved = await ConfigManager.save('creatorCodeCommissionPercent', percent);

        if (saved) {
            LoggerService.log('info', `Creator code commission updated to ${percent}% by ${req.user.displayName}`);
            res.json({
                success: true,
                message: `Commission updated to ${percent}%`
            });
        } else {
            res.json({
                success: true,
                message: `Commission updated to ${percent}% (in memory only)`,
                warning: 'Failed to save to server.properties'
            });
        }
    } catch (error) {
        LoggerService.log('error', `Update commission error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        res.json({
            success: true,
            users: users.map(u => {
                const roleLevel = typeof u.clientType === 'number' ? u.clientType : 0;
                return {
                    accountId: u.accountId,
                    displayName: u.displayName,
                    email: u.email,
                    role: DatabaseManager.getRoleName(roleLevel),
                    roleLevel: roleLevel,
                    created: u.created,
                    lastLogin: u.lastLogin,
                    banned: u.banned || false
                };
            })
        });
    } catch (error) {
        LoggerService.log('error', `Get all users error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/admin/users/:accountId/role', verifyToken, requireAdmin, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { role } = req.body;

        const validRoles = ['player', 'mod', 'moderator', 'dev', 'developer', 'admin'];
        if (!validRoles.includes(role.toLowerCase())) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        await DatabaseManager.updateAccountRole(accountId, role.toLowerCase());
        LoggerService.log('info', `User ${accountId} role updated to ${role} by ${req.user.displayName}`);

        res.json({ success: true, message: `Role updated to ${role}` });
    } catch (error) {
        LoggerService.log('error', `Update user role error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/admin/users/:accountId/ban', verifyToken, requireAdmin, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { banned, reason } = req.body;

        await DatabaseManager.setBanStatus(accountId, banned, reason);
        LoggerService.log('info', `User ${accountId} ${banned ? 'banned' : 'unbanned'} by ${req.user.displayName}${reason ? ': ' + reason : ''}`);

        res.json({ success: true, message: `User ${banned ? 'banned' : 'unbanned'}` });
    } catch (error) {
        LoggerService.log('error', `Ban user error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/stats', verifyToken, requireAdmin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        const creatorStats = await CreatorCodeService.getStats();

        res.json({
            success: true,
            stats: {
                totalUsers: users.length,
                bannedUsers: users.filter(u => u.banned).length,
                admins: users.filter(u => u.clientType === ROLE_LEVELS.ADMIN || u.clientType === ROLE_LEVELS.OWNER).length,
                moderators: users.filter(u => u.clientType === ROLE_LEVELS.MODERATOR).length,
                developers: users.filter(u => u.clientType === ROLE_LEVELS.DEVELOPER).length,
                creatorCodes: creatorStats
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get admin stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// TICKET SYSTEM - Player Endpoints
// ============================================

router.post('/api/tickets', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { subject, message, priority } = req.body;
        const result = await TicketService.createTicket(
            req.user.accountId,
            req.user.displayName,
            subject,
            message,
            priority
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Create ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/tickets/my', verifyToken, async (req, res) => {
    try {
        const tickets = await TicketService.getPlayerTickets(req.user.accountId);
        res.json({ success: true, tickets });
    } catch (error) {
        LoggerService.log('error', `Get my tickets error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/tickets/:ticketId', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        const roleLevel = getUserRoleLevel(account);
        const isModerator = roleLevel >= ROLE_LEVELS.MODERATOR;

        const result = await TicketService.getTicket(
            req.params.ticketId,
            req.user.accountId,
            isModerator
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Get ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/tickets/:ticketId/messages', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await TicketService.addPlayerMessage(
            req.params.ticketId,
            req.user.accountId,
            req.user.displayName,
            content
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Add ticket message error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// TICKET SYSTEM - Moderator Endpoints
// ============================================

router.get('/api/mod/tickets', verifyToken, requireModerator, async (req, res) => {
    try {
        const { status, priority, assignedTo, unassigned } = req.query;
        const filters = {};
        if (status) filters.status = status;
        if (priority) filters.priority = priority;
        if (assignedTo) filters.assignedTo = assignedTo;
        if (unassigned === 'true') filters.unassigned = true;

        const tickets = await TicketService.getAllTickets(filters);
        res.json({ success: true, tickets });
    } catch (error) {
        LoggerService.log('error', `Get all tickets error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/tickets/stats', verifyToken, requireModerator, async (req, res) => {
    try {
        const stats = await TicketService.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        LoggerService.log('error', `Get ticket stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/tickets/:ticketId/assign', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const result = await TicketService.assignTicket(
            req.params.ticketId,
            req.user.accountId,
            req.user.displayName
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Assign ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/tickets/:ticketId/unassign', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const result = await TicketService.unassignTicket(req.params.ticketId);
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Unassign ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/tickets/:ticketId/reply', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { content } = req.body;
        const result = await TicketService.addModeratorReply(
            req.params.ticketId,
            req.user.accountId,
            req.user.displayName,
            content
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Moderator reply error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/tickets/:ticketId/status', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { status } = req.body;
        const result = await TicketService.updateTicketStatus(
            req.params.ticketId,
            status,
            req.user.displayName
        );

        // Log to audit if closing
        if (status === 'closed') {
            await AuditService.logTicketAction(
                req.user.accountId,
                req.user.displayName,
                AuditService.ACTIONS.CLOSE_TICKET,
                req.params.ticketId,
                {},
                req.ip
            );
        }

        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Update ticket status error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/mod/tickets/:ticketId/priority', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { priority } = req.body;
        const result = await TicketService.updateTicketPriority(
            req.params.ticketId,
            priority,
            req.user.displayName
        );
        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Update ticket priority error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/api/mod/tickets/:ticketId', verifyToken, requireAdmin, csrfProtection, async (req, res) => {
    try {
        const result = await TicketService.deleteTicket(req.params.ticketId, req.user.displayName);

        if (result.success) {
            await AuditService.logTicketAction(
                req.user.accountId,
                req.user.displayName,
                AuditService.ACTIONS.DELETE_TICKET,
                req.params.ticketId,
                {},
                req.ip
            );
        }

        res.json(result);
    } catch (error) {
        LoggerService.log('error', `Delete ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// MODERATOR - Player Management (Ban/Unban)
// ============================================

router.get('/api/mod/players', verifyToken, requireModerator, async (req, res) => {
    try {
        const { search, banned } = req.query;
        let users = await DatabaseManager.getAllAccounts();

        // Filter only players (not staff)
        users = users.filter(u => (u.clientType || 0) < ROLE_LEVELS.MODERATOR);

        // Apply search filter
        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(u =>
                u.displayName.toLowerCase().includes(searchLower) ||
                u.email.toLowerCase().includes(searchLower) ||
                u.accountId.toLowerCase().includes(searchLower)
            );
        }

        // Apply banned filter
        if (banned === 'true') {
            users = users.filter(u => u.banned);
        } else if (banned === 'false') {
            users = users.filter(u => !u.banned);
        }

        res.json({
            success: true,
            players: users.map(u => ({
                accountId: u.accountId,
                displayName: u.displayName,
                email: u.email,
                created: u.created,
                lastLogin: u.lastLogin,
                banned: u.banned || false,
                banReasons: u.banReasons || []
            }))
        });
    } catch (error) {
        LoggerService.log('error', `Get players error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/mod/players/:accountId/bans', verifyToken, requireModerator, async (req, res) => {
    try {
        const { accountId } = req.params;

        // Get ban history from audit log
        const history = await AuditService.getTargetHistory('user', accountId, 50);
        const banHistory = history.filter(l =>
            l.action === AuditService.ACTIONS.BAN_USER ||
            l.action === AuditService.ACTIONS.UNBAN_USER
        );

        res.json({ success: true, history: banHistory });
    } catch (error) {
        LoggerService.log('error', `Get ban history error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/players/:accountId/ban', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { reason, duration } = req.body;

        if (!reason || reason.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'Ban reason is required (min 3 characters)' });
        }

        const targetAccount = await DatabaseManager.getAccount(accountId);
        if (!targetAccount) {
            return res.status(404).json({ success: false, error: 'Player not found' });
        }

        // Check if trying to ban a staff member
        const targetRoleLevel = targetAccount.clientType || 0;
        if (targetRoleLevel >= ROLE_LEVELS.MODERATOR) {
            return res.status(403).json({ success: false, error: 'Cannot ban staff members' });
        }

        // Calculate ban expiry if duration is provided (in hours)
        let banExpires = null;
        if (duration && duration > 0) {
            banExpires = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
        }

        await DatabaseManager.banAccount(accountId, [reason], banExpires);

        // Log to audit
        await AuditService.logBan(
            req.user.accountId,
            req.user.displayName,
            accountId,
            targetAccount.displayName,
            reason,
            duration ? `${duration} hours` : 'permanent',
            req.ip
        );

        LoggerService.log('info', `Player ${targetAccount.displayName} banned by ${req.user.displayName}: ${reason}`);

        res.json({
            success: true,
            message: `Player ${targetAccount.displayName} has been banned`,
            banExpires
        });
    } catch (error) {
        LoggerService.log('error', `Ban player error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/api/mod/players/:accountId/unban', verifyToken, requireModerator, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.params;

        const targetAccount = await DatabaseManager.getAccount(accountId);
        if (!targetAccount) {
            return res.status(404).json({ success: false, error: 'Player not found' });
        }

        await DatabaseManager.unbanAccount(accountId);

        // Log to audit
        await AuditService.logUnban(
            req.user.accountId,
            req.user.displayName,
            accountId,
            targetAccount.displayName,
            req.ip
        );

        LoggerService.log('info', `Player ${targetAccount.displayName} unbanned by ${req.user.displayName}`);

        res.json({
            success: true,
            message: `Player ${targetAccount.displayName} has been unbanned`
        });
    } catch (error) {
        LoggerService.log('error', `Unban player error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// DEVELOPER - Configuration Management
// ============================================

router.get('/api/dev/config', verifyToken, requireDeveloper, async (req, res) => {
    try {
        // Return configurable settings grouped by category
        const config = {
            debug: {
                debug: ConfigManager.get('debug', false),
                debugRequests: ConfigManager.get('debugRequests', false),
                debugResponses: ConfigManager.get('debugResponses', false),
                debugIps: ConfigManager.get('debugIps', false),
                databaseLogging: ConfigManager.get('databaseLogging', false)
            },
            maintenance: {
                maintenanceMode: ConfigManager.get('maintenanceMode', false),
                maintenanceMessage: ConfigManager.get('maintenanceMessage', ''),
                maintenanceEstimatedDowntime: ConfigManager.get('maintenanceEstimatedDowntime', '')
            },
            rateLimiting: {
                rateLimiting: ConfigManager.get('rateLimiting', true),
                maxRequestsPerMinute: ConfigManager.get('maxRequestsPerMinute', 125),
                authMaxAttempts: ConfigManager.get('authMaxAttempts', 5),
                authWindowMinutes: ConfigManager.get('authWindowMinutes', 15),
                expensiveMaxRequests: ConfigManager.get('expensiveMaxRequests', 10),
                expensiveWindowMinutes: ConfigManager.get('expensiveWindowMinutes', 5)
            },
            features: {
                plugins: ConfigManager.get('plugins', true),
                autoShopRotation: ConfigManager.get('autoShopRotation', true),
                xmppEnable: ConfigManager.get('xmppEnable', true),
                webInterface: ConfigManager.get('webInterface', true)
            },
            events: {
                bEnableAllEvents: ConfigManager.get('bEnableAllEvents', true),
                bAllSTWEventsActivated: ConfigManager.get('bAllSTWEventsActivated', true),
                bEnableGeodeEvent: ConfigManager.get('bEnableGeodeEvent', false),
                bEnableCrackInTheSky: ConfigManager.get('bEnableCrackInTheSky', false),
                bEnableS4OddityPrecursor: ConfigManager.get('bEnableS4OddityPrecursor', false),
                bEnableS4OddityExecution: ConfigManager.get('bEnableS4OddityExecution', false),
                bEnableS5OddityPrecursor: ConfigManager.get('bEnableS5OddityPrecursor', false),
                bEnableS5OddityExecution: ConfigManager.get('bEnableS5OddityExecution', false),
                bEnableCubeLightning: ConfigManager.get('bEnableCubeLightning', false),
                bEnableBlockbusterRiskyEvent: ConfigManager.get('bEnableBlockbusterRiskyEvent', false),
                bEnableCubeLake: ConfigManager.get('bEnableCubeLake', false)
            },
            database: {
                databaseBackup: ConfigManager.get('databaseBackup', true),
                databaseBackupInterval: ConfigManager.get('databaseBackupInterval', 60),
                databaseBackupExpiryDays: ConfigManager.get('databaseBackupExpiryDays', 7),
                getJsonSpacing: ConfigManager.get('getJsonSpacing', true)
            },
            gameDefaults: {
                bGrantFoundersPacks: ConfigManager.get('bGrantFoundersPacks', false),
                bCompletedSeasonalQuests: ConfigManager.get('bCompletedSeasonalQuests', false)
            },
            ssl: {
                protocol: ConfigManager.get('protocol', 'http'),
                sslCertPath: ConfigManager.get('sslCertPath', 'config/ssl/cert.pem'),
                sslKeyPath: ConfigManager.get('sslKeyPath', 'config/ssl/key.pem'),
                secureCookies: ConfigManager.get('secureCookies', false)
            }
        };

        res.json({ success: true, config });
    } catch (error) {
        LoggerService.log('error', `Get config error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/dev/config/:key', verifyToken, requireDeveloper, csrfProtection, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        // List of allowed config keys for developers
        const allowedKeys = [
            'debug', 'debugRequests', 'debugResponses', 'debugIps', 'databaseLogging',
            'maintenanceMode', 'maintenanceMessage', 'maintenanceEstimatedDowntime',
            'rateLimiting', 'maxRequestsPerMinute', 'authMaxAttempts', 'authWindowMinutes',
            'expensiveMaxRequests', 'expensiveWindowMinutes',
            'plugins', 'autoShopRotation', 'xmppEnable',
            'bEnableAllEvents', 'bAllSTWEventsActivated', 'bEnableGeodeEvent',
            'bEnableCrackInTheSky', 'bEnableS4OddityPrecursor', 'bEnableS4OddityExecution',
            'bEnableS5OddityPrecursor', 'bEnableS5OddityExecution', 'bEnableCubeLightning',
            'bEnableBlockbusterRiskyEvent', 'bEnableCubeLake',
            'databaseBackup', 'databaseBackupInterval', 'databaseBackupExpiryDays', 'getJsonSpacing',
            'bGrantFoundersPacks', 'bCompletedSeasonalQuests',
            'protocol', 'sslCertPath', 'sslKeyPath', 'secureCookies'
        ];

        if (!allowedKeys.includes(key)) {
            return res.status(403).json({ success: false, error: 'This configuration key cannot be modified' });
        }

        const oldValue = ConfigManager.get(key);
        const saved = await ConfigManager.save(key, value);

        // Log to audit
        await AuditService.logConfigChange(
            req.user.accountId,
            req.user.displayName,
            key,
            oldValue,
            value,
            req.ip
        );

        LoggerService.log('info', `Config ${key} changed from ${oldValue} to ${value} by ${req.user.displayName}`);

        res.json({
            success: true,
            message: `Configuration ${key} updated`,
            saved,
            warning: saved ? null : 'Failed to persist to server.properties'
        });
    } catch (error) {
        LoggerService.log('error', `Update config error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/config/files', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const configDir = path.join(__dirname, '../../config');
        const files = fs.readdirSync(configDir)
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: path.join(configDir, f),
                size: fs.statSync(path.join(configDir, f)).size
            }));

        res.json({ success: true, files });
    } catch (error) {
        LoggerService.log('error', `Get config files error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/config/files/:fileName', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const { fileName } = req.params;

        // Security: only allow specific JSON files
        const allowedFiles = ['experience.json', 'game-servers.json', 'shop.json', 'motd.json'];
        if (!allowedFiles.includes(fileName)) {
            return res.status(403).json({ success: false, error: 'Access to this file is not allowed' });
        }

        const filePath = path.join(__dirname, '../../config', fileName);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json({ success: true, fileName, content });
    } catch (error) {
        LoggerService.log('error', `Get config file error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.put('/api/dev/config/files/:fileName', verifyToken, requireDeveloper, csrfProtection, async (req, res) => {
    try {
        const { fileName } = req.params;
        const { content } = req.body;

        // Security: only allow specific JSON files
        const allowedFiles = ['experience.json', 'game-servers.json', 'shop.json', 'motd.json'];
        if (!allowedFiles.includes(fileName)) {
            return res.status(403).json({ success: false, error: 'Access to this file is not allowed' });
        }

        // Validate JSON
        if (typeof content !== 'object') {
            return res.status(400).json({ success: false, error: 'Content must be a valid JSON object' });
        }

        const filePath = path.join(__dirname, '../../config', fileName);
        const tempPath = filePath + '.tmp';

        // Write to temp file first, then rename (atomic write)
        fs.writeFileSync(tempPath, JSON.stringify(content, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);

        // Log to audit
        await AuditService.logConfigFileChange(
            req.user.accountId,
            req.user.displayName,
            fileName,
            req.ip
        );

        LoggerService.log('info', `Config file ${fileName} updated by ${req.user.displayName}`);

        res.json({ success: true, message: `${fileName} updated successfully` });
    } catch (error) {
        LoggerService.log('error', `Update config file error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// DEVELOPER - Server Statistics
// ============================================

router.get('/api/dev/stats/server', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const memUsage = process.memoryUsage();

        res.json({
            success: true,
            stats: {
                version: ConfigManager.get('version', '1.0.0'),
                apiVersion: ConfigManager.get('apiVersion', '1.0'),
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: Math.floor(process.uptime()),
                uptimeFormatted: formatUptime(process.uptime()),
                memory: {
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                    rss: Math.round(memUsage.rss / 1024 / 1024),
                    external: Math.round(memUsage.external / 1024 / 1024)
                },
                system: {
                    totalMem: Math.round(os.totalmem() / 1024 / 1024),
                    freeMem: Math.round(os.freemem() / 1024 / 1024),
                    cpus: os.cpus().length,
                    loadAvg: os.loadavg()
                }
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get server stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/dev/stats/database', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const dataDir = path.join(__dirname, '../../data');
        const users = await DatabaseManager.getAllAccounts();

        // Get file sizes
        const files = {};
        const dataFiles = ['clients.json', 'tickets.json', 'creator-codes.json', 'audit-log.json'];
        for (const file of dataFiles) {
            const filePath = path.join(dataDir, file);
            if (fs.existsSync(filePath)) {
                files[file] = {
                    size: fs.statSync(filePath).size,
                    sizeFormatted: formatBytes(fs.statSync(filePath).size)
                };
            }
        }

        res.json({
            success: true,
            stats: {
                type: ConfigManager.get('databaseType', 'json'),
                backupEnabled: ConfigManager.get('databaseBackup', true),
                backupInterval: ConfigManager.get('databaseBackupInterval', 60),
                totalUsers: users.length,
                files
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get database stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// DEVELOPER - SSL Status
// ============================================

router.get('/api/dev/ssl/status', verifyToken, requireDeveloper, async (req, res) => {
    try {
        const protocol = ConfigManager.get('protocol', 'http');
        const certPath = path.resolve(ConfigManager.get('sslCertPath', 'config/ssl/cert.pem'));
        const keyPath = path.resolve(ConfigManager.get('sslKeyPath', 'config/ssl/key.pem'));

        const certExists = fs.existsSync(certPath);
        const keyExists = fs.existsSync(keyPath);

        let certInfo = null;
        if (certExists) {
            const certStat = fs.statSync(certPath);
            certInfo = {
                path: certPath,
                size: certStat.size,
                modified: certStat.mtime.toISOString()
            };
        }

        res.json({
            success: true,
            ssl: {
                protocol,
                httpsActive: protocol === 'https',
                secureCookies: ConfigManager.get('secureCookies', false),
                certificate: {
                    path: certPath,
                    exists: certExists,
                    info: certInfo
                },
                key: {
                    path: keyPath,
                    exists: keyExists
                }
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get SSL status error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// ADMIN - Audit Log
// ============================================

router.get('/api/admin/audit-log', verifyToken, requireAdmin, async (req, res) => {
    try {
        const { action, performedBy, targetType, search, page, limit } = req.query;

        const filters = {
            action,
            performedBy,
            targetType,
            search,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50
        };

        const result = await AuditService.getLogs(filters);
        res.json({ success: true, ...result });
    } catch (error) {
        LoggerService.log('error', `Get audit log error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/api/admin/audit-log/summary', verifyToken, requireAdmin, async (req, res) => {
    try {
        const { hours } = req.query;
        const summary = await AuditService.getRecentSummary(parseInt(hours) || 24);
        res.json({ success: true, summary });
    } catch (error) {
        LoggerService.log('error', `Get audit summary error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// ADMIN - Advanced Statistics
// ============================================

router.get('/api/admin/stats/detailed', verifyToken, requireAdmin, async (req, res) => {
    try {
        const users = await DatabaseManager.getAllAccounts();
        const creatorStats = await CreatorCodeService.getStats();
        const ticketStats = await TicketService.getStats();

        // Calculate activity stats
        const now = new Date();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const activeLastDay = users.filter(u => u.lastLogin && new Date(u.lastLogin) >= oneDayAgo).length;
        const activeLastWeek = users.filter(u => u.lastLogin && new Date(u.lastLogin) >= oneWeekAgo).length;
        const activeLastMonth = users.filter(u => u.lastLogin && new Date(u.lastLogin) >= oneMonthAgo).length;

        const registeredLastDay = users.filter(u => u.created && new Date(u.created) >= oneDayAgo).length;
        const registeredLastWeek = users.filter(u => u.created && new Date(u.created) >= oneWeekAgo).length;
        const registeredLastMonth = users.filter(u => u.created && new Date(u.created) >= oneMonthAgo).length;

        res.json({
            success: true,
            stats: {
                users: {
                    total: users.length,
                    banned: users.filter(u => u.banned).length,
                    byRole: {
                        players: users.filter(u => (u.clientType || 0) === 0).length,
                        moderators: users.filter(u => u.clientType === ROLE_LEVELS.MODERATOR).length,
                        developers: users.filter(u => u.clientType === ROLE_LEVELS.DEVELOPER).length,
                        admins: users.filter(u => u.clientType === ROLE_LEVELS.ADMIN).length,
                        owners: users.filter(u => u.clientType === ROLE_LEVELS.OWNER).length
                    }
                },
                activity: {
                    activeLastDay,
                    activeLastWeek,
                    activeLastMonth
                },
                registrations: {
                    lastDay: registeredLastDay,
                    lastWeek: registeredLastWeek,
                    lastMonth: registeredLastMonth
                },
                creatorCodes: creatorStats,
                tickets: ticketStats
            }
        });
    } catch (error) {
        LoggerService.log('error', `Get detailed stats error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// ============================================
// Helper Functions
// ============================================

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;
