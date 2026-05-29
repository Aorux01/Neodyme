const LoggerService = require('../logger/logger-service');

// Unified response shape for every /neodyme/api/* route.
//
// Game routes keep the Epic-style errors-system; the website speaks a single,
// predictable shape so the frontend can handle one format everywhere:
//   success: { success: true, ...data }
//   failure: { success: false, error: 'MACHINE_CODE', message: 'human text' }
//
// `error` is a stable machine code the frontend can switch on; `message` is the
// human-readable text (safe to display, translatable later).

const ERROR_STATUS = {
    BAD_REQUEST: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    SERVER_ERROR: 500,
};

const DEFAULT_MESSAGE = {
    BAD_REQUEST: 'Invalid request.',
    UNAUTHENTICATED: 'You must be signed in.',
    FORBIDDEN: 'You do not have permission to do that.',
    NOT_FOUND: 'Resource not found.',
    CONFLICT: 'This action conflicts with the current state.',
    RATE_LIMITED: 'Too many requests. Please slow down.',
    SERVER_ERROR: 'An unexpected error occurred.',
};

const ok = (res, data = {}, status = 200) =>
    res.status(status).json({ success: true, ...data });

const fail = (res, code, message) => {
    const status = ERROR_STATUS[code] || 400;
    return res.status(status).json({
        success: false,
        error: code,
        message: message || DEFAULT_MESSAGE[code] || 'Request failed.',
    });
};

// Named helpers - clearer at call sites than fail(res, 'CODE').
const badRequest    = (res, message) => fail(res, 'BAD_REQUEST', message);
const unauthorized  = (res, message) => fail(res, 'UNAUTHENTICATED', message);
const forbidden     = (res, message) => fail(res, 'FORBIDDEN', message);
const notFound      = (res, message) => fail(res, 'NOT_FOUND', message);
const conflict      = (res, message) => fail(res, 'CONFLICT', message);
const rateLimited   = (res, message) => fail(res, 'RATE_LIMITED', message);

// Logs the real error server-side, returns a generic message to the client.
const serverError = (res, context, err) => {
    if (err) LoggerService.log('error', `${context}: ${err.message || err}`);
    return fail(res, 'SERVER_ERROR');
};

module.exports = {
    ok,
    fail,
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    rateLimited,
    serverError,
    ERROR_STATUS,
};
