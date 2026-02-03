const LoggerService = require('../logger/logger-service');
const DatabaseManager = require('../../manager/database-manager');
const TokenService = require('../token/web-token-service');
const ConfigManager = require('../../manager/config-manager');
const { Errors } = require('../error/errors-system');
const { sendError } = require('../error/errors-system');

class WebService {
    getCookieOptions = () => ({
        httpOnly: true,
        secure: ConfigManager.get('secureCookies', false),
        sameSite: 'strict',
        path: '/'
    });

    setAuthCookies = (res, token, remember = false) => {
        const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
        res.cookie('neodyme_auth', token, { ...this.getCookieOptions(), maxAge });
    };

    clearAuthCookies = (res) => {
        res.clearCookie('neodyme_auth', this.getCookieOptions());
    };
    
    verifyToken = async (req, res, next) => {
        try {
            let token = null;
    
            const authHeader = req.headers.authorization;
            if (authHeader) {
                token = TokenService.extractTokenFromHeader(authHeader);
            }
    
            if (!token && req.cookies?.neodyme_auth) {
                token = req.cookies.neodyme_auth;
            }
    
            if (!token) {
                return sendError(res, Errors.Authentication.invalidHeader());
            }
    
            const verification = await TokenService.verifyToken(token);
    
            if (!verification.valid) {
                this.clearAuthCookies(res);
                return sendError(res, Errors.Authentication.invalidToken(verification.error));
            }
    
            const accountId = verification.payload.accountId || verification.payload.account_id;
    
            if (!accountId) {
                return sendError(res, Errors.Authentication.invalidToken('missing account id'));
            }
    
            const account = await DatabaseManager.getAccount(accountId);
            if (!account) {
                this.clearAuthCookies(res);
                return sendError(res, Errors.Authentication.invalidToken('account not found'));
            }
    
            req.user = {
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email
            };
            next();
        } catch (error) {
            //LoggerService.log('error', `Token verification error: ${error}`);
            return sendError(res, Errors.Authentication.invalidToken());
        }
    }
}

module.exports = new WebService();