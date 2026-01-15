const rateLimit = require('express-rate-limit');
const ConfigManager = require('./ConfigManager');
const LoggerService = require('../service/logger/LoggerService');

class RateLimitManager {
    static limiters = {
        global: null,
        auth: null,
        expensive: null
    };

    static isEnabled = false;

    static async initialize() {
        this.isEnabled = ConfigManager.get('rateLimiting', true);

        if (!this.isEnabled) {
            LoggerService.log('warn', 'Rate limiting is disabled in configuration');
            return;
        }

        try {
            this.createLimiters();
            LoggerService.log('success', 'Rate limiting system initialized successfully');
        } catch (error) {
            LoggerService.log('error', `Failed to initialize rate limiting: ${error.message}`);
            throw error;
        }
    }

    static createLimiters() {
        const trustProxy = ConfigManager.get('trustProxy', true);

        // Global Rate Limiter - Applied to all requests
        const globalMaxRequests = ConfigManager.get('maxRequestsPerMinute', 100);
        const globalWindowMinutes = ConfigManager.get('rateLimitWindowMinutes', 1);

        this.limiters.global = rateLimit({
            windowMs: globalWindowMinutes * 60 * 1000,
            max: globalMaxRequests,
            message: {
                errorCode: 'errors.com.epicgames.common.throttled',
                errorMessage: `Too many requests from this IP. Please try again later.`,
                messageVars: [globalMaxRequests.toString(), `${globalWindowMinutes} minute(s)`],
                numericErrorCode: 1041,
                originatingService: 'neodyme',
                intent: 'prod'
            },
            standardHeaders: true,
            legacyHeaders: false,
            trustProxy: trustProxy,
            handler: (req, res) => {
                const clientIp = this.getClientIp(req);
                LoggerService.log('warn', `Global rate limit exceeded for IP: ${clientIp} on ${req.method} ${req.path}`);

                res.status(429).json({
                    errorCode: 'errors.com.epicgames.common.throttled',
                    errorMessage: `Too many requests from this IP. Please try again later.`,
                    messageVars: [globalMaxRequests.toString(), `${globalWindowMinutes} minute(s)`],
                    numericErrorCode: 1041,
                    originatingService: 'neodyme',
                    intent: 'prod'
                });
            },
            keyGenerator: (req) => {
                return this.getClientIp(req);
            }
        });

        // Authentication Rate Limiter - Applied to login/register endpoints
        const authMaxAttempts = ConfigManager.get('authMaxAttempts', 5);
        const authWindowMinutes = ConfigManager.get('authWindowMinutes', 15);

        this.limiters.auth = rateLimit({
            windowMs: authWindowMinutes * 60 * 1000,
            max: authMaxAttempts,
            message: {
                errorCode: 'errors.com.epicgames.common.throttled',
                errorMessage: `Too many authentication attempts. Please try again in ${authWindowMinutes} minutes.`,
                messageVars: [authMaxAttempts.toString(), `${authWindowMinutes} minute(s)`],
                numericErrorCode: 1041,
                originatingService: 'neodyme',
                intent: 'prod'
            },
            standardHeaders: true,
            legacyHeaders: false,
            trustProxy: trustProxy,
            skipSuccessfulRequests: ConfigManager.get('authSkipSuccessfulRequests', false),
            handler: (req, res) => {
                const clientIp = this.getClientIp(req);
                LoggerService.log('warn', `Authentication rate limit exceeded for IP: ${clientIp} on ${req.method} ${req.path}`);

                res.status(429).json({
                    errorCode: 'errors.com.epicgames.account.auth_token.invalid_grant',
                    errorMessage: `Too many authentication attempts. Please try again in ${authWindowMinutes} minutes.`,
                    messageVars: [authMaxAttempts.toString(), `${authWindowMinutes} minute(s)`],
                    numericErrorCode: 18031,
                    originatingService: 'neodyme',
                    intent: 'prod'
                });
            },
            keyGenerator: (req) => {
                return this.getClientIp(req);
            }
        });

        // Expensive Operations Rate Limiter - Applied to purchases, matchmaking, etc.
        const expensiveMaxRequests = ConfigManager.get('expensiveMaxRequests', 10);
        const expensiveWindowMinutes = ConfigManager.get('expensiveWindowMinutes', 5);

        this.limiters.expensive = rateLimit({
            windowMs: expensiveWindowMinutes * 60 * 1000,
            max: expensiveMaxRequests,
            message: {
                errorCode: 'errors.com.epicgames.common.throttled',
                errorMessage: `Too many requests to this resource. Please slow down.`,
                messageVars: [expensiveMaxRequests.toString(), `${expensiveWindowMinutes} minute(s)`],
                numericErrorCode: 1041,
                originatingService: 'neodyme',
                intent: 'prod'
            },
            standardHeaders: true,
            legacyHeaders: false,
            trustProxy: trustProxy,
            handler: (req, res) => {
                const clientIp = this.getClientIp(req);
                const userId = req.user?.accountId || 'anonymous';
                LoggerService.log('warn', `Expensive operation rate limit exceeded for IP: ${clientIp}, User: ${userId} on ${req.method} ${req.path}`);

                res.status(429).json({
                    errorCode: 'errors.com.epicgames.common.throttled',
                    errorMessage: `Too many requests to this resource. Please slow down.`,
                    messageVars: [expensiveMaxRequests.toString(), `${expensiveWindowMinutes} minute(s)`],
                    numericErrorCode: 1041,
                    originatingService: 'neodyme',
                    intent: 'prod'
                });
            },
            keyGenerator: (req) => {
                // Use accountId if authenticated, otherwise use IP
                if (req.user && req.user.accountId) {
                    return `user:${req.user.accountId}`;
                }
                return `ip:${this.getClientIp(req)}`;
            }
        });

        LoggerService.log('info', `Rate limiters configured:`);
        LoggerService.log('info', `  - Global: ${globalMaxRequests} requests per ${globalWindowMinutes} minute(s)`);
        LoggerService.log('info', `  - Authentication: ${authMaxAttempts} attempts per ${authWindowMinutes} minute(s)`);
        LoggerService.log('info', `  - Expensive Operations: ${expensiveMaxRequests} requests per ${expensiveWindowMinutes} minute(s)`);
    }

    static getGlobalLimiter() {
        if (!this.isEnabled) {
            return (req, res, next) => next();
        }
        return this.limiters.global;
    }

    static getAuthLimiter() {
        if (!this.isEnabled) {
            return (req, res, next) => next();
        }
        return this.limiters.auth;
    }

    static getExpensiveLimiter() {
        if (!this.isEnabled) {
            return (req, res, next) => next();
        }
        return this.limiters.expensive;
    }

    static getClientIp(req) {
        const trustProxy = ConfigManager.get('trustProxy', true);

        if (trustProxy) {
            // If behind a proxy, get the real IP from headers
            const forwarded = req.headers['x-forwarded-for'];
            if (forwarded) {
                return forwarded.split(',')[0].trim();
            }

            const realIp = req.headers['x-real-ip'];
            if (realIp) {
                return realIp;
            }
        }

        // Fallback to connection remote address
        return req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.connection?.socket?.remoteAddress ||
               'unknown';
    }

    static getStatus() {
        return {
            enabled: this.isEnabled,
            limiters: {
                global: {
                    enabled: this.limiters.global !== null,
                    maxRequests: ConfigManager.get('maxRequestsPerMinute', 100),
                    windowMinutes: ConfigManager.get('rateLimitWindowMinutes', 1)
                },
                auth: {
                    enabled: this.limiters.auth !== null,
                    maxAttempts: ConfigManager.get('authMaxAttempts', 5),
                    windowMinutes: ConfigManager.get('authWindowMinutes', 15)
                },
                expensive: {
                    enabled: this.limiters.expensive !== null,
                    maxRequests: ConfigManager.get('expensiveMaxRequests', 10),
                    windowMinutes: ConfigManager.get('expensiveWindowMinutes', 5)
                }
            }
        };
    }
}

module.exports = RateLimitManager;
