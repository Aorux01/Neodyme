const LoggerService = require('../logger/logger-service');
const ConfigManager = require('../../manager/config-manager');

// Loaded lazily so the server still boots (and the rest of the Dev panel works)
// when the optional `nodemailer` dependency has not been installed yet.
let nodemailer = null;
function getNodemailer() {
    if (!nodemailer) {
        try {
            nodemailer = require('nodemailer');
        } catch (err) {
            throw new Error('The "nodemailer" package is not installed. Run: npm install nodemailer');
        }
    }
    return nodemailer;
}

// .env keys that hold the SMTP configuration.
const ENV_KEYS = {
    host:   'smtpHost',
    port:   'smtpPort',
    user:   'smtpUser',
    pass:   'smtpPass',
    from:   'smtpFrom',
    secure: 'smtpSecure'
};

class EmailService {
    static transporter = null;

    static async initialize() {
        if (!this.isConfigured()) {
            LoggerService.log('info', 'Email service initialized (SMTP not configured)');
            return;
        }
        try {
            this.buildTransport();
            LoggerService.log('info', 'Email service initialized (SMTP configured)');
        } catch (err) {
            // e.g. nodemailer not installed - don't block server boot.
            LoggerService.log('warn', `Email service: ${err.message}`);
        }
    }

    // True when the minimum SMTP settings are present in .env.
    static isConfigured() {
        return Boolean(
            ConfigManager.key(ENV_KEYS.host) &&
            ConfigManager.key(ENV_KEYS.port) &&
            ConfigManager.key(ENV_KEYS.user) &&
            ConfigManager.key(ENV_KEYS.pass)
        );
    }

    static getConfig() {
        const port = parseInt(ConfigManager.key(ENV_KEYS.port), 10) || 587;
        const user = ConfigManager.key(ENV_KEYS.user) || null;
        const secureRaw = ConfigManager.key(ENV_KEYS.secure);
        // Default to implicit TLS on 465, STARTTLS otherwise, unless explicitly set.
        const secure = secureRaw != null ? secureRaw === 'true' : port === 465;

        return {
            host: ConfigManager.key(ENV_KEYS.host) || null,
            port,
            secure,
            user,
            pass: ConfigManager.key(ENV_KEYS.pass) || null,
            from: ConfigManager.key(ENV_KEYS.from) || user
        };
    }

    static buildTransport() {
        const cfg = this.getConfig();
        this.transporter = getNodemailer().createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth: { user: cfg.user, pass: cfg.pass }
        });
        return this.transporter;
    }

    // Persist a new SMTP config into .env and rebuild the transport.
    static async saveConfig({ host, port, user, pass, from, secure }) {
        await ConfigManager.saveEnv(ENV_KEYS.host, host);
        await ConfigManager.saveEnv(ENV_KEYS.port, port);
        await ConfigManager.saveEnv(ENV_KEYS.user, user);
        await ConfigManager.saveEnv(ENV_KEYS.pass, pass);
        await ConfigManager.saveEnv(ENV_KEYS.from, from || user);
        if (secure != null) {
            await ConfigManager.saveEnv(ENV_KEYS.secure, secure ? 'true' : 'false');
        }
        this.buildTransport();
    }

    // Remove the SMTP config from .env and drop the transport.
    static async clearConfig() {
        for (const key of Object.values(ENV_KEYS)) {
            await ConfigManager.deleteEnv(key);
        }
        this.transporter = null;
    }

    // Verify the SMTP connection/credentials. Returns { success, error? }.
    static async verify() {
        if (!this.isConfigured()) {
            return { success: false, error: 'SMTP is not configured' };
        }

        try {
            if (!this.transporter) {
                this.buildTransport();
            }
            await this.transporter.verify();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    static async sendMail({ to, subject, html, text }) {
        if (!this.isConfigured()) {
            throw new Error('SMTP is not configured. Use /email create first.');
        }
        if (!this.transporter) {
            this.buildTransport();
        }

        const cfg = this.getConfig();
        const info = await this.transporter.sendMail({
            from: cfg.from,
            to,
            subject,
            html,
            text: text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined)
        });

        return info;
    }

    static async sendTestEmail(to, displayName, account = null) {
        const EmailTemplateService = require('./email-template-service');
        const template = await EmailTemplateService.get('test');

        // Fall back to an inline message if the system template was removed.
        if (!template) {
            const html = this.buildTemplate({
                title: 'Test Email',
                heading: `Hello ${displayName || 'there'}!`,
                body: 'This is a test email sent from your Neodyme backend. If you are reading this, your SMTP configuration is working correctly.',
                footerNote: 'You received this email because an administrator triggered a test from the server console.'
            });
            return this.sendMail({ to, subject: 'Neodyme - Test Email', html });
        }

        const rendered = await EmailTemplateService.render(template, account || { displayName, email: to });
        return this.sendMail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });
    }

    // Reusable branded HTML wrapper for all outgoing emails.
    static buildTemplate({ title, heading, body, ctaLabel, ctaUrl, footerNote }) {
        const cta = ctaLabel && ctaUrl
            ? `<tr><td style="padding:8px 0 24px;">
                   <a href="${ctaUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;">${ctaLabel}</a>
               </td></tr>`
            : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0e0e12;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e12;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#17171d;border:1px solid #2a2a33;border-radius:14px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#4c1d95);padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">Neodyme</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="color:#ffffff;font-size:22px;font-weight:700;padding-bottom:12px;">${heading}</td></tr>
            <tr><td style="color:#c4c4cc;font-size:15px;line-height:1.6;padding-bottom:24px;">${body}</td></tr>
            ${cta}
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #2a2a33;">
          <p style="color:#6b6b75;font-size:12px;line-height:1.5;margin:0;">${footerNote || 'This is an automated message from your Neodyme backend.'}</p>
          <p style="color:#4a4a52;font-size:11px;margin:8px 0 0;">Neodyme is not affiliated with or endorsed by Epic Games.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    }
}

module.exports = EmailService;
