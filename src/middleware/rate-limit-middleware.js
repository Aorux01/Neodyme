const RateLimitManager = require('../manager/rate-limit-manager');

const globalRateLimit = () => {
    return RateLimitManager.getGlobalLimiter();
};

const authRateLimit = () => {
    return RateLimitManager.getAuthLimiter();
};

const expensiveRateLimit = () => {
    return RateLimitManager.getExpensiveLimiter();
};

module.exports = {
    globalRateLimit,
    authRateLimit,
    expensiveRateLimit
};
