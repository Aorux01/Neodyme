const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const LoggerService = require('../logger/logger-service');

const AUTOMATIONS_FILE = path.join(__dirname, '../../../data/email/automations.json');

// Supported triggers. Event triggers fire via emit(); cron triggers are scheduled.
const EVENT_TRIGGERS = ['account.created', 'maintenance.on', 'maintenance.off'];
const TRIGGERS = [...EVENT_TRIGGERS, 'cron'];

class EmailAutomationService {
    static rules = [];
    static cronJobs = new Map();

    static async initialize() {
        await this.load();
        this.scheduleCronRules();
        LoggerService.log('info', `Email automation service initialized (${this.rules.length} rule(s))`);
    }

    static async load() {
        try {
            if (!fs.existsSync(AUTOMATIONS_FILE)) {
                this.rules = [];
                return;
            }
            const raw = await fsPromises.readFile(AUTOMATIONS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            this.rules = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            LoggerService.log('error', `Failed to load email automations: ${error.message}`);
            this.rules = [];
        }
    }

    static async save() {
        await fsPromises.writeFile(AUTOMATIONS_FILE, JSON.stringify(this.rules, null, 2), 'utf8');
    }

    static list() {
        return this.rules.slice();
    }

    static getTriggers() {
        return TRIGGERS.slice();
    }

    static async upsert(rule) {
        if (!rule || !rule.id) {
            throw new Error('Rule id is required.');
        }
        if (!TRIGGERS.includes(rule.trigger)) {
            throw new Error(`Unknown trigger "${rule.trigger}".`);
        }
        if (!rule.templateId) {
            throw new Error('templateId is required.');
        }
        if (rule.trigger === 'cron') {
            if (!rule.cron || !cron.validate(rule.cron)) {
                throw new Error('A valid cron expression is required for cron triggers.');
            }
        }

        const clean = {
            id: rule.id,
            name: rule.name || rule.id,
            trigger: rule.trigger,
            templateId: rule.templateId,
            enabled: rule.enabled === true,
            selection: rule.selection || null,
            cron: rule.trigger === 'cron' ? rule.cron : undefined
        };

        const idx = this.rules.findIndex(r => r.id === clean.id);
        if (idx === -1) {
            this.rules.push(clean);
        } else {
            this.rules[idx] = clean;
        }

        await this.save();
        this.scheduleCronRules();
        return clean;
    }

    static async remove(id) {
        const idx = this.rules.findIndex(r => r.id === id);
        if (idx === -1) {
            return { success: false, error: 'Rule not found' };
        }
        this.rules.splice(idx, 1);
        await this.save();
        this.scheduleCronRules();
        return { success: true };
    }

    // (Re)build cron jobs from the current enabled cron rules.
    static scheduleCronRules() {
        for (const job of this.cronJobs.values()) {
            job.stop();
        }
        this.cronJobs.clear();

        for (const rule of this.rules) {
            if (rule.trigger !== 'cron' || !rule.enabled || !rule.cron) continue;
            if (!cron.validate(rule.cron)) {
                LoggerService.log('warn', `Email automation "${rule.id}" has an invalid cron expression, skipped.`);
                continue;
            }
            const job = cron.schedule(rule.cron, () => {
                this.runRule(rule).catch(err =>
                    LoggerService.log('error', `Email automation "${rule.id}" failed: ${err.message}`)
                );
            });
            this.cronJobs.set(rule.id, job);
        }
    }

    // Fire all enabled event rules matching an event. For account-scoped events
    // (e.g. account.created) the account is passed so a single recipient is used.
    static async emit(eventName, payload = {}) {
        const matching = this.rules.filter(r => r.enabled && r.trigger === eventName);
        for (const rule of matching) {
            this.runRule(rule, payload).catch(err =>
                LoggerService.log('error', `Email automation "${rule.id}" failed: ${err.message}`)
            );
        }
    }

    // Execute a rule: account-scoped triggers send to the single account in the
    // payload; everything else starts a mass campaign with the rule's selection.
    static async runRule(rule, payload = {}) {
        const EmailService = require('./email-service');
        if (!EmailService.isConfigured()) {
            LoggerService.log('warn', `Email automation "${rule.id}" skipped: SMTP not configured.`);
            return;
        }

        const EmailTemplateService = require('./email-template-service');
        const template = await EmailTemplateService.get(rule.templateId);
        if (!template) {
            LoggerService.log('warn', `Email automation "${rule.id}" skipped: template "${rule.templateId}" not found.`);
            return;
        }

        // account.created sends to just the new account.
        if (rule.trigger === 'account.created') {
            const account = payload.account || payload;
            if (!account || !account.email) return;
            const rendered = await EmailTemplateService.render(template, account);
            await EmailService.sendMail({ to: account.email, subject: rendered.subject, html: rendered.html, text: rendered.text });
            LoggerService.log('info', `Email automation "${rule.id}" sent to ${account.email}`);
            return;
        }

        // cron and maintenance.* trigger a mass campaign with the rule's selection.
        const EmailCampaignService = require('./email-campaign-service');
        const selection = rule.selection || { roleLevels: [0], accountIds: [], verifiedOnly: true };
        const job = await EmailCampaignService.startCampaign({
            templateId: rule.templateId,
            selection,
            startedBy: `automation:${rule.id}`
        });
        LoggerService.log('info', `Email automation "${rule.id}" started campaign ${job.id} (${job.total} recipients)`);
    }
}

module.exports = EmailAutomationService;
