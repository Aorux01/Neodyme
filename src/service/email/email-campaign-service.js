const { v4: uuidv4 } = require('uuid');
const LoggerService = require('../logger/logger-service');
const ConfigManager = require('../../manager/config-manager');
const DatabaseManager = require('../../manager/database-manager');
const EmailService = require('./email-service');
const EmailTemplateService = require('./email-template-service');

// In-memory registry of mass-send jobs. Lost on restart by design (kept simple);
// a single running job at a time keeps SMTP throttling predictable.
class EmailCampaignService {
    static jobs = new Map();
    static activeJobId = null;

    // Throttle defaults are conservative to stay friendly to free SMTP providers.
    static getBatchSize() {
        const n = parseInt(ConfigManager.get('emailBatchSize', 20), 10);
        return Number.isFinite(n) && n > 0 ? n : 20;
    }

    static getBatchDelayMs() {
        const n = parseInt(ConfigManager.get('emailBatchDelayMs', 2000), 10);
        return Number.isFinite(n) && n >= 0 ? n : 2000;
    }

    // Resolve the recipient list from selected role levels and/or specific
    // accountIds. Returns deduped accounts that have an email address.
    // `roleLevels` is an array of numeric role levels (0..5).
    // `accountIds` is an array of explicit accountIds.
    // When `verifiedOnly` is true, only accounts with emailVerified !== false are kept.
    static async resolveRecipients({ roleLevels = [], accountIds = [], verifiedOnly = false }) {
        const all = await DatabaseManager.getAllAccounts();
        const roleSet = new Set(roleLevels.map(Number));
        const idSet = new Set(accountIds);

        const byId = new Map(all.map(a => [a.accountId, a]));
        const selected = new Map();

        for (const account of all) {
            const level = typeof account.clientType === 'number' ? account.clientType : 0;
            if (roleSet.has(level)) {
                selected.set(account.accountId, account);
            }
        }
        for (const id of idSet) {
            const account = byId.get(id);
            if (account) {
                selected.set(account.accountId, account);
            }
        }

        return [...selected.values()].filter(a => {
            if (!a.email) return false;
            if (verifiedOnly && a.emailVerified === false) return false;
            return true;
        });
    }

    // Count without building/sending - used by the panel to show "X recipients"
    // before confirming a send.
    static async previewCount(selection) {
        const recipients = await this.resolveRecipients(selection);
        return recipients.length;
    }

    // Start a mass send. Returns the job descriptor immediately; sending runs
    // in the background. Only one job may run at a time.
    static async startCampaign({ templateId, selection, startedBy }) {
        if (this.activeJobId && this.jobs.get(this.activeJobId)?.status === 'running') {
            throw new Error('A mass email is already in progress. Wait for it to finish.');
        }
        if (!EmailService.isConfigured()) {
            throw new Error('SMTP is not configured. Use /email create first.');
        }

        const template = await EmailTemplateService.get(templateId);
        if (!template) {
            throw new Error(`Template "${templateId}" not found.`);
        }

        const recipients = await this.resolveRecipients(selection);
        if (recipients.length === 0) {
            throw new Error('No recipients matched the selection.');
        }

        const jobId = uuidv4();
        const job = {
            id: jobId,
            templateId,
            total: recipients.length,
            sent: 0,
            failed: 0,
            status: 'running',
            startedBy: startedBy || 'system',
            startedAt: new Date().toISOString(),
            finishedAt: null,
            errors: []
        };
        this.jobs.set(jobId, job);
        this.activeJobId = jobId;

        LoggerService.log('info', `Email campaign ${jobId} started: ${recipients.length} recipient(s), template "${templateId}", by ${job.startedBy}`);

        // Fire-and-forget; the HTTP caller polls getJob() for progress.
        this.runCampaign(job, template, recipients).catch(err => {
            job.status = 'failed';
            job.finishedAt = new Date().toISOString();
            job.errors.push({ recipient: null, error: err.message });
            LoggerService.log('error', `Email campaign ${jobId} crashed: ${err.message}`);
        });

        return job;
    }

    static async runCampaign(job, template, recipients) {
        const batchSize = this.getBatchSize();
        const delayMs = this.getBatchDelayMs();

        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);

            await Promise.all(batch.map(async (account) => {
                try {
                    const rendered = await EmailTemplateService.render(template, account);
                    await EmailService.sendMail({
                        to: account.email,
                        subject: rendered.subject,
                        html: rendered.html,
                        text: rendered.text
                    });
                    job.sent++;
                } catch (error) {
                    job.failed++;
                    if (job.errors.length < 50) {
                        job.errors.push({ recipient: account.email, error: error.message });
                    }
                }
            }));

            // Pause between batches unless this was the last one.
            if (i + batchSize < recipients.length && delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        job.status = 'completed';
        job.finishedAt = new Date().toISOString();
        if (this.activeJobId === job.id) {
            this.activeJobId = null;
        }
        LoggerService.log('info', `Email campaign ${job.id} finished: ${job.sent} sent, ${job.failed} failed`);
    }

    static getJob(jobId) {
        return this.jobs.get(jobId) || null;
    }

    static getActiveJob() {
        return this.activeJobId ? this.jobs.get(this.activeJobId) : null;
    }

    static listJobs() {
        return [...this.jobs.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    }
}

module.exports = EmailCampaignService;
