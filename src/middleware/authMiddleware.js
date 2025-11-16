const TokenService = require('../service/token/TokenService');
const DatabaseManager = require('../manager/DatabaseManager');
const { Errors } = require('../service/error/Errors');
const LoggerService = require('../service/logger/LoggerService');

async function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer eg1~')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);

        if (!TokenService.isValidAccessToken(token)) {
            throw Errors.Authentication.invalidToken(token);
        }

        const decoded = TokenService.verifyToken(token);
        if (!decoded) {
            throw Errors.Authentication.validationFailed(token);
        }

        const account = await DatabaseManager.getAccount(decoded.sub);
        if (!account) {
            TokenService.removeToken(token);
            throw Errors.Account.accountNotFound(decoded.sub);
        }

        const banInfo = await DatabaseManager.getBanInfo(account.accountId);
        if (banInfo.banned) {
            const now = new Date();
            if (banInfo.banExpires && new Date(banInfo.banExpires) > now) {
                throw Errors.Account.disabledAccount();
            } else if (!banInfo.banExpires) {
                throw Errors.Account.disabledAccount();
            } else {
                await DatabaseManager.unbanAccount(account.accountId);
            }
        }

        await DatabaseManager.updateLastLogin(account.accountId);

        req.user = account;
        req.token = decoded;

        next();
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        
        LoggerService.log('error', `Token verification failed: ${error.message}`);
        const err = Errors.Authentication.authenticationFailed('token');
        return res.status(err.statusCode).json(err.toJSON());
    }
}

async function verifyClient(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer eg1~')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);

        const isAccessToken = TokenService.isValidAccessToken(token);
        const isClientToken = TokenService.isValidClientToken(token);

        if (!isAccessToken && !isClientToken) {
            throw Errors.Authentication.invalidToken(token);
        }

        const decoded = TokenService.verifyToken(token);
        if (!decoded) {
            throw Errors.Authentication.validationFailed(token);
        }

        if (isAccessToken) {
            const account = await DatabaseManager.getAccount(decoded.sub);
            if (!account) {
                TokenService.removeToken(token);
                throw Errors.Account.accountNotFound(decoded.sub);
            }

            const banInfo = await DatabaseManager.getBanInfo(account.accountId);
            if (banInfo.banned) {
                const now = new Date();
                if (banInfo.banExpires && new Date(banInfo.banExpires) > now) {
                    throw Errors.Account.disabledAccount();
                } else if (!banInfo.banExpires) {
                    throw Errors.Account.disabledAccount();
                } else {
                    await DatabaseManager.unbanAccount(account.accountId);
                }
            }

            await DatabaseManager.updateLastLogin(account.accountId);
            req.user = account;
        }

        req.token = decoded;
        req.isClientToken = isClientToken;

        next();
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        
        LoggerService.log('error', `Client verification failed: ${error.message}`);
        const err = Errors.Authentication.authenticationFailed('client');
        return res.status(err.statusCode).json(err.toJSON());
    }
}

module.exports = {
    verifyToken,
    verifyClient
};