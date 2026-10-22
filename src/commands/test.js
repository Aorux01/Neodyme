const colors = require('../utils/colors');
const LoggerService = require('../service/logger/logger-service');
const TestRegistry = require('../service/test/test-registry');

const TAGS = {
    ok: colors.green('[PASS]'),
    degraded: colors.yellow('[WARN]'),
    error: colors.red('[FAIL]'),
    disabled: colors.gray('[SKIP]')
};

function printUsage() {
    LoggerService.log('info', `Usage: ${colors.cyan('/test <group|all|list> [--functional]')}`);
    LoggerService.log('info', 'Health checks are read-only. Functional checks run real scenarios on throwaway accounts.');
    for (const group of TestRegistry.groups()) {
        LoggerService.log('info', `  ${colors.cyan(group.name.padEnd(10))} ${group.health} health, ${group.functional} functional`);
    }
}

function printResult(result) {
    const duration = result.status === 'disabled' ? '' : ` (${result.ms}ms)`;
    LoggerService.log('info', `  ${TAGS[result.status] || result.status} ${result.name}${duration}: ${result.message}`);
}

function register(CM) {
    TestRegistry.loadBuiltInChecks();

    CM.register('/test', async (args) => {
        const functional = args.includes('--functional');
        const target = (args.find(a => !a.startsWith('--')) || 'all').toLowerCase();

        if (target === 'list') return printUsage();

        const group = target === 'all' ? undefined : target;
        if (group && !TestRegistry.groups().some(g => g.name === group)) {
            LoggerService.log('warn', `Unknown test group: ${target}`);
            return printUsage();
        }

        let results;
        try {
            LoggerService.log('info', `Running ${group || 'all'} tests${functional ? ' (including functional)' : ''}...`);
            results = await TestRegistry.run({ group, includeFunctional: functional });
        } catch (error) {
            LoggerService.log('error', `Test run failed: ${error.message}`);
            return;
        }

        results.forEach(printResult);

        const summary = TestRegistry.summarize(results);
        const label = summary.failing === 0 ? colors.green('ALL PASSED') : colors.red(`${summary.failing} FAILED`);
        LoggerService.log('info', `Test results: ${label} (${summary.passing} passed, ${summary.degraded} warnings, ${summary.disabled} skipped, ${summary.total} total)`);
    });
}

module.exports = { register };
