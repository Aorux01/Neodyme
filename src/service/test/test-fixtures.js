const crypto = require('crypto');
const DatabaseManager = require('../../manager/database-manager');
const TokenService = require('../token/token-service');
const OneTimeTokenService = require('../token/one-time-token-service');
const LoggerService = require('../logger/logger-service');

const TEST_EMAIL_DOMAIN = 'neodyme-test.invalid';

class TestFixtures {
    constructor() {
        this.cleanups = [];
    }

    static isTestAccount(account) {
        return !!account && typeof account.email === 'string' && account.email.endsWith(`@${TEST_EMAIL_DOMAIN}`);
    }

    static async purgeStale() {
        const accounts = await DatabaseManager.getAllAccounts();
        for (const account of accounts.filter(a => this.isTestAccount(a))) {
            await this.removeAccount(account.accountId);
            LoggerService.log('warn', `Removed leftover test account ${account.displayName}`);
        }
    }

    static async removeAccount(accountId) {
        await TokenService.removeAllTokensForAccount(accountId).catch(() => {});
        await DatabaseManager.removeFromWhitelist(accountId).catch(() => {});
        OneTimeTokenService.revokeFor(accountId);
        await DatabaseManager.deleteAccount(accountId);
    }

    onCleanup(fn) {
        this.cleanups.push(fn);
    }

    async runCleanups() {
        const errors = [];
        for (const fn of this.cleanups.reverse()) {
            try {
                await fn();
            } catch (error) {
                errors.push(error.message);
            }
        }
        this.cleanups = [];
        return errors;
    }

    // Goes through the database instance directly so no welcome email is sent.
    async createAccount() {
        const suffix = crypto.randomBytes(5).toString('hex');
        const email = `t-${suffix}@${TEST_EMAIL_DOMAIN}`;
        const displayName = `__test_${suffix}`;
        const password = `Tt!${crypto.randomBytes(6).toString('hex')}Aa1`;

        const account = await DatabaseManager.getDatabaseInstance().createAccount(email, password, displayName);
        this.onCleanup(() => TestFixtures.removeAccount(account.accountId));

        return { account, email, displayName, password };
    }
}

TestFixtures.TEST_EMAIL_DOMAIN = TEST_EMAIL_DOMAIN;

module.exports = TestFixtures;
