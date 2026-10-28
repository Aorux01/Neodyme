const LoggerService = require('../logger/logger-service');

const TIMEOUTS = { health: 5000, functional: 30000 };

class TestRegistry {
    static checks = new Map();
    static healthCache = new Map();
    static functionalRunning = false;

    static register(definition) {
        if (!definition || !definition.id || typeof definition.run !== 'function') {
            throw new Error('A check needs an id and a run() function');
        }
        this.checks.set(definition.id, {
            kind: 'health',
            group: 'general',
            title: definition.id,
            ...definition
        });
    }

    static unregister(id) {
        this.checks.delete(id);
        this.healthCache.delete(id);
    }

    static list({ kind, group } = {}) {
        return [...this.checks.values()].filter(c =>
            (!kind || c.kind === kind) && (!group || c.group === group)
        );
    }

    static groups() {
        const groups = new Map();
        for (const check of this.checks.values()) {
            const entry = groups.get(check.group) || { name: check.group, health: 0, functional: 0 };
            entry[check.kind]++;
            groups.set(check.group, entry);
        }
        return [...groups.values()];
    }

    static summarize(results) {
        const count = status => results.filter(r => r.status === status).length;
        return {
            total: results.length,
            passing: count('ok'),
            degraded: count('degraded'),
            failing: count('error'),
            disabled: count('disabled')
        };
    }

    static withTimeout(promise, ms, id) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    static async runCheck(check, context = {}) {
        const started = performance.now();
        let outcome;

        try {
            const value = await this.withTimeout(
                Promise.resolve(check.run(context)),
                check.timeoutMs || TIMEOUTS[check.kind],
                check.id
            );
            outcome = { status: (value && value.status) || 'ok', message: (value && value.message) || 'OK' };
        } catch (error) {
            outcome = { status: 'error', message: error.message };
        }

        return {
            id: check.id,
            name: check.title,
            group: check.group,
            kind: check.kind,
            status: outcome.status,
            message: outcome.message,
            ms: Math.round(performance.now() - started)
        };
    }

    static async runHealth({ group, maxAgeMs = 0 } = {}) {
        const checks = this.list({ kind: 'health', group });
        const now = Date.now();

        return Promise.all(checks.map(async check => {
            const cached = this.healthCache.get(check.id);
            if (maxAgeMs > 0 && cached && now - cached.at < maxAgeMs) {
                return cached.result;
            }
            const result = await this.runCheck(check);
            this.healthCache.set(check.id, { at: Date.now(), result });
            return result;
        }));
    }

    static async runFunctional({ group, ids } = {}) {
        if (this.functionalRunning) {
            throw new Error('A functional test run is already in progress');
        }

        const TestFixtures = require('./test-fixtures');
        let checks = this.list({ kind: 'functional', group });
        if (ids) checks = checks.filter(c => ids.includes(c.id));

        this.functionalRunning = true;
        const results = [];

        try {
            await TestFixtures.purgeStale();

            for (const check of checks) {
                const fixtures = new TestFixtures();
                const result = await this.runCheck(check, fixtures);

                const cleanupErrors = await fixtures.runCleanups();
                if (cleanupErrors.length > 0) {
                    LoggerService.log('warn', `Test cleanup failed for ${check.id}: ${cleanupErrors.join('; ')}`);
                    if (result.status === 'ok') result.status = 'degraded';
                    result.message += ` (cleanup failed: ${cleanupErrors.join('; ')})`;
                }

                results.push(result);
            }
        } finally {
            this.functionalRunning = false;
        }

        return results;
    }

    static async run({ group, includeFunctional = false } = {}) {
        const results = await this.runHealth({ group });
        const hasHealth = results.length > 0;

        if (includeFunctional || !hasHealth) {
            results.push(...await this.runFunctional({ group }));
        }

        return results;
    }

    static loadBuiltInChecks() {
        require('./checks/health');
        require('./checks/core');
        require('./checks/auth');
        require('./checks/recovery');
        require('./checks/security');
        require('./checks/permissions');
        require('./checks/staff');
        require('./checks/oauth');
        require('./checks/web');
    }
}

module.exports = TestRegistry;
