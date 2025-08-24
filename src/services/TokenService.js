const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Errors } = require('../errors/errors');

class TokenService {
    constructor() {
        this.JWT_SECRET = process.env.JWT_SECRET || 'neodyme-secret-key-change-in-production';
        this.ACCESS_TOKEN_EXPIRY = '24h';
        this.REFRESH_TOKEN_EXPIRY = '30d';
    }

    /**
     * Generate an access token for a user
     */
    generateAccessToken(user, expiresIn = this.ACCESS_TOKEN_EXPIRY) {
        const payload = {
            accountId: user.accountId,
            email: user.email,
            displayName: user.displayName,
            type: 'access'
        };

        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn,
            issuer: 'Neodyme',
            audience: 'fortnite'
        });
    }

    /**
     * Generate a refresh token for a user
     */
    generateRefreshToken(user) {
        const payload = {
            accountId: user.accountId,
            type: 'refresh'
        };

        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.REFRESH_TOKEN_EXPIRY,
            issuer: 'Neodyme',
            audience: 'fortnite'
        });
    }

    /**
     * Generate both access and refresh tokens
     */
    generateTokenPair(user, rememberMe = false) {
        const accessTokenExpiry = rememberMe ? '7d' : this.ACCESS_TOKEN_EXPIRY;
        
        return {
            accessToken: this.generateAccessToken(user, accessTokenExpiry),
            refreshToken: this.generateRefreshToken(user),
            expiresIn: rememberMe ? 604800 : 86400 // seconds
        };
    }

    /**
     * Verify and decode a token
     */
    verifyToken(token) {
        try {
            if (!token || token.split('.').length !== 3) {
                throw new Error('Invalid token format');
            }

            const decoded = jwt.verify(token, this.JWT_SECRET, {
                issuer: 'Neodyme',
                audience: 'fortnite'
            });
            
            return decoded;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw Errors.Authentication.tokenExpired();
            } else if (error.name === 'JsonWebTokenError') {
                throw Errors.Authentication.invalidToken(token);
            } else {
                throw Errors.Authentication.validationFailed(token);
            }
        }
    }

    /**
     * Extract token from Authorization header
     */
    extractTokenFromHeader(authHeader) {
        if (!authHeader) {
            throw Errors.Authentication.missingToken();
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
            throw Errors.Authentication.invalidHeader();
        }

        return parts[1];
    }

    /**
     * Generate an exchange code for OAuth flows
     */
    generateExchangeCode(accountId) {
        const payload = {
            accountId,
            type: 'exchange',
            nonce: crypto.randomBytes(16).toString('hex')
        };

        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: '5m', // Exchange codes expire quickly
            issuer: 'Neodyme',
            audience: 'fortnite'
        });
    }

    /**
     * Validate and decode an exchange code
     */
    validateExchangeCode(exchangeCode) {
        try {
            const decoded = jwt.verify(exchangeCode, this.JWT_SECRET, {
                issuer: 'Neodyme',
                audience: 'fortnite'
            });

            if (decoded.type !== 'exchange') {
                throw Errors.Authentication.OAuth.invalidExchange(exchangeCode);
            }

            return decoded;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw Errors.Authentication.OAuth.expiredExchangeCodeSession();
            }
            throw Errors.Authentication.OAuth.invalidExchange(exchangeCode);
        }
    }

    /**
     * Generate a client credentials token
     */
    generateClientToken(clientId) {
        const payload = {
            clientId,
            type: 'client_credentials'
        };

        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: '1h',
            issuer: 'Neodyme',
            audience: 'fortnite'
        });
    }

    /**
     * Middleware factory for token verification
     */
    createVerificationMiddleware() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers['authorization'];
                const token = this.extractTokenFromHeader(authHeader);
                const decoded = this.verifyToken(token);

                // Add user info to request
                req.user = decoded;
                req.token = token;
                
                next();
            } catch (error) {
                if (error.errorCode) {
                    return res.status(error.statusCode).json(error.toJSON());
                }
                
                const tokenError = Errors.Authentication.invalidToken('Invalid token');
                return res.status(tokenError.statusCode).json(tokenError.toJSON());
            }
        };
    }

    /**
     * Optional middleware for token verification (doesn't fail if no token)
     */
    createOptionalVerificationMiddleware() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers['authorization'];
                if (authHeader) {
                    const token = this.extractTokenFromHeader(authHeader);
                    const decoded = this.verifyToken(token);
                    req.user = decoded;
                    req.token = token;
                }
            } catch (error) {
                // Ignore token errors for optional middleware
                req.user = null;
                req.token = null;
            }
            
            next();
        };
    }

    /**
     * Get token expiration time
     */
    getTokenExpiration(token) {
        try {
            const decoded = jwt.decode(token);
            return decoded.exp ? new Date(decoded.exp * 1000) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if token is expired
     */
    isTokenExpired(token) {
        const expiration = this.getTokenExpiration(token);
        return expiration ? expiration < new Date() : true;
    }

    /**
     * Generate a device authorization code
     */
    generateDeviceCode() {
        return {
            deviceCode: crypto.randomBytes(32).toString('hex'),
            userCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
            verificationUri: 'https://www.epicgames.com/activate',
            expiresIn: 1800, // 30 minutes
            interval: 5
        };
    }

    /**
     * Create token response object
     */
    createTokenResponse(tokens, tokenType = 'bearer') {
        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_in: tokens.expiresIn,
            token_type: tokenType,
            scope: 'basic_profile friends_list presence',
            account_id: tokens.accountId || 'unknown'
        };
    }
}

// Export singleton instance
module.exports = new TokenService();