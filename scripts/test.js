const path = require('path');

process.chdir(path.join(__dirname, '..'));

const LoggerService = require('../src/service/logger/logger-service');
const ConfigManager = require('../src/manager/config-manager');
const DatabaseManager = require('../src/manager/database-manager');
const TokenService = require('../src/service/token/token-service');
const WebTokenService = require('../src/service/token/web-token-service');
const OneTimeTokenService = require('../src/service/token/one-time-token-service');
const { CsrfTokenService } = require('../src/service/token/csrf-token-service');
const CreatorCodeService = require('../src/service/api/creator-code-service');
const TicketService = require('../src/service/api/ticket-service');
const AuditService = require('../src/service/api/audit-service');
const TestRegistry = require('../src/service/test/test-registry');

const print = console.log;
const group = process.argv.slice(2).find(arg => !arg.startsWith('-'));

(async () => {
    console.log = () => {};
    await ConfigManager.load();
    await DatabaseManager.initialize();
    await TokenService.initialize();
    await WebTokenService.initialize();
    await OneTimeTokenService.initialize();
    await CsrfTokenService.initialize();
    await CreatorCodeService.initialize();
    await TicketService.initialize();
    await AuditService.initialize();

    TestRegistry.loadBuiltInChecks();
    const results = await TestRegistry.runFunctional({ group });

    console.log = print;

    for (const r of results) {
        const mark = r.status === 'ok' ? 'PASS' : r.status === 'degraded' ? 'WARN' : r.status === 'disabled' ? 'SKIP' : 'FAIL';
        console.log(`${mark}  ${r.id.padEnd(40)} ${r.status === 'ok' ? '' : r.message}`);
    }

    const summary = TestRegistry.summarize(results);
    console.log(`\n${summary.passing}/${summary.total} passing, ${summary.degraded} warnings, ${summary.failing} failing, ${summary.disabled} skipped`);
    process.exit(summary.failing > 0 ? 1 : 0);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
