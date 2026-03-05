const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const TokenService = require('../../src/service/token/web-token-service');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const FunctionsService = require('../../src/service/api/functions-service');
const LoggerService = require('../../src/service/logger/logger-service');
const bcrypt = require('bcrypt');
const { authRateLimit } = require('../../src/middleware/rate-limit-middleware');
const { csrfProtection, generateCsrfToken } = require('../../src/service/token/csrf-token-service');
const WebService = require('../../src/service/api/web-service');

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
        res.json({ success: true, user: req.user });
    } catch (error) {
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

        res.json({ success: true, message: 'Password changed successfully' });

    } catch (error) {
        LoggerService.log('error', `Change password error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*auth/logout', (req, res) => {
    clearAuthCookies(res);
    res.json({ success: true, message: 'Logged out successfully' });
});

router.get('*auth/csrf-token', (req, res) => {
    generateCsrfToken(req, res);
});

module.exports = router;
