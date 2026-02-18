const WebSocket = require('ws');
const XMLBuilder = require('xmlbuilder');
const XMLParser = require('xml-parser');
const ConfigManager = require('./config-manager');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('./database-manager');
const TokenService = require('../service/token/token-service');
const MatchmakerManager = require('./matchmaker-manager');
const colors = require('../utils/colors');

class XMPPManager {
    static wss = null;
    static clients = [];
    static domain = 'prod.ol.epicgames.com';

    static async start() {
        const port = ConfigManager.get('xmppPort');
        this.domain = ConfigManager.get('xmppDomain');

        return new Promise((resolve, reject) => {
            this.wss = new WebSocket.Server({ port }, () => {
                LoggerService.log('success', `XMPP server started on port ${port}`);
                resolve();
            });

            this.wss.on('error', (err) => {
                 if (err.code === 'EADDRINUSE') {
                    LoggerService.log('error', `Port ${colors.cyan(ConfigManager.get('xmppPort'))} is already in use.`);
                    LoggerService.log('warn', 'Please close the other process using this port or change it in configuration.');
            
                    process.exit(1);
                } else {
                    LoggerService.log('error', `XMPP server failed to start: ${err.message}`);
                    reject(err);
                }
            });

            this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
        });
    }

    static async handleConnection(ws, req) {
        ws.on('error', () => {});

        if (ws.protocol.toLowerCase() !== 'xmpp') {
            return MatchmakerManager.handleConnection(ws, req);
        }

        let accountId = '';
        let jid = '';
        let id = '';
        let sessionId = this.generateId();
        let authenticated = false;

        ws.on('message', async (message) => {
            try {
                if (Buffer.isBuffer(message)) message = message.toString();
                const msg = XMLParser(message);

                if (!msg.root) return this.closeConnection(ws);

                switch (msg.root.name) {
                    case 'open':
                        await this.handleOpen(ws, sessionId, authenticated);
                        break;

                    case 'auth':
                        const authResult = await this.handleAuth(ws, msg);
                        if (authResult) {
                            authenticated = true;
                            accountId = authResult.accountId;
                            LoggerService.log('info', `XMPP client authenticated: ${accountId}`);
                        }
                        break;

                    case 'iq':
                        await this.handleIQ(ws, msg, accountId, jid, id, (newJid, newId) => {
                            jid = newJid;
                            id = newId;
                        });
                        break;

                    case 'message':
                        await this.handleMessage(ws, msg);
                        break;

                    case 'presence':
                        await this.handlePresence(ws, msg);
                        break;
                }

                if (!this.clients.find(c => c.ws === ws)) {
                    if (accountId && jid && id && authenticated) {
                        this.clients.push({
                            ws,
                            accountId,
                            jid,
                            id,
                            lastPresenceUpdate: {
                                away: false,
                                status: '{}'
                            }
                        });
                        LoggerService.log('info', `XMPP client connected: ${accountId}`);
                    }
                }
            } catch (error) {
                LoggerService.log('error', `XMPP message handling error: ${error.message}`);
            }
        });

        ws.on('close', () => this.removeClient(ws));
    }

    static async handleOpen(ws, sessionId, authenticated) {
        ws.send(
            XMLBuilder.create('open')
                .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing')
                .attribute('from', this.domain)
                .attribute('id', sessionId)
                .attribute('version', '1.0')
                .attribute('xml:lang', 'en')
                .toString()
        );

        if (authenticated) {
            ws.send(
                XMLBuilder.create('stream:features')
                    .attribute('xmlns:stream', 'http://etherx.jabber.org/streams')
                    .element('ver')
                        .attribute('xmlns', 'urn:xmpp:features:rosterver')
                        .up()
                    .element('starttls')
                        .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls')
                        .up()
                    .element('bind')
                        .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind')
                        .up()
                    .element('compression')
                        .attribute('xmlns', 'http://jabber.org/features/compress')
                        .element('method', 'zlib')
                        .up()
                        .up()
                    .element('session')
                        .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-session')
                        .up()
                    .toString()
            );
        } else {
            ws.send(
                XMLBuilder.create('stream:features')
                    .attribute('xmlns:stream', 'http://etherx.jabber.org/streams')
                    .element('mechanisms')
                        .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
                        .element('mechanism', 'PLAIN')
                        .up()
                        .up()
                    .element('ver')
                        .attribute('xmlns', 'urn:xmpp:features:rosterver')
                        .up()
                    .element('starttls')
                        .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls')
                        .up()
                    .element('compression')
                        .attribute('xmlns', 'http://jabber.org/features/compress')
                        .element('method', 'zlib')
                        .up()
                        .up()
                    .element('auth')
                        .attribute('xmlns', 'http://jabber.org/features/iq-auth')
                        .up()
                    .toString()
            );
        }
    }

    static async handleAuth(ws, msg) {
        if (!msg.root.content) return null;

        let decodedBase64;
        try {
            decodedBase64 = Buffer.from(msg.root.content, 'base64').toString('utf8');
        } catch {
            return null;
        }

        if (!decodedBase64.includes('\u0000')) return null;

        const parts = decodedBase64.split('\u0000');
        if (parts.length !== 3) return null;

        const accountId = parts[1];
        const token = parts[2];

        if (this.clients.find(c => c.accountId === accountId)) {
            this.closeConnection(ws);
            return null;
        }

        const account = await DatabaseManager.getAccount(accountId);
        if (!account) {
            LoggerService.log('warn', `XMPP auth failed: account ${accountId} not found`);
            this.closeConnection(ws);
            return null;
        }

        const tokenData = TokenService.verifyToken(token);
        if (!tokenData || tokenData.sub !== accountId) {
            LoggerService.log('warn', `XMPP auth failed: invalid token for ${accountId}`);
            this.closeConnection(ws);
            return null;
        }

        ws.send(
            XMLBuilder.create('success')
                .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
                .toString()
        );

        return { accountId };
    }

    static async handleIQ(ws, msg, accountId, jid, id, updateJid) {
        const iqId = msg.root.attributes.id;

        switch (iqId) {
            case '_xmpp_bind1':
                const bindElement = msg.root.children.find(c => c.name === 'bind');
                if (!bindElement) return;

                const resourceElement = bindElement.children.find(c => c.name === 'resource');
                if (!resourceElement) return;

                const resource = resourceElement.content;
                const newJid = `${accountId}@${this.domain}/${resource}`;
                const newId = `${accountId}@${this.domain}`;

                updateJid(newJid, newId);

                ws.send(
                    XMLBuilder.create('iq')
                        .attribute('to', newJid)
                        .attribute('id', '_xmpp_bind1')
                        .attribute('xmlns', 'jabber:client')
                        .attribute('type', 'result')
                        .element('bind')
                            .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind')
                            .element('jid', newJid)
                            .up()
                        .up()
                        .toString()
                );
                break;

            case '_xmpp_session1':
                if (!this.clients.find(c => c.ws === ws)) return;

                ws.send(
                    XMLBuilder.create('iq')
                        .attribute('to', jid)
                        .attribute('from', this.domain)
                        .attribute('id', '_xmpp_session1')
                        .attribute('xmlns', 'jabber:client')
                        .attribute('type', 'result')
                        .toString()
                );

                this.sendPresenceFromAll(ws);
                break;

            default:
                if (!this.clients.find(c => c.ws === ws)) return;

                ws.send(
                    XMLBuilder.create('iq')
                        .attribute('to', jid)
                        .attribute('from', this.domain)
                        .attribute('id', iqId)
                        .attribute('xmlns', 'jabber:client')
                        .attribute('type', 'result')
                        .toString()
                );
                break;
        }
    }

    static async handleMessage(ws, msg) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        const bodyElement = msg.root.children.find(c => c.name === 'body');
        if (!bodyElement) return;

        const body = bodyElement.content;
        const messageType = msg.root.attributes.type;

        if (messageType === 'chat') {
            const to = msg.root.attributes.to;
            if (!to) return;

            const receiver = this.clients.find(c => c.id === to);
            const sender = client;

            if (!receiver || receiver === sender) return;

            receiver.ws.send(
                XMLBuilder.create('message')
                    .attribute('to', receiver.jid)
                    .attribute('from', sender.jid)
                    .attribute('xmlns', 'jabber:client')
                    .attribute('type', 'chat')
                    .element('body', body)
                    .up()
                    .toString()
            );
            return;
        }

        if (this.isJSON(body)) {
            const object = JSON.parse(body);

            if (object.type && typeof object.type === 'string') {
                switch (object.type.toLowerCase()) {
                    case 'com.epicgames.party.invitation':
                        const to = msg.root.attributes.to;
                        if (!to) return;

                        const receiver = this.clients.find(c => c.id === to);
                        if (!receiver) return;

                        receiver.ws.send(
                            XMLBuilder.create('message')
                                .attribute('from', client.jid)
                                .attribute('id', msg.root.attributes.id)
                                .attribute('to', receiver.jid)
                                .attribute('xmlns', 'jabber:client')
                                .element('body', body)
                                .up()
                                .toString()
                        );
                        break;

                    default:
                        ws.send(
                            XMLBuilder.create('message')
                                .attribute('from', client.jid)
                                .attribute('id', msg.root.attributes.id)
                                .attribute('to', client.jid)
                                .attribute('xmlns', 'jabber:client')
                                .element('body', body)
                                .up()
                                .toString()
                        );
                        break;
                }
            }
        }
    }

    static async handlePresence(ws, msg) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        const statusElement = msg.root.children.find(c => c.name === 'status');
        if (!statusElement) return;

        if (!this.isJSON(statusElement.content)) return;

        const body = statusElement.content;
        const away = msg.root.children.some(c => c.name === 'show');

        this.updatePresenceForAll(ws, body, away, false);
    }

    static updatePresenceForAll(ws, body, away, offline) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        const clientIndex = this.clients.findIndex(c => c.ws === ws);
        if (clientIndex !== -1) {
            this.clients[clientIndex].lastPresenceUpdate.away = away;
            this.clients[clientIndex].lastPresenceUpdate.status = body;
        }

        this.clients.forEach(otherClient => {
            let xml = XMLBuilder.create('presence')
                .attribute('to', otherClient.jid)
                .attribute('xmlns', 'jabber:client')
                .attribute('from', client.jid);

            if (offline) {
                xml = xml.attribute('type', 'unavailable');
            } else {
                xml = xml.attribute('type', 'available');
            }

            if (away) {
                xml = xml.element('show', 'away').up().element('status', body).up();
            } else {
                xml = xml.element('status', body).up();
            }

            otherClient.ws.send(xml.toString());
        });
    }

    static sendPresenceFromAll(ws) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        this.clients.forEach(otherClient => {
            let xml = XMLBuilder.create('presence')
                .attribute('to', client.jid)
                .attribute('xmlns', 'jabber:client')
                .attribute('from', otherClient.jid);

            if (otherClient.lastPresenceUpdate.away) {
                xml = xml
                    .attribute('type', 'available')
                    .element('show', 'away')
                    .up()
                    .element('status', otherClient.lastPresenceUpdate.status)
                    .up();
            } else {
                xml = xml
                    .attribute('type', 'available')
                    .element('status', otherClient.lastPresenceUpdate.status)
                    .up();
            }

            client.ws.send(xml.toString());
        });
    }

    static removeClient(ws) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        this.updatePresenceForAll(ws, '{}', false, true);

        LoggerService.log('info', `XMPP client disconnected: ${client.accountId}`);

        const index = this.clients.findIndex(c => c.ws === ws);
        if (index !== -1) {
            this.clients.splice(index, 1);
        }
    }

    static closeConnection(ws) {
        ws.send(
            XMLBuilder.create('close')
                .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing')
                .toString()
        );
        ws.close();
    }

    static generateId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    static isJSON(str) {
        try {
            JSON.parse(str);
            return true;
        } catch {
            return false;
        }
    }

    static async stop() {
        if (this.wss) {
            this.clients.forEach(client => {
                this.closeConnection(client.ws);
            });

            this.clients = [];

            this.wss.close();
            LoggerService.log('info', 'XMPP server stopped');
        }
    }
}

module.exports = XMPPManager;
