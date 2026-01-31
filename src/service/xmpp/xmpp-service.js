const XMLBuilder = require('xmlbuilder');
const XMPPManager = require('../../manager/xmpp-manager');
const LoggerService = require('../logger/logger-service');

class XmppService {
    static sendMessageToId(toAccountId, body) {
        try {
            if (!XMPPManager.clients) return false;
            if (typeof body === 'object') body = JSON.stringify(body);

            const receiver = XMPPManager.clients.find(c => c.accountId === toAccountId);
            if (!receiver) return false;

            receiver.ws.send(
                XMLBuilder.create('message')
                    .attribute('from', `xmpp-admin@${XMPPManager.domain}`)
                    .attribute('to', receiver.jid)
                    .attribute('xmlns', 'jabber:client')
                    .element('body', body)
                    .up()
                    .toString()
            );

            return true;
        } catch (error) {
            LoggerService.log('error', `Failed to send XMPP message to ${toAccountId}: ${error.message}`);
            return false;
        }
    }

    static sendMessageToAll(body) {
        try {
            if (!XMPPManager.clients) return false;
            if (typeof body === 'object') body = JSON.stringify(body);

            XMPPManager.clients.forEach(client => {
                client.ws.send(
                    XMLBuilder.create('message')
                        .attribute('from', `xmpp-admin@${XMPPManager.domain}`)
                        .attribute('to', client.jid)
                        .attribute('xmlns', 'jabber:client')
                        .element('body', body)
                        .up()
                        .toString()
                );
            });

            return true;
        } catch (error) {
            LoggerService.log('error', `Failed to send XMPP broadcast: ${error.message}`);
            return false;
        }
    }

    static sendPresence(fromAccountId, toAccountId, offline = false) {
        try {
            if (!XMPPManager.clients) return false;

            const sender = XMPPManager.clients.find(c => c.accountId === fromAccountId);
            const receiver = XMPPManager.clients.find(c => c.accountId === toAccountId);

            if (!sender || !receiver) return false;

            let xml = XMLBuilder.create('presence')
                .attribute('to', receiver.jid)
                .attribute('xmlns', 'jabber:client')
                .attribute('from', sender.jid)
                .attribute('type', offline ? 'unavailable' : 'available');

            if (sender.lastPresenceUpdate.away) {
                xml = xml.element('show', 'away').up().element('status', sender.lastPresenceUpdate.status).up();
            } else {
                xml = xml.element('status', sender.lastPresenceUpdate.status).up();
            }

            receiver.ws.send(xml.toString());
            return true;
        } catch (error) {
            LoggerService.log('error', `Failed to send presence from ${fromAccountId} to ${toAccountId}: ${error.message}`);
            return false;
        }
    }

    static isOnline(accountId) {
        if (!XMPPManager.clients) return false;
        return XMPPManager.clients.some(c => c.accountId === accountId);
    }

    static getOnlineAccounts() {
        if (!XMPPManager.clients) return [];
        return XMPPManager.clients.map(c => c.accountId);
    }
}

module.exports = XmppService;
