const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const LoggerService = require('../logger/logger-service');

const LAYOUTS_DIR = path.join(__dirname, '../../../data/email/layouts');

// Placeholders a layout is expected to expose. The renderer fills these in.
const LAYOUT_SLOTS = ['{{subject}}', '{{serverName}}', '{{heading}}', '{{body}}', '{{footerNote}}'];

// Hard-coded fallback used when the 'default' layout file is missing, so emails
// always render even if someone deletes it.
const DEFAULT_LAYOUT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{{subject}}</title></head>
<body style="margin:0;padding:0;background:#0e0e12;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e12;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#17171d;border:1px solid #2a2a33;border-radius:14px;overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#7c3aed,#4c1d95);padding:24px 32px;"><span style="color:#fff;font-size:20px;font-weight:700;">{{serverName}}</span></td></tr>
      <tr><td style="padding:32px;color:#fff;"><div style="font-size:22px;font-weight:700;padding-bottom:12px;">{{heading}}</div><div style="color:#c4c4cc;font-size:15px;line-height:1.6;">{{body}}</div></td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #2a2a33;"><p style="color:#6b6b75;font-size:12px;margin:0;">{{footerNote}}</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

class EmailLayoutService {
    static async initialize() {
        if (!fs.existsSync(LAYOUTS_DIR)) {
            await fsPromises.mkdir(LAYOUTS_DIR, { recursive: true });
        }
        // Recreate the default layout if it was removed.
        const defaultPath = this.layoutPath('default');
        if (!fs.existsSync(defaultPath)) {
            await fsPromises.writeFile(defaultPath, DEFAULT_LAYOUT_HTML, 'utf8');
        }
        LoggerService.log('info', 'Email layout service initialized');
    }

    static sanitizeId(id) {
        return String(id).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    }

    static layoutPath(id) {
        return path.join(LAYOUTS_DIR, `${this.sanitizeId(id)}.html`);
    }

    static async list() {
        if (!fs.existsSync(LAYOUTS_DIR)) {
            return [];
        }
        const files = (await fsPromises.readdir(LAYOUTS_DIR)).filter(f => f.endsWith('.html'));
        return files.map(f => f.replace(/\.html$/, '')).sort();
    }

    // Returns the raw HTML of a layout, falling back to 'default' then to the
    // hard-coded layout so rendering never fails.
    static async getHtml(id) {
        const file = this.layoutPath(id || 'default');
        if (fs.existsSync(file)) {
            return await fsPromises.readFile(file, 'utf8');
        }
        const defaultFile = this.layoutPath('default');
        if (fs.existsSync(defaultFile)) {
            return await fsPromises.readFile(defaultFile, 'utf8');
        }
        return DEFAULT_LAYOUT_HTML;
    }

    static async get(id) {
        const cleanId = this.sanitizeId(id);
        const file = this.layoutPath(cleanId);
        if (!fs.existsSync(file)) {
            return null;
        }
        return { id: cleanId, html: await fsPromises.readFile(file, 'utf8'), isDefault: cleanId === 'default' };
    }

    static async save(id, html) {
        const cleanId = this.sanitizeId(id);
        if (!cleanId) {
            throw new Error('Invalid layout id.');
        }
        if (typeof html !== 'string' || !html.trim()) {
            throw new Error('Layout HTML cannot be empty.');
        }
        await fsPromises.writeFile(this.layoutPath(cleanId), html, 'utf8');
        return { id: cleanId };
    }

    static async delete(id) {
        const cleanId = this.sanitizeId(id);
        if (cleanId === 'default') {
            return { success: false, error: 'The default layout cannot be deleted' };
        }
        const file = this.layoutPath(cleanId);
        if (!fs.existsSync(file)) {
            return { success: false, error: 'Layout not found' };
        }
        await fsPromises.unlink(file);
        return { success: true };
    }

    static getSlots() {
        return LAYOUT_SLOTS.slice();
    }
}

module.exports = EmailLayoutService;
