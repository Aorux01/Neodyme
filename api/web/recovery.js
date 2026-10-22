const express = require('express');
const router = express.Router();
const RecoveryService = require('../../src/service/api/recovery-service');
const WebTokenService = require('../../src/service/token/web-token-service');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const LoggerService = require('../../src/service/logger/logger-service');
const TwoFactorService = require('../../src/service/security/two-factor-service');
const DiscordService = require('../../src/service/security/discord-service');
const { authRateLimit } = require('../../src/middleware/rate-limit-middleware');

const { setAuthCookies } = WebService;

const GENERIC_SENT = 'If an account exists for that email, a message is on its way.';
const UNAVAILABLE = 'This feature needs email to be configured on the server.';

const emailFrom = (req) => (req.body && typeof req.body.email === 'string' ? req.body.email.trim() : '');
const tokenFrom = (req) => (req.body && typeof req.body.token === 'string' ? req.body.token : '');

// Replies right away and sends in the background so response time does not
// reveal whether the address belongs to an account.
const sendInBackground = (task) => {
    task().catch(error => LoggerService.log('error', `Recovery mail failed: ${error.message}`));
};

router.get('/neodyme/api/auth/features', (req, res) => {
    return WebResponse.ok(res, {
        passwordReset: RecoveryService.resetAvailable(),
        magicLink: RecoveryService.magicLinkAvailable(),
        emailVerification: RecoveryService.verificationRequired(),
        banAppeals: RecoveryService.appealsAvailable(),
        discord: DiscordService.enabled()
    });
});

router.post('/neodyme/api/auth/forgot-password', authRateLimit(), (req, res) => {
    if (!RecoveryService.resetAvailable()) return WebResponse.fail(res, 'FEATURE_UNAVAILABLE', UNAVAILABLE);

    const email = emailFrom(req);
    if (!email) return WebResponse.badRequest(res, 'Email is required.');

    sendInBackground(() => RecoveryService.requestPasswordReset(email));
    return WebResponse.ok(res, { message: GENERIC_SENT });
});

router.post('/neodyme/api/auth/reset-password', authRateLimit(), async (req, res) => {
    try {
        const token = tokenFrom(req);
        const password = req.body && req.body.password;
        if (!token || !password) return WebResponse.badRequest(res, 'Token and new password are required.');

        const result = await RecoveryService.completePasswordReset(token, password);
        if (!result.success) return WebResponse.badRequest(res, result.message);

        return WebResponse.ok(res, { message: 'Password updated. You can now sign in.' });
    } catch (error) {
        return WebResponse.serverError(res, 'reset password', error);
    }
});

router.post('/neodyme/api/auth/resend-verification', authRateLimit(), (req, res) => {
    if (!RecoveryService.verificationRequired()) return WebResponse.fail(res, 'FEATURE_UNAVAILABLE', UNAVAILABLE);

    const email = emailFrom(req);
    if (!email) return WebResponse.badRequest(res, 'Email is required.');

    sendInBackground(() => RecoveryService.requestVerification(email));
    return WebResponse.ok(res, { message: GENERIC_SENT });
});

router.post('/neodyme/api/auth/verify-email', authRateLimit(), async (req, res) => {
    try {
        const token = tokenFrom(req);
        if (!token) return WebResponse.badRequest(res, 'Token is required.');

        const account = await RecoveryService.confirmVerification(token);
        if (!account) return WebResponse.badRequest(res, 'This verification link is invalid or has expired.');

        return WebResponse.ok(res, { message: 'Email verified. You can now sign in.' });
    } catch (error) {
        return WebResponse.serverError(res, 'verify email', error);
    }
});

router.post('/neodyme/api/auth/appeal', authRateLimit(), (req, res) => {
    if (!RecoveryService.appealsAvailable()) return WebResponse.fail(res, 'FEATURE_UNAVAILABLE', 'Ban appeals are not enabled on this server.');

    const email = emailFrom(req);
    const message = req.body && typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!email) return WebResponse.badRequest(res, 'Email is required.');
    if (message.length < 10 || message.length > 1000) return WebResponse.badRequest(res, 'Your message must be between 10 and 1000 characters.');

    sendInBackground(() => RecoveryService.submitAppeal(email, message));
    return WebResponse.ok(res, { message: 'If this account is banned, your appeal has been sent to the moderators.' });
});

router.post('/neodyme/api/auth/magic-link', authRateLimit(), (req, res) => {
    if (!RecoveryService.magicLinkAvailable()) return WebResponse.fail(res, 'FEATURE_UNAVAILABLE', UNAVAILABLE);

    const email = emailFrom(req);
    if (!email) return WebResponse.badRequest(res, 'Email is required.');

    sendInBackground(() => RecoveryService.requestMagicLink(email));
    return WebResponse.ok(res, { message: GENERIC_SENT });
});

router.post('/neodyme/api/auth/magic-login', authRateLimit(), async (req, res) => {
    try {
        const token = tokenFrom(req);
        if (!token) return WebResponse.badRequest(res, 'Token is required.');

        const result = await RecoveryService.consumeMagicLink(token);
        if (result.error) {
            return result.forbidden
                ? WebResponse.forbidden(res, result.error)
                : WebResponse.badRequest(res, result.error);
        }

        const { account } = result;

        if (account.tfaEnabled) {
            const challenge = await TwoFactorService.startLogin(account);
            return WebResponse.ok(res, { mfaRequired: true, mfaToken: challenge.token, methods: challenge.methods });
        }

        const tokens = await WebTokenService.generateTokenPair(account.accountId, 'fortnite', account.displayName);
        setAuthCookies(res, tokens.access_token, false);

        return WebResponse.ok(res, {
            message: 'Login successful.',
            user: { accountId: account.accountId, displayName: account.displayName, email: account.email }
        });
    } catch (error) {
        return WebResponse.serverError(res, 'magic login', error);
    }
});

module.exports = router;
