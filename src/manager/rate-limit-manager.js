const rateLimit = require('express-rate-limit');
const ConfigManager = require('./config-manager');
const LoggerService = require('../service/logger/logger-service');

class RateLimitManager {
    static limiters = {
        global: null,
        auth: null,
        expensive: null,
        web: null
    };

    static isEnabled = false;

    // Instead of logging one warning per blocked request (which floods the console when a
    // client hammers a 429), we aggregate hits per (type|key|method|path) and flush a single
    // condensed line after a short window of silence.
    static hitBuckets = new Map();          // bucketKey -> { type, key, method, path, count, firstAt, lastAt, timer }

    static getFlushDelayMs() {
        // Configurable via server.properties (seconds). Default 5s. 0 disables condensing
        // (back to one log line per hit).
        const sec = ConfigManager.get('rateLimitLogCondenseSeconds', 5);
        return Math.max(0, Number(sec) || 0) * 1000;
    }

    static recordHit(type, key, method, path) {
        const delay = this.getFlushDelayMs();

        // Condensing disabled -> log immediately, one line per hit.
        if (delay === 0) {
            LoggerService.log('warn', `rate-limit (${type}) hit for ${key} on ${method} ${path}`);
            return;
        }

        const bucketKey = `${type}|${key}|${method}|${path}`;
        let bucket = this.hitBuckets.get(bucketKey);

        if (!bucket) {
            bucket = { type, key, method, path, count: 0, firstAt: Date.now(), lastAt: Date.now(), timer: null };
            this.hitBuckets.set(bucketKey, bucket);
        }

        bucket.count++;
        bucket.lastAt = Date.now();

        // Reset the debounce timer: flush only once the burst stops.
        if (bucket.timer) clearTimeout(bucket.timer);
        bucket.timer = setTimeout(() => this.flushBucket(bucketKey), delay);
        // Don't let the timer keep the process alive on shutdown.
        if (bucket.timer.unref) bucket.timer.unref();
    }

    static flushBucket(bucketKey) {
        const bucket = this.hitBuckets.get(bucketKey);
        if (!bucket) return;
        this.hitBuckets.delete(bucketKey);

        const windowSec = Math.max(1, Math.round((bucket.lastAt - bucket.firstAt) / 1000));
        const times = bucket.count === 1 ? '' : ` ×${bucket.count}`;
        LoggerService.log('warn',
            `rate-limit (${bucket.type}) hit${times} for ${bucket.key} on ${bucket.method} ${bucket.path}` +
            (bucket.count > 1 ? ` (within ${windowSec}s)` : '')
        );
    }

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
            // Website routes have their own per-user limiter; don't double-count them
            // against the global IP quota (that was throttling busy panels).
            skip: (req) => req.path.startsWith('/neodyme/api/'),
            handler: (req, res) => {
                const clientIp = this.getClientIp(req);
                this.recordHit('global', `IP ${clientIp}`, req.method, req.path);

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
                this.recordHit('auth', `IP ${clientIp}`, req.method, req.path);

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
                const who = userId !== 'anonymous' ? `user ${userId} (IP ${clientIp})` : `IP ${clientIp}`;
                this.recordHit('expensive', who, req.method, req.path);

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

        // Website Rate Limiter - Applied to /neodyme/api/* routes.
        // Keyed by accountId when authenticated (so one user behind a busy NAT can't be
        // throttled by another's traffic) and falls back to IP otherwise. The quota is
        // generous because legitimate panels fire many calls in quick bursts; abuse-sensitive
        // routes (auth, purchases) keep their own dedicated limiters on top of this one.
        const webMaxRequests = ConfigManager.get('webMaxRequests', 600);
        const webWindowMinutes = ConfigManager.get('webWindowMinutes', 1);

        this.limiters.web = rateLimit({
            windowMs: webWindowMinutes * 60 * 1000,
            max: webMaxRequests,
            standardHeaders: true,
            legacyHeaders: false,
            trustProxy: trustProxy,
            handler: (req, res) => {
                const clientIp = this.getClientIp(req);
                const userId = req.user?.accountId;
                const who = userId ? `user ${userId} (IP ${clientIp})` : `IP ${clientIp}`;
                this.recordHit('web', who, req.method, req.path);

                res.status(429).json({
                    success: false,
                    error: 'RATE_LIMITED',
                    message: 'Too many requests. Please slow down.'
                });
            },
            keyGenerator: (req) => {
                if (req.user && req.user.accountId) {
                    return `web-user:${req.user.accountId}`;
                }
                return `web-ip:${this.getClientIp(req)}`;
            }
        });

        LoggerService.log('info', `Rate limiters configured:`);
        LoggerService.log('info', `  - Global: ${globalMaxRequests} requests per ${globalWindowMinutes} minute(s)`);
        LoggerService.log('info', `  - Authentication: ${authMaxAttempts} attempts per ${authWindowMinutes} minute(s)`);
        LoggerService.log('info', `  - Expensive Operations: ${expensiveMaxRequests} requests per ${expensiveWindowMinutes} minute(s)`);
        LoggerService.log('info', `  - Website: ${webMaxRequests} requests per ${webWindowMinutes} minute(s) (per user)`);
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

    static getWebLimiter() {
        if (!this.isEnabled) {
            return (req, res, next) => next();
        }
        return this.limiters.web;
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
