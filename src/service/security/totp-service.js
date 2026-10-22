const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

class TotpService {
    static base32Encode(buffer) {
        let bits = 0;
        let value = 0;
        let output = '';

        for (const byte of buffer) {
            value = (value << 8) | byte;
            bits += 8;
            while (bits >= 5) {
                output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
                bits -= 5;
            }
        }
        if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

        return output;
    }

    static base32Decode(text) {
        const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
        let bits = 0;
        let value = 0;
        const bytes = [];

        for (const char of clean) {
            const index = BASE32_ALPHABET.indexOf(char);
            if (index === -1) throw new Error('Invalid base32 secret');
            value = (value << 5) | index;
            bits += 5;
            if (bits >= 8) {
                bytes.push((value >>> (bits - 8)) & 255);
                bits -= 8;
            }
        }

        return Buffer.from(bytes);
    }

    static generateSecret() {
        return this.base32Encode(crypto.randomBytes(20));
    }

    static counterAt(timeMs) {
        return Math.floor(timeMs / 1000 / STEP_SECONDS);
    }

    static hotp(secret, counter, digits = DIGITS) {
        const key = Buffer.isBuffer(secret) ? secret : this.base32Decode(secret);
        const message = Buffer.alloc(8);
        message.writeBigUInt64BE(BigInt(counter));

        const hmac = crypto.createHmac('sha1', key).update(message).digest();
        const offset = hmac[hmac.length - 1] & 0x0f;
        const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];

        return String(binary % 10 ** digits).padStart(digits, '0');
    }

    static generate(secret, timeMs = Date.now()) {
        return this.hotp(secret, this.counterAt(timeMs));
    }

    // Accepts the current step and its neighbours to tolerate clock drift. Returns
    // the matching step, or null. Steps at or below lastStep are refused so a code
    // cannot be replayed.
    static verify(secret, code, { timeMs = Date.now(), window = 1, lastStep = 0 } = {}) {
        const submitted = String(code || '').replace(/\s/g, '');
        if (!/^\d{6}$/.test(submitted)) return null;

        const current = this.counterAt(timeMs);
        let matched = null;

        for (let step = current - window; step <= current + window; step++) {
            const expected = this.hotp(secret, step);
            const equal = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(submitted));
            if (equal && step > lastStep && (matched === null || step > matched)) matched = step;
        }

        return matched;
    }

    static otpauthUri({ secret, account, issuer }) {
        const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
        const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
        return `otpauth://totp/${label}?${params.toString()}`;
    }
}

module.exports = TotpService;
