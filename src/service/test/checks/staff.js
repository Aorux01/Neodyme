const TestRegistry = require('../test-registry');
const WebService = require('../../api/web-service');
const RecoveryService = require('../../api/recovery-service');
const TicketService = require('../../api/ticket-service');
const WebTokenService = require('../../token/web-token-service');
const DatabaseManager = require('../../../manager/database-manager');

const register = (id, title, run) => TestRegistry.register({ id, group: 'staff', title, kind: 'functional', run });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Runs the website auth middleware against a token and says whether it let the request through.
async function webAccepts(token) {
    let passed = false;
    const res = {
        set() {}, removeHeader() {}, clearCookie() {},
        status() { return this; }, json() { return this; }
    };
    await WebService.verifyToken({ headers: {}, cookies: { neodyme_auth: token } }, res, () => { passed = true; });
    return passed;
}

register('staff.web-session-revocation', 'Ending sessions also ends website sessions', async (fx) => {
    const { account } = await fx.createAccount();
    const id = account.accountId;

    const before = await WebTokenService.generateTokenPair(id, 'fortnite', account.displayName);
    if (!(await webAccepts(before.access_token))) throw new Error('A fresh website token was refused');

    await RecoveryService.revokeSessions(id);
    if (await webAccepts(before.access_token)) throw new Error('A website token survived revokeSessions');

    await sleep(1100);
    const after = await WebTokenService.generateTokenPair(id, 'fortnite', account.displayName);
    if (!(await webAccepts(after.access_token))) throw new Error('A token issued after the revocation was refused');
});

register('staff.admin-reset-link', 'An admin reset link changes the password once', async (fx) => {
    const { account } = await fx.createAccount();

    const { link } = await RecoveryService.issueResetLink(account);
    const token = new URL(link).searchParams.get('token');
    if (!token) throw new Error('The link carries no token');

    const done = await RecoveryService.completePasswordReset(token, 'Fresh!Pass98765');
    if (!done.success) throw new Error(`The reset link was refused: ${done.message}`);
    if ((await RecoveryService.completePasswordReset(token, 'Other!Pass98765')).success) throw new Error('The link worked twice');
});

register('staff.ban-appeals', 'Only banned players can appeal, once at a time', async (fx) => {
    const { account, email } = await fx.createAccount();
    const id = account.accountId;
    const openTickets = async () => (await TicketService.getAllTickets()).filter(t => t.playerAccountId === id && t.category === 'ban_appeal');

    fx.onCleanup(async () => { for (const t of await openTickets()) await DatabaseManager.deleteTicketData(t.ticketId); });

    const message = 'I was banned by mistake, please have a look.';

    if ((await RecoveryService.submitAppeal(email, message)).created) throw new Error('A player who is not banned could appeal');
    if ((await RecoveryService.submitAppeal('nobody@neodyme-test.invalid', message)).created) throw new Error('An unknown email created a ticket');

    await DatabaseManager.banAccount(id, ['test'], null);
    if ((await RecoveryService.submitAppeal(email, 'too short')).created) throw new Error('A too short message was accepted');
    if (!(await RecoveryService.submitAppeal(email, message)).created) throw new Error('A banned player could not appeal');
    if ((await RecoveryService.submitAppeal(email, message)).created) throw new Error('A second open appeal was accepted');

    const [ticket] = await openTickets();
    if (!ticket || ticket.contactEmail !== email || !ticket.subject.startsWith('[Ban appeal]')) throw new Error('The appeal ticket is incomplete');
});
