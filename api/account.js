const express = require('express');
const router = express.Router();
const AccountService = require('../src/services/AccountService');
const TokenService = require('../src/services/TokenService');
const LoggerService = require('../src/utils/logger');
const { Errors, sendError } = require('../src/errors/errors');
const Functions = require('../src/utils/functions');

const requireAuth = TokenService.createVerificationMiddleware();

// Get account by ID or displayName
router.get('/account/api/public/account/:identifier', requireAuth, async (req, res) => {
    try {
        const identifier = req.params.identifier;

        // Determine if identifier is UUID (32 hex characters) or displayName
        const isUUID = identifier.length === 32 && /^[a-f0-9]+$/i.test(identifier);
        let account;

        if (isUUID) {
            account = await AccountService.getAccount(identifier);
        } else {
            account = await AccountService.getAccountByDisplayName(identifier);
        }

        // Verify that the token matches the account (unless it's a client token)
        if (req.user.accountId !== account.accountId && req.user?.type !== 'client_credentials') {
            throw Errors.Authentication.notYourAccount();
        }

        LoggerService.log('info', 'Account information requested', {
            requestedAccount: account.displayName,
            requestedBy: req.user.displayName
        });

        // Format the account response using AccountService
        const formattedAccount = AccountService.formatAccountResponse(account, true);
        
        res.json(formattedAccount);
    } catch (error) {
        LoggerService.log('error', 'Failed to get account information', {
            identifier: req.params.identifier,
            error: error.message
        });
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Account.accountNotFound(req.params.identifier));
        }
    }
});

// Get multiple accounts
router.get('/account/api/public/account', requireAuth, async (req, res) => {
    try {
        const accountIds = Array.isArray(req.query.accountId) 
            ? req.query.accountId 
            : [req.query.accountId].filter(Boolean);

        if (!accountIds || accountIds.length === 0) {
            return res.json([]);
        }

        if (accountIds.length > 100) {
            throw Errors.Account.invalidAccountIdCount();
        }

        const accounts = await AccountService.getMultipleAccounts(accountIds);
        
        const response = accounts.map(account => ({
            id: account.accountId,
            displayName: account.displayName,
            externalAuths: {}
        }));

        LoggerService.log('debug', 'Multiple accounts requested', { 
            count: accountIds.length,
            requestedBy: req.user.displayName 
        });

        res.json(response);
    } catch (error) {
        LoggerService.log('error', 'Failed to get multiple accounts', {
            error: error.message,
            stack: error.stack,
            accountIds: req.query.accountId
        });
        
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Search accounts by display name
router.get('/account/api/public/account/displayName/:displayName', requireAuth, async (req, res) => {
    try {
        const account = await AccountService.getAccountByDisplayName(req.params.displayName);

        res.json({
            id: account.accountId,
            displayName: account.displayName,
            externalAuths: {}
        });
    } catch (error) {
        sendError(res, Errors.Account.accountNotFound(req.params.displayName));
    }
});

// Update account
router.put('/account/api/public/account/:accountId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const allowedUpdates = {};
        
        // Only allow certain fields to be updated
        if (req.body.email && Functions.validateEmail(req.body.email)) {
            allowedUpdates.email = req.body.email;
            allowedUpdates.emailVerified = false; // Require re-verification
        }
        if (req.body.preferredLanguage) {
            allowedUpdates.preferredLanguage = req.body.preferredLanguage;
        }
        if (req.body.country) {
            allowedUpdates.country = req.body.country;
        }

        if (Object.keys(allowedUpdates).length === 0) {
            throw Errors.Basic.badRequest();
        }

        const updatedAccount = await AccountService.updateAccount(req.params.accountId, allowedUpdates);

        LoggerService.log('success', 'Account updated successfully', {
            accountId: updatedAccount.accountId,
            displayName: updatedAccount.displayName,
            updatedFields: Object.keys(allowedUpdates)
        });

        res.json(AccountService.formatAccountResponse(updatedAccount, true));
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Change display name
router.put('/account/api/public/account/:accountId/displayName', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const { displayName } = req.body;
        
        if (!displayName || !Functions.validateDisplayName(displayName)) {
            throw Errors.Basic.badRequest();
        }

        const oldDisplayName = req.user.displayName;
        await AccountService.changeDisplayName(req.params.accountId, displayName);

        LoggerService.log('success', 'Display name changed', {
            accountId: req.params.accountId,
            oldDisplayName: oldDisplayName,
            newDisplayName: displayName
        });
        
        res.json({
            displayName: displayName
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Create account (registration)
router.post('/account/api/public/account', async (req, res) => {
    try {
        const { email, password, displayName, country, preferredLanguage } = req.body;

        if (!email || !password || !displayName) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        if (!Functions.validateEmail(email)) {
            throw Errors.Internal.validationFailed('email');
        }

        if (!Functions.validateDisplayName(displayName)) {
            throw Errors.Internal.validationFailed('displayName');
        }

        if (password.length < 6) {
            throw Errors.Internal.validationFailed('password');
        }

        // Create account using AccountService
        const newAccount = await AccountService.createAccount(email, password, displayName);

        // Update additional fields if provided
        const updates = {};
        if (country) updates.country = country;
        if (preferredLanguage) updates.preferredLanguage = preferredLanguage;
        
        if (Object.keys(updates).length > 0) {
            await AccountService.updateAccount(newAccount.accountId, updates);
            Object.assign(newAccount, updates);
        }

        LoggerService.log('success', 'Account created via public API', {
            accountId: newAccount.accountId,
            displayName: displayName,
            email: email
        });

        res.status(201).json({
            accountId: newAccount.accountId,
            displayName: newAccount.displayName,
            email: newAccount.email,
            created: true
        });
            } catch (error) {
        LoggerService.log('error', 'Account creation failed', { 
            email: email,
            displayName: displayName,
            error: error.message 
        });
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// SDK account endpoints
router.get('/sdk/v1/namespace/:namespace/account/:accountId', requireAuth, async (req, res) => {
    try {
        const account = await AccountService.getAccount(req.params.accountId);
        
        res.json({
            accountId: account.accountId,
            displayName: account.displayName,
            preferredLanguage: account.preferredLanguage || "en",
            linkedAccounts: [],
            country: account.country || "US"
        });
    } catch (error) {
        sendError(res, Errors.Account.accountNotFound(req.params.accountId));
    }
});

router.get('/epic/id/v2/sdk/accounts', requireAuth, async (req, res) => {
    try {
        const account = await AccountService.getAccount(req.user.account_id);
        
        res.json([{
            accountId: account.accountId,
            displayName: account.displayName,
            preferredLanguage: account.preferredLanguage || "en",
            cabinedMode: account.cabinedMode || false,
            empty: false
        }]);
    } catch (error) {
        res.json([]);
    }
});

// Delete account
router.delete('/account/api/public/account/:accountId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        // Verify password before deletion
        const { password } = req.body;
        if (!password) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        // Verify password using AccountService
        const isValidPassword = await AccountService.validatePassword(req.params.accountId, password);
        
        if (!isValidPassword) {
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }

        // Delete the account using AccountService
        await AccountService.deleteAccount(req.params.accountId);

        LoggerService.log('warn', 'Account deleted', {
            accountId: req.params.accountId,
            displayName: req.user.displayName
        });

        res.status(204).end();
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Try play on platform
router.post('/fortnite/api/game/v2/tryPlayOnPlatform/account/:accountId', requireAuth, async (req, res) => {
    res.send('true');
});

// Account security endpoints
router.get('/account/api/public/account/:accountId/security', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const account = await AccountService.getAccount(req.params.accountId);
        
        res.json({
            twoFactorEnabled: account.tfaEnabled || false,
            emailVerified: account.emailVerified || true,
            emailAuthEnabled: false,
            lastPasswordChange: account.passwordLastChanged || account.created,
            numberOfPasswordChanges: account.numberOfPasswordChanges || 0,
            numberOfEmailChanges: account.numberOfEmailChanges || 0
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Change password
router.post('/account/api/public/account/:accountId/security/password', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const { oldPassword, newPassword } = req.body;
        
        if (!oldPassword || !newPassword) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        if (newPassword.length < 6) {
            throw Errors.Internal.validationFailed('password');
        }

        // Verify old password using AccountService
        const isValidPassword = await AccountService.validatePassword(req.params.accountId, oldPassword);
        
        if (!isValidPassword) {
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }

        // Change password using AccountService
        await AccountService.changePassword(req.params.accountId, newPassword);

        // Update password change tracking
        await AccountService.updateAccount(req.params.accountId, {
            passwordLastChanged: new Date().toISOString(),
            numberOfPasswordChanges: (req.user.account.numberOfPasswordChanges || 0) + 1
        });

        LoggerService.log('success', 'Password changed successfully', {
            accountId: req.params.accountId,
            displayName: req.user.displayName
        });

        res.json({
            success: true,
            message: "Password changed successfully"
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Email verification
router.post('/account/api/public/account/:accountId/security/email/verify', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        // Verify email using AccountService
        await AccountService.verifyEmail(req.params.accountId);

        LoggerService.log('success', 'Email verified successfully', {
            accountId: req.params.accountId,
            displayName: req.user.displayName
        });
        
        res.json({
            success: true,
            emailVerified: true
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Change email endpoint
router.post('/account/api/public/account/:accountId/security/email', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const { newEmail, password } = req.body;
        
        if (!newEmail || !password) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        if (!Functions.validateEmail(newEmail)) {
            throw Errors.Internal.validationFailed('email');
        }

        // Verify password
        const isValidPassword = await AccountService.validatePassword(req.params.accountId, password);
        
        if (!isValidPassword) {
            throw Errors.Authentication.OAuth.invalidAccountCredentials();
        }

        // Update email using AccountService
        await AccountService.updateAccount(req.params.accountId, {
            email: newEmail,
            emailVerified: false, // Require re-verification
            numberOfEmailChanges: (req.user.account.numberOfEmailChanges || 0) + 1
        });

        LoggerService.log('success', 'Email changed successfully', {
            accountId: req.params.accountId,
            displayName: req.user.displayName,
            oldEmail: req.user.email,
            newEmail: newEmail
        });

        res.json({
            success: true,
            message: "Email changed successfully",
            newEmail: newEmail,
            emailVerified: false
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Account settings endpoints
router.get('/account/api/public/account/:accountId/settings', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const account = await AccountService.getAccount(req.params.accountId);
        
        res.json({
            accountId: account.accountId,
            country: account.country || "US",
            preferredLanguage: account.preferredLanguage || "en",
            cabinedMode: account.cabinedMode || false,
            canUpdateDisplayName: account.canUpdateDisplayName !== false,
            numberOfDisplayNameChanges: account.numberOfDisplayNameChanges || 0,
            ageGroup: account.ageGroup || "ADULT",
            minorStatus: account.minorStatus || "NOT_MINOR"
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Update account settings
router.put('/account/api/public/account/:accountId/settings', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const allowedSettings = {};
        
        if (req.body.country) allowedSettings.country = req.body.country;
        if (req.body.preferredLanguage) allowedSettings.preferredLanguage = req.body.preferredLanguage;
        if (typeof req.body.cabinedMode === 'boolean') allowedSettings.cabinedMode = req.body.cabinedMode;

        if (Object.keys(allowedSettings).length === 0) {
            throw Errors.Basic.badRequest();
        }

        const updatedAccount = await AccountService.updateAccount(req.params.accountId, allowedSettings);

        LoggerService.log('success', 'Account settings updated', {
            accountId: req.params.accountId,
            displayName: req.user.displayName,
            updatedSettings: Object.keys(allowedSettings)
        });

        res.json({
            success: true,
            settings: {
                accountId: updatedAccount.accountId,
                country: updatedAccount.country,
                preferredLanguage: updatedAccount.preferredLanguage,
                cabinedMode: updatedAccount.cabinedMode
            }
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Ban/Unban account endpoints (admin only)
router.post('/account/api/public/account/:accountId/ban', requireAuth, async (req, res) => {
    try {
        // In a real implementation, check if the requester has admin privileges
        const { reason } = req.body;
        
        await AccountService.banAccount(req.params.accountId, reason);

        LoggerService.log('warn', 'Account banned by admin', {
            targetAccountId: req.params.accountId,
            adminAccountId: req.user.account_id,
            reason: reason || 'No reason provided'
        });

        res.json({
            success: true,
            message: "Account has been banned",
            accountId: req.params.accountId,
            banned: true,
            banReason: reason || "Violation of Terms of Service"
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

router.post('/account/api/public/account/:accountId/unban', requireAuth, async (req, res) => {
    try {
        // In a real implementation, check if the requester has admin privileges
        await AccountService.unbanAccount(req.params.accountId);

        LoggerService.log('info', 'Account unbanned by admin', {
            targetAccountId: req.params.accountId,
            adminAccountId: req.user.account_id
        });

        res.json({
            success: true,
            message: "Account has been unbanned",
            accountId: req.params.accountId,
            banned: false
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Account statistics endpoint
router.get('/account/api/public/account/:accountId/stats', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const account = await AccountService.getAccount(req.params.accountId);
        
        res.json({
            accountId: account.accountId,
            displayName: account.displayName,
            created: account.created,
            lastLogin: account.lastLogin,
            failedLoginAttempts: account.failedLoginAttempts || 0,
            numberOfDisplayNameChanges: account.numberOfDisplayNameChanges || 0,
            numberOfPasswordChanges: account.numberOfPasswordChanges || 0,
            numberOfEmailChanges: account.numberOfEmailChanges || 0,
            emailVerified: account.emailVerified || false,
            tfaEnabled: account.tfaEnabled || false,
            banned: account.banned || false,
            banReason: account.banReason || null,
            banDate: account.banDate || null
        });
    } catch (error) {
        if (error.errorCode) {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

module.exports = router;