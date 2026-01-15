const crypto = require('crypto');
const LoggerService = require('../service/logger/LoggerService');

class CsrfService {
    static tokens = new Map();
    static TOKEN_EXPIRY = 3600000;

    static generateToken(sessionId) {
        const token = crypto.randomBytes(32).toString('hex');
        this.tokens.set(token, {
            sessionId,
            createdAt: Date.now()
        });
        return token;
    }

    static validateToken(token, sessionId) {
        const data = this.tokens.get(token);
        if (!data) return false;

        if (Date.now() - data.createdAt > this.TOKEN_EXPIRY) {
            this.tokens.delete(token);
            return false;
        }

        if (data.sessionId !== sessionId) return false;

        this.tokens.delete(token);
        return true;
    }

    static cleanup() {
        const now = Date.now();
        for (const [token, data] of this.tokens) {
            if (now - data.createdAt > this.TOKEN_EXPIRY) {
                this.tokens.delete(token);
            }
        }
    }
}

setInterval(() => CsrfService.cleanup(), 3600000);

function csrfProtection(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const sessionId = req.cookies?.neodyme_session || req.headers['x-session-id'];
    const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;

    if (!sessionId || !csrfToken) {
        return res.status(403).json({
            success: false,
            error: 'CSRF validation failed',
            message: 'Missing security token'
        });
    }

    if (!CsrfService.validateToken(csrfToken, sessionId)) {
        return res.status(403).json({
            success: false,
            error: 'CSRF validation failed',
            message: 'Invalid or expired security token'
        });
    }

    next();
}

function generateCsrfToken(req, res) {
    let sessionId = req.cookies?.neodyme_session;

    if (!sessionId) {
        sessionId = crypto.randomBytes(16).toString('hex');
        res.cookie('neodyme_session', sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 86400000
        });
    }

    const csrfToken = CsrfService.generateToken(sessionId);

    res.json({
        success: true,
        csrfToken: csrfToken
    });
}

module.exports = {
    csrfProtection,
    generateCsrfToken,
    CsrfService
};
