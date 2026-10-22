const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const LoggerService = require('../logger/logger-service');
const ConfigManager = require('../../manager/config-manager');

const TEMPLATES_DIR = path.join(__dirname, '../../../data/email/templates');

// Variables available to every template, resolved per recipient at send time.
// Account-specific values are filled in by buildContext(account).
const VARIABLE_HELP = [
    '{{displayName}}', '{{email}}', '{{accountId}}', '{{serverName}}', '{{version}}'
];

class EmailTemplateService {
    static async initialize() {
        if (!fs.existsSync(TEMPLATES_DIR)) {
            await fsPromises.mkdir(TEMPLATES_DIR, { recursive: true });
        }
        LoggerService.log('info', 'Email template service initialized');
    }

    static templatePath(id) {
        return path.join(TEMPLATES_DIR, `${this.sanitizeId(id)}.json`);
    }

    // Only allow safe filename characters to avoid path traversal.
    static sanitizeId(id) {
        return String(id).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    }

    static async list() {
        if (!fs.existsSync(TEMPLATES_DIR)) {
            return [];
        }
        const files = (await fsPromises.readdir(TEMPLATES_DIR)).filter(f => f.endsWith('.json'));
        const templates = [];
        for (const file of files) {
            try {
                const raw = await fsPromises.readFile(path.join(TEMPLATES_DIR, file), 'utf8');
                templates.push(JSON.parse(raw));
            } catch (error) {
                LoggerService.log('warn', `Skipping invalid email template '${file}': ${error.message}`);
            }
        }
        return templates.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    }

    static async get(id) {
        const file = this.templatePath(id);
        if (!fs.existsSync(file)) {
            return null;
        }
        return JSON.parse(await fsPromises.readFile(file, 'utf8'));
    }

    // Create or update a template. System templates can be edited but their
    // `system` flag and id are preserved.
    static async save(id, data) {
        const cleanId = this.sanitizeId(id);
        if (!cleanId) {
            throw new Error('Invalid template id.');
        }
        if (!data.subject || (!data.body && !data.html)) {
            throw new Error('A template needs at least a subject and a body.');
        }

        const existing = await this.get(cleanId);
        const template = {
            id: cleanId,
            system: existing ? existing.system === true : false,
            name: data.name || existing?.name || cleanId,
            description: data.description ?? existing?.description ?? '',
            subject: data.subject,
            heading: data.heading ?? existing?.heading ?? '',
            body: data.body ?? existing?.body ?? '',
            html: data.html ?? existing?.html ?? '',
            footerNote: data.footerNote ?? existing?.footerNote ?? '',
            layout: data.layout ?? existing?.layout ?? 'default'
        };

        await fsPromises.writeFile(this.templatePath(cleanId), JSON.stringify(template, null, 2), 'utf8');
        return template;
    }

    static async delete(id) {
        const template = await this.get(id);
        if (!template) {
            return { success: false, error: 'Template not found' };
        }
        if (template.system) {
            return { success: false, error: 'System templates cannot be deleted' };
        }
        await fsPromises.unlink(this.templatePath(id));
        return { success: true };
    }

    // Build the variable context for a given recipient account.
    static buildContext(account = {}, extra = {}) {
        return {
            displayName: account.displayName || 'there',
            email: account.email || '',
            accountId: account.accountId || '',
            serverName: ConfigManager.get('serverName') || ConfigManager.get('websiteName') || 'Neodyme',
            version: String(ConfigManager.get('version') || ''),
            ...extra
        };
    }

    // Replace {{var}} tokens. Unknown variables are left as-is so typos are visible.
    static interpolate(str, context) {
        if (!str) return str;
        return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
            context[key] !== undefined ? context[key] : match
        );
    }

    // Render a template against an account into { subject, html, text }.
    // The template's content fields (heading/body/footerNote) are interpolated and
    // injected into the chosen HTML layout. A template may still provide a full raw
    // `html` block, which bypasses the layout entirely.
    static async render(template, account, extra = {}) {
        const ctx = this.buildContext(account, extra);
        const subject = this.interpolate(template.subject, ctx);

        let html;
        if (template.html && template.html.trim()) {
            // Full custom HTML - layout is ignored.
            html = this.interpolate(template.html, ctx);
        } else {
            const EmailLayoutService = require('./email-layout-service');
            const layoutHtml = await EmailLayoutService.getHtml(template.layout || 'default');

            // The layout owns subject/serverName plus the content slots.
            const layoutCtx = {
                ...ctx,
                subject,
                heading: this.interpolate(template.heading || '', ctx),
                body: this.interpolate(template.body || '', ctx),
                footerNote: this.interpolate(template.footerNote || '', ctx)
            };
            html = this.interpolate(layoutHtml, layoutCtx);
        }

        const text = this.interpolate(template.text || template.body || '', ctx);
        return { subject, html, text };
    }

    static getVariableHelp() {
        return VARIABLE_HELP.slice();
    }
}

module.exports = EmailTemplateService;
