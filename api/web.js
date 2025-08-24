const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const AccountService = require('../src/services/AccountService');
const TokenService = require('../src/services/TokenService');
const ConfigService = require('../src/services/ConfigService');
const { Errors, sendError } = require('../src/errors/errors');
const Functions = require('../src/utils/functions');
const LoggerService = require("../src/utils/logger");

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: ConfigService.getRateLimit() || 5,
    message: { message: 'Too many authentication attempts' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { message: 'Too many registration attempts' }
});

// Middleware to verify JWT token using TokenService
const verifyToken = TokenService.createVerificationMiddleware();

// Supprime la fonction generateToken - maintenant dans TokenService

// Register endpoint
router.post('*/auth/register', registerLimiter, async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Validation des champs requis
        if (!email || !username || !password) {
            return sendError(res, Errors.Basic.badRequest());
        }

        // Validation de l'email
        if (!Functions.isValidEmail(email)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        // Validation du nom d'utilisateur
        if (!Functions.isValidUsername(username)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        // Validation du mot de passe
        if (!Functions.isValidPassword(password)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        // Créer le compte via AccountService
        const newAccount = await AccountService.createAccount(email, password, username);

        // Générer le token via TokenService
        const tokens = TokenService.generateTokenPair(newAccount);

        LoggerService.log('success', `Account created successfully: ${username} (${newAccount.accountId})`);

        res.status(201).json({
            success: true,
            message: 'Account created',
            token: tokens.accessToken,
            user: {
                accountId: newAccount.accountId,
                displayName: newAccount.displayName,
                email: newAccount.email
            }
        });

    } catch (error) {
        LoggerService.log('error', `Registration error: ${error}`);
        
        if (error.code === 'ACCOUNT_ALREADY_EXISTS') {
            return sendError(res, Errors.Basic.badRequest());
        }
        
        if (error.code === 'DISPLAY_NAME_TAKEN') {
            return sendError(res, Errors.Basic.badRequest());
        }
        
        sendError(res, Errors.Internal.serverError());
    }
});

// Login endpoint
router.post('*/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        if (!email || !password) {
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        let account;
        try {
            // Essayer de trouver le compte par email ou nom d'utilisateur
            try {
                account = await AccountService.getAccountByEmail(email);
            } catch (emailError) {
                // Si pas trouvé par email, essayer par displayName
                account = await AccountService.getAccountByDisplayName(email);
            }
        } catch (error) {
            LoggerService.log('info', `Account not found for email ${email}`);
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        // Vérifier si le compte est banni
        if (account.banned) {
            return sendError(res, Errors.Account.disabledAccount());
        }

        // Vérifier si le compte est verrouillé
        if (account.failedLoginAttempts >= 5) {
            return sendError(res, Errors.Account.inactiveAccount());
        }

        // Valider le mot de passe
        const isValid = await AccountService.validatePassword(account.accountId, password);
        if (!isValid) {
            await AccountService.incrementFailedLogins(account.accountId);
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        // Connexion réussie
        await AccountService.updateLastLogin(account.accountId);

        const tokens = TokenService.generateTokenPair(account, remember);

        LoggerService.log('success', `Login successful: ${account.displayName} (${account.accountId})`);

        res.json({
            success: true,
            message: 'Login successful',
            token: tokens.accessToken,
            user: {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email
            }
        });

    } catch (error) {
        LoggerService.log('warn', `Login error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Check email availability
router.post('*/auth/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.json({ exists: false });
        }

        try {
            await AccountService.getAccountByEmail(email);
            res.json({ exists: true });
        } catch (error) {
            res.json({ exists: false });
        }
    } catch (error) {
        LoggerService.log('warn', `Check email error: ${error}`);
        res.json({ exists: false });
    }
});

// Check username availability
router.post('*/auth/check-username', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.json({ exists: false });
        }

        try {
            await AccountService.getAccountByDisplayName(username);
            res.json({ exists: true });
        } catch (error) {
            res.json({ exists: false });
        }
    } catch (error) {
        LoggerService.log('error', `Check username error: ${error}`);
        res.json({ exists: false });
    }
});

// Verify token endpoint
router.get('*/auth/verify', verifyToken, async (req, res) => {
    try {
        const account = await AccountService.getAccount(req.user.accountId);
        
        if (account.banned) {
            return sendError(res, Errors.Account.disabledAccount());
        }

        res.json({
            success: true,
            user: AccountService.formatAccountResponse(account)
        });
    } catch (error) {
        LoggerService.log('error', `Token verification error: ${error}`);
        sendError(res, Errors.Authentication.invalidToken());
    }
});

// Get user profile
router.get('*/auth/profile', verifyToken, async (req, res) => {
    try {
        const account = await AccountService.getAccount(req.user.accountId);
        
        res.json({
            success: true,
            user: AccountService.formatAccountResponse(account, true)
        });
    } catch (error) {
        LoggerService.log('error', `Get profile error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Update profile
router.put('*/auth/profile', verifyToken, async (req, res) => {
    try {
        const { displayName, email, preferredLanguage, country } = req.body;
        const updates = {};

        if (displayName && displayName !== req.user.displayName) {
            // Validate display name
            if (!Functions.isValidUsername(displayName)) {
                return sendError(res, Errors.Basic.badRequest());
            }
            
            // Check if display name is available
            try {
                const existingAccount = await AccountService.getAccountByDisplayName(displayName);
                if (existingAccount.accountId !== req.user.accountId) {
                    return sendError(res, Errors.Basic.badRequest());
                }
            } catch (error) {
                // Display name is available
                updates.displayName = displayName;
                updates.numberOfDisplayNameChanges = (await AccountService.getAccount(req.user.accountId)).numberOfDisplayNameChanges + 1;
            }
        }

        if (email && email !== req.user.email) {
            // Validate email
            if (!Functions.isValidEmail(email)) {
                return sendError(res, Errors.Basic.badRequest());
            }
            
            // Check if email is available
            try {
                const existingAccount = await AccountService.getAccountByEmail(email);
                if (existingAccount.accountId !== req.user.accountId) {
                    return sendError(res, Errors.Basic.badRequest());
                }
            } catch (error) {
                // Email is available
                updates.email = email;
                updates.emailVerified = false; // Need to re-verify
            }
        }

        if (preferredLanguage) updates.preferredLanguage = preferredLanguage;
        if (country) updates.country = country;

        if (Object.keys(updates).length === 0) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const updatedAccount = await AccountService.updateAccount(req.user.accountId, updates);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: AccountService.formatAccountResponse(updatedAccount, true)
        });

    } catch (error) {
        LoggerService.log('error', `Update profile error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Change password
router.put('*/auth/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return sendError(res, Errors.Basic.badRequest());
        }

        // Validate current password
        const isValidPassword = await AccountService.validatePassword(req.user.accountId, currentPassword);
        if (!isValidPassword) {
            return sendError(res, Errors.Authentication.OAuth.invalidAccountCredentials());
        }

        // Validate new password strength
        if (!Functions.isValidPassword(newPassword)) {
            return sendError(res, Errors.Basic.badRequest());
        }

        await AccountService.changePassword(req.user.accountId, newPassword);

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

// Logout endpoint (client-side token removal)
router.post('*/auth/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Server status endpoint
router.get('*/status', async (req, res) => {
    try {
        const clients = await AccountService.getClients();
        const onlinePlayerCount = Math.floor(Math.random() * 100) + 50; // Demo data
        
        res.json({
            online: true,
            playerCount: onlinePlayerCount,
            registeredUsers: clients.length,
            serverVersion: '1.0.0',
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

// Search users (for friends, etc.)
router.get('*/users/search', verifyToken, async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        
        if (!q || q.length < 2) {
            return sendError(res, Errors.Basic.badRequest());
        }

        const results = await AccountService.searchAccounts(q);
        const limitedResults = results.slice(0, parseInt(limit));

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

// Get user by ID (for profiles, friends, etc.)
router.get('*/users/:accountId', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const account = await AccountService.getAccount(accountId);
        
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
        if (error.code === 'ACCOUNT_NOT_FOUND') {
            return sendError(res, Errors.Account.accountNotFound(req.params.accountId));
        }
        LoggerService.log('error', `Get user error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;