const SENSITIVE_KEYS = new Set([
    'password', 'newpassword', 'currentpassword', 'access_token', 'refresh_token',
    'exchange_code', 'token', 'secret', 'authorization', 'cookie', 'set-cookie',
    'x-csrf-token', 'code', 'otp'
]);

const MASK = '[redacted]';

function redact(value, depth = 0) {
    if (value === null || value === undefined || depth > 6) return value;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return JSON.stringify(redact(JSON.parse(trimmed), depth + 1));
            } catch (_) {}
        }
        return value;
    }

    if (Buffer.isBuffer(value)) return `[buffer ${value.length}b]`;
    if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));

    if (typeof value === 'object') {
        const out = {};
        for (const [key, val] of Object.entries(value)) {
            out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? MASK : redact(val, depth + 1);
        }
        return out;
    }

    return value;
}

module.exports = { redact };
