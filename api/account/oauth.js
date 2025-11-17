const router = require('express').Router();
const AuthService = require('../../src/service/api/AuthService');
const TokenService = require('../../src/service/token/TokenService');
const { Errors } = require('../../src/service/error/Errors');
const LoggerService = require('../../src/service/logger/LoggerService');

router.post('/account/api/oauth/token', async (req, res) => {
    try {
        const { grant_type, username, password, exchange_code, refresh_token } = req.body;

        if (!grant_type) {
            throw Errors.Authentication.OAuth.invalidBody();
        }

        const clientId = req.headers['authorization']?.split(' ')[1] 
            ? Buffer.from(req.headers['authorization'].split(' ')[1], 'base64').toString().split(':')[0]
            : 'ec684b8c687f479fadea3cb2ad83f5c6';

        const deviceId = req.body.device_id || TokenService.generateId();
        const ip = req.ip || req.connection.remoteAddress;

        let response;

        switch (grant_type) {
            case 'password':
                response = await AuthService.authenticateWithPassword(username, password, clientId, deviceId, ip);
                break;

            case 'exchange_code':
                throw Errors.Authentication.OAuth.grantNotImplemented('exchange_code');

            case 'refresh_token':
                response = await AuthService.refreshAccessToken(refresh_token, clientId, deviceId, ip);
                break;

            case 'client_credentials':
                response = AuthService.createClientToken(clientId, ip);
                break;

            default:
                throw Errors.Authentication.OAuth.unsupportedGrant(grant_type);
        }

        res.json(response);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        
        LoggerService.log('error', `OAuth token error: ${error.message}`);
        const err = Errors.Authentication.OAuth.invalidBody();
        return res.status(err.statusCode).json(err.toJSON());
    }
});

router.delete('/account/api/oauth/sessions/kill/:token', async (req, res) => {
    try {
        let token = req.params.token;
        if (!token.startsWith('eg1~')) {
            token = `eg1~${token}`;
        }
        AuthService.killToken(token);
        res.status(204).send();
    } catch (error) {
        LoggerService.log('error', `Failed to kill token: ${error.message}`);
        res.status(204).send();
    }
});

router.delete('/account/api/oauth/sessions/kill', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const killType = req.query.killType;

        if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
            const token = authHeader.substring(7);

            if (killType === 'OTHERS_ACCOUNT_CLIENT_SERVICE') {
                await AuthService.killOtherTokens(token);
            } else {
                AuthService.killToken(token);
            }
        }
        res.status(204).send();
    } catch (error) {
        LoggerService.log('error', `Failed to kill token: ${error.message}`);
        res.status(204).send();
    }
});

router.get('/account/api/oauth/verify', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer eg1~')) {
            throw Errors.Authentication.invalidHeader();
        }

        const token = authHeader.substring(7);
        const response = AuthService.verifyToken(token);

        res.json(response);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        
        LoggerService.log('error', `Token verification error: ${error.message}`);
        const err = Errors.Authentication.invalidToken('unknown');
        return res.status(err.statusCode).json(err.toJSON());
    }
});

module.exports = router;