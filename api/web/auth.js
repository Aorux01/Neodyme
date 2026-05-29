const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const DatabaseManager = require('../../src/manager/database-manager');
const TokenService = require('../../src/service/token/web-token-service');
const FunctionsService = require('../../src/service/api/functions-service');
const LoggerService = require('../../src/service/logger/logger-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { authRateLimit } = require('../../src/middleware/rate-limit-middleware');
const { csrfProtection, generateCsrfToken } = require('../../src/service/token/csrf-token-service');

const { setAuthCookies, clearAuthCookies, verifyToken } = WebService;

const MAX = { email: 254, username: 20, password: 128 };

router.post('/neodyme/api/auth/register', authRateLimit(), async (req, res) => {
    try {
        const { email, username, password } = req.body;

        if (!email || !username || !password) {
            return WebResponse.badRequest(res, 'Email, username, and password are required.');
        }
        if (email.length > MAX.email || username.length > MAX.username || password.length > MAX.password) {
            return WebResponse.badRequest(res, 'Input exceeds maximum allowed length.');
        }
        if (!FunctionsService.isValidEmail(email)) {
            return WebResponse.badRequest(res, 'Please provide a valid email address.');
        }
        if (!FunctionsService.isValidUsername(username)) {
            return WebResponse.badRequest(res, 'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores.');
        }

        const passwordCheck = FunctionsService.isValidPassword(password);
        if (!passwordCheck.valid) {
            return WebResponse.badRequest(res, passwordCheck.errors.join('. '));
        }

        const account = await DatabaseManager.createAccount(email, password, username);
        if (!account || !account.accountId) {
            return WebResponse.serverError(res, 'register', new Error('createAccount returned null'));
        }

        const tokens = await TokenService.generateTokenPair(account.accountId, 'fortnite', username);
        setAuthCookies(res, tokens.access_token, false);

        return WebResponse.ok(res, {
            message: 'Account created.',
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email
            }
        }, 201);
    } catch (error) {
        if (error.message && error.message.includes('already exists')) {
            return WebResponse.conflict(res, error.message);
        }
        return WebResponse.serverError(res, 'register', error);
    }
});

router.post('/neodyme/api/auth/login', authRateLimit(), async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        if (!email || !password) {
            return WebResponse.unauthorized(res, 'Invalid credentials.');
        }
        if (email.length > MAX.email || password.length > MAX.password) {
            return WebResponse.badRequest(res, 'Invalid request.');
        }

        let account = await DatabaseManager.getAccountByEmail(email);
        if (!account) {
            account = await DatabaseManager.getAccountByDisplayName(email);
        }
        if (!account || !account.accountId) {
            return WebResponse.unauthorized(res, 'Invalid credentials.');
        }

        const lockStatus = await DatabaseManager.isAccountLocked(account.accountId);
        if (lockStatus.locked) {
            const minutes = Math.ceil(lockStatus.remainingMs / 60000);
            return WebResponse.rateLimited(res, `Too many failed login attempts. Try again in ${minutes} minute(s).`);
        }

        const passwordMatch = await bcrypt.compare(password, account.password);
        if (!passwordMatch) {
            const attempt = await DatabaseManager.recordFailedLoginAttempt(account.accountId);
            if (attempt && attempt.locked) {
                return WebResponse.rateLimited(res, 'Too many failed login attempts. Account has been temporarily locked.');
            }
            return WebResponse.unauthorized(res, 'Invalid credentials.');
        }

        await DatabaseManager.resetFailedAttempts(account.accountId);

        const banInfo = DatabaseManager.getBanInfo(account.accountId);
        if (banInfo && banInfo.banned) {
            return WebResponse.forbidden(res, 'This account has been disabled.');
        }

        await DatabaseManager.updateLastLogin(account.accountId);

        const tokens = await TokenService.generateTokenPair(account.accountId, 'fortnite', account.displayName);
        setAuthCookies(res, tokens.access_token, remember === true);

        return WebResponse.ok(res, {
            message: 'Login successful.',
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'login', error);
    }
});

// Availability probes kept intentionally permissive (registration is the real gate).
// The small random delay smooths timing so this can't be used to enumerate accounts.
const availabilityProbe = async (_req, res) => {
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
    return WebResponse.ok(res, { valid: true });
};
router.post('/neodyme/api/auth/check-email', availabilityProbe);
router.post('/neodyme/api/auth/check-username', availabilityProbe);

router.get('/neodyme/api/auth/verify', verifyToken, (req, res) => {
    return WebResponse.ok(res, { user: req.user });
});

router.get('/neodyme/api/auth/profile', verifyToken, async (req, res) => {
    try {
        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) {
            return WebResponse.notFound(res, 'Account not found.');
        }
        return WebResponse.ok(res, {
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email,
                created: account.created,
                lastLogin: account.lastLogin
            }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get profile', error);
    }
});

router.put('/neodyme/api/auth/profile', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { displayName, email } = req.body;
        const updates = {};

        if (displayName && displayName !== req.user.displayName) {
            if (!FunctionsService.isValidUsername(displayName)) {
                return WebResponse.badRequest(res, 'Invalid display name format.');
            }
            updates.displayName = displayName;
        }
        if (email && email !== req.user.email) {
            if (!FunctionsService.isValidEmail(email)) {
                return WebResponse.badRequest(res, 'Invalid email format.');
            }
            updates.email = email;
        }

        if (Object.keys(updates).length === 0) {
            return WebResponse.ok(res, { message: 'No changes to update.' });
        }

        const updated = await DatabaseManager.updateAccount(req.user.accountId, updates);
        if (!updated) {
            return WebResponse.badRequest(res, 'Failed to update profile.');
        }

        LoggerService.log('info', `Profile updated for: ${req.user.accountId}`);
        return WebResponse.ok(res, {
            message: 'Profile updated successfully.',
            user: {
                accountId: updated.accountId,
                displayName: updated.displayName,
                email: updated.email
            }
        });
    } catch (error) {
        if (error.message && error.message.includes('already exists')) {
            return WebResponse.conflict(res, error.message);
        }
        return WebResponse.serverError(res, 'update profile', error);
    }
});

router.put('/neodyme/api/auth/change-password', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return WebResponse.badRequest(res, 'Current and new password are required.');
        }

        const passwordCheck = FunctionsService.isValidPassword(newPassword);
        if (!passwordCheck.valid) {
            return WebResponse.badRequest(res, passwordCheck.errors.join('. '));
        }

        const result = await DatabaseManager.updatePassword(req.user.accountId, currentPassword, newPassword);
        if (!result.success) {
            return WebResponse.badRequest(res, result.message || 'Failed to change password.');
        }

        LoggerService.log('info', `Password changed for: ${req.user.displayName} (${req.user.accountId})`);
        return WebResponse.ok(res, { message: 'Password changed successfully.' });
    } catch (error) {
        return WebResponse.serverError(res, 'change password', error);
    }
});

// Permanently deletes the caller's own account. Requires the current password as
// confirmation (destructive, irreversible). Kills sessions and clears cookies after.
router.delete('/neodyme/api/auth/account', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return WebResponse.badRequest(res, 'Your password is required to delete your account.');
        }

        const account = await DatabaseManager.getAccount(req.user.accountId);
        if (!account) {
            return WebResponse.notFound(res, 'Account not found.');
        }

        const passwordMatch = await bcrypt.compare(password, account.password);
        if (!passwordMatch) {
            return WebResponse.unauthorized(res, 'Incorrect password.');
        }

        const deleted = await DatabaseManager.deleteAccount(req.user.accountId);
        if (!deleted) {
            return WebResponse.serverError(res, 'delete account', new Error('deleteAccount returned false'));
        }

        try {
            await require('../../src/service/api/auth-service').killAllTokensForAccount(req.user.accountId);
        } catch { /* best-effort session cleanup */ }

        clearAuthCookies(res);
        LoggerService.log('info', `Account deleted: ${account.displayName} (${req.user.accountId})`);
        return WebResponse.ok(res, { message: 'Your account has been permanently deleted.' });
    } catch (error) {
        return WebResponse.serverError(res, 'delete account', error);
    }
});

router.post('/neodyme/api/auth/logout', (req, res) => {
    clearAuthCookies(res);
    return WebResponse.ok(res, { message: 'Logged out successfully.' });
});

router.get('/neodyme/api/auth/csrf-token', (req, res) => {
    generateCsrfToken(req, res);
});

module.exports = router;
