const fs = require('fs');
const path = require('path');
const ConfigManager = require('../../manager/config-manager');
const DatabaseManager = require('../../manager/database-manager');
const LoggerService = require('../logger/logger-service');
const EmailService = require('../email/email-service');

// Looks for settings that are legal on their own but do not work together.
class ConfigAdvisor {
    static async collect() {
        const advice = [];
        const warn = (message) => advice.push(message);

        const publicUrl = String(ConfigManager.get('publicUrl', '') || '').trim();
        const mailReady = EmailService.isConfigured();
        const discordId = !!ConfigManager.key('DISCORD_CLIENT_ID');
        const discordSecret = !!ConfigManager.key('DISCORD_CLIENT_SECRET');

        if (mailReady && !publicUrl) {
            warn('publicUrl is empty: links in emails (verification, reset, sign-in) point to localhost and only work on this machine.');
        }
        if (ConfigManager.get('requireEmailVerification', false) === true && !mailReady) {
            warn('requireEmailVerification is on but SMTP is not configured, so verification is skipped. Set it up with /email create.');
        }
        if (discordId !== discordSecret) {
            warn('Only one of DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET is set in .env, so Discord sign-in stays off.');
        }
        if (discordId && discordSecret && !publicUrl) {
            warn('Discord sign-in uses a localhost redirect address. Set publicUrl and register its /neodyme/api/auth/discord/callback in the Discord developer portal.');
        }
        if (publicUrl.startsWith('https://') && ConfigManager.get('secureCookies', false) !== true && ConfigManager.get('protocol', 'http') !== 'https') {
            warn('publicUrl is https but secureCookies is off: if a proxy terminates TLS, turn secureCookies on.');
        }
        if (String(ConfigManager.get('xmppProtocol', 'ws')).toLowerCase() === 'wss') {
            const cert = path.resolve(ConfigManager.get('sslCertPath', 'config/ssl/cert.pem'));
            const key = path.resolve(ConfigManager.get('sslKeyPath', 'config/ssl/key.pem'));
            if (!fs.existsSync(cert) || !fs.existsSync(key)) {
                warn('xmppProtocol is wss but the SSL certificate or key is missing, so XMPP cannot start.');
            }
        }

        if (TwoFactorServiceEnabled()) {
            try {
                const accounts = await DatabaseManager.getAllAccounts();
                const exposed = accounts.filter(a => typeof a.clientType === 'number' && a.clientType >= 1 && a.clientType <= 4 && !a.tfaEnabled);
                if (exposed.length > 0) {
                    warn(`Staff without two-factor cannot open the staff panels: ${exposed.map(a => a.displayName).join(', ')}.`);
                }
            } catch (_) {}
        }

        return advice;
    }

    static async run() {
        const advice = await this.collect();
        advice.forEach(message => LoggerService.log('warn', `Config: ${message}`));
        return advice;
    }
}

function TwoFactorServiceEnabled() {
    return ConfigManager.get('require2faForStaff', false) === true;
}

module.exports = ConfigAdvisor;
