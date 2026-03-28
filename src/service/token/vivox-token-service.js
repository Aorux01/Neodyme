const crypto = require('crypto');
const ConfigManager = require('../../manager/config-manager');

class VivoxTokenService {
    static VIVOX_ISSUER = 'epicgames';

    static get domain() { return ConfigManager.get('vivoxDomain', 'mtu1xp.vivox.com'); }
    static get ttl()    { return parseInt(ConfigManager.get('vivoxTokenTtl', '7200'), 10); }
    static get key()    { return ConfigManager.get('vivoxKey', 'zcETsPpEAysznTyDXK4TEzwLQPcTvTAO'); }



    static b64url(str) {
        return Buffer.from(str).toString('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    static generate(accountId, partyId) {
        const channel_uri = `sip:confctl-g-epicgames.p-${partyId}@${this.domain}`;
        const user_uri    = `sip:.epicgames.${accountId}.@${this.domain}`;

        const header  = this.b64url('{}');
        const payload = this.b64url(JSON.stringify({
            iss: this.VIVOX_ISSUER,
            sub: accountId,
            exp: Math.floor(Date.now() / 1000) + this.ttl,
            vxa: 'join',
            f: user_uri,
            t: channel_uri
        }));

        const toSign = `${header}.${payload}`;
        const sig = crypto.createHmac('sha256', this.key)
            .update(toSign)
            .digest('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        return { token: `${toSign}.${sig}`, channel_uri, user_uri };
    }
}

module.exports = VivoxTokenService;
