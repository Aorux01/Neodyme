const WebSocket = require('ws');
const XMLBuilder = require('xmlbuilder');
const XMLParser = require('xml-parser');
const crypto = require('crypto');
const ConfigManager = require('./config-manager');
const LoggerService = require('../service/logger/logger-service');
const DatabaseManager = require('./database-manager');
const TokenService = require('../service/token/token-service');
const MatchmakerManager = require('./matchmaker-manager');

class XMPPManager {
    static wss = null;
    static clients = [];
    static mucs = {};
    static domain = 'prod.ol.epicgames.com';
    static startError = null;

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
                    LoggerService.log('error', `XMPP port ${port} is already in use.`);
                    reject(new Error(`Port ${port} already in use`));
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
        let displayName = '';
        let jid = '';
        let resource = '';
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

                    case 'auth': {
                        const authResult = await this.handleAuth(ws, msg);
                        if (authResult) {
                            authenticated = true;
                            accountId = authResult.accountId;
                            displayName = authResult.displayName;
                            //LoggerService.log('info', `XMPP client authenticated: ${displayName} (${accountId})`);
                        }
                        break;
                    }

                    case 'iq':
                        await this.handleIQ(ws, msg, accountId, jid, (newJid, newResource) => {
                            jid = newJid;
                            resource = newResource;
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
                    if (accountId && displayName && jid && resource && authenticated) {
                        this.clients.push({
                            ws,
                            accountId,
                            displayName,
                            jid,
                            resource,
                            joinedMUCs: [],
                            lastPresenceUpdate: {
                                away: false,
                                status: '{}'
                            }
                        });
                        LoggerService.log('info', `XMPP client connected: ${displayName} (${accountId})`);
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
                    .element('ver').attribute('xmlns', 'urn:xmpp:features:rosterver').up()
                    .element('starttls').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls').up()
                    .element('bind').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind').up()
                    .element('compression').attribute('xmlns', 'http://jabber.org/features/compress')
                        .element('method', 'zlib').up().up()
                    .element('session').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-session').up()
                    .toString()
            );
        } else {
            ws.send(
                XMLBuilder.create('stream:features')
                    .attribute('xmlns:stream', 'http://etherx.jabber.org/streams')
                    .element('mechanisms').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
                        .element('mechanism', 'PLAIN').up().up()
                    .element('ver').attribute('xmlns', 'urn:xmpp:features:rosterver').up()
                    .element('starttls').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls').up()
                    .element('compression').attribute('xmlns', 'http://jabber.org/features/compress')
                        .element('method', 'zlib').up().up()
                    .element('auth').attribute('xmlns', 'http://jabber.org/features/iq-auth').up()
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

        const existingClient = this.clients.find(c => c.accountId === accountId);
        if (existingClient) {
            LoggerService.log('warn', `XMPP: replacing stale connection for ${accountId}`);
            const idx = this.clients.indexOf(existingClient);
            if (idx !== -1) this.clients.splice(idx, 1);
            try { existingClient.ws.close(); } catch (_) {}
        }

        const account = await DatabaseManager.getAccount(accountId);
        if (!account) {
            LoggerService.log('warn', `XMPP auth failed: account ${accountId} not found`);
            this.closeConnection(ws);
            return null;
        }

        const isValid = await TokenService.isValidAccessToken(token);
        if (!isValid) {
            LoggerService.log('warn', `XMPP auth failed: token not in store for ${accountId}`);
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

        return { accountId, displayName: account.displayName };
    }

    static async handleIQ(ws, msg, accountId, jid, updateState) {
        const iqId = msg.root.attributes.id;

        switch (iqId) {
            case '_xmpp_bind1': {
                const bindElement = msg.root.children.find(c => c.name === 'bind');
                if (!bindElement) return;

                const resourceElement = bindElement.children.find(c => c.name === 'resource');
                if (!resourceElement || !resourceElement.content) return;

                const resource = resourceElement.content;
                const newJid = `${accountId}@${this.domain}/${resource}`;

                updateState(newJid, resource);

                ws.send(
                    XMLBuilder.create('iq')
                        .attribute('to', newJid)
                        .attribute('id', '_xmpp_bind1')
                        .attribute('xmlns', 'jabber:client')
                        .attribute('type', 'result')
                        .element('bind')
                            .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind')
                            .element('jid', newJid).up()
                        .up()
                        .toString()
                );
                break;
            }

            case '_xmpp_session1': {
                const client = this.clients.find(c => c.ws === ws);
                if (!client) return;

                ws.send(
                    XMLBuilder.create('iq')
                        .attribute('to', jid)
                        .attribute('from', this.domain)
                        .attribute('id', '_xmpp_session1')
                        .attribute('xmlns', 'jabber:client')
                        .attribute('type', 'result')
                        .toString()
                );

                await this.sendPresenceFromFriends(ws, client.accountId, client.jid);
                await this.updatePresenceForFriends(ws, '{}', false, false);
                break;
            }

            default: {
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
    }

    static async handleMessage(ws, msg) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        const bodyElement = msg.root.children.find(c => c.name === 'body');
        if (!bodyElement || !bodyElement.content) return;

        const body = bodyElement.content;
        const messageType = msg.root.attributes.type;

        if (messageType === 'chat') {
            const to = msg.root.attributes.to;
            if (!to) return;
            if (body.length >= 300) return;

            const receiver = this.clients.find(c => c.jid.split('/')[0] === to || c.jid === to);
            if (!receiver || receiver.accountId === client.accountId) return;

            receiver.ws.send(
                XMLBuilder.create('message')
                    .attribute('to', receiver.jid)
                    .attribute('from', client.jid)
                    .attribute('xmlns', 'jabber:client')
                    .attribute('type', 'chat')
                    .element('body', body).up()
                    .toString()
            );
            return;
        }

        if (messageType === 'groupchat') {
            const to = msg.root.attributes.to;
            if (!to) return;
            if (body.length >= 300) return;

            const roomName = to.split('@')[0];
            const muc = this.mucs[roomName];
            if (!muc) return;

            if (!muc.members.find(m => m.accountId === client.accountId)) return;

            muc.members.forEach(member => {
                const memberClient = this.clients.find(c => c.accountId === member.accountId);
                if (!memberClient) return;

                memberClient.ws.send(
                    XMLBuilder.create('message')
                        .attribute('to', memberClient.jid)
                        .attribute('from', this.getMUCMember(roomName, client.displayName, client.accountId, client.resource))
                        .attribute('xmlns', 'jabber:client')
                        .attribute('type', 'groupchat')
                        .element('body', body).up()
                        .toString()
                );
            });
            return;
        }

        if (this.isJSON(body)) {
            const object = JSON.parse(body);
            if (Array.isArray(object)) return;
            if (!object.type || typeof object.type !== 'string') return;
            if (!msg.root.attributes.to || !msg.root.attributes.id) return;

            const to = msg.root.attributes.to;
            const receiver = this.clients.find(c => c.jid.split('/')[0] === to || c.jid === to);
            if (!receiver) return;

            receiver.ws.send(
                XMLBuilder.create('message')
                    .attribute('from', client.jid)
                    .attribute('id', msg.root.attributes.id)
                    .attribute('to', receiver.jid)
                    .attribute('xmlns', 'jabber:client')
                    .element('body', body).up()
                    .toString()
            );
        }
    }

    static async handlePresence(ws, msg) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        const to = msg.root.attributes.to;
        const type = msg.root.attributes.type;

        // MUC leave (unavailable with MUC target)
        if (type === 'unavailable' && to && (
            to.endsWith(`@muc.${this.domain}`) ||
            to.split('/')[0].endsWith(`@muc.${this.domain}`)
        )) {
            if (!to.toLowerCase().startsWith('party-')) return;
            const roomName = to.split('@')[0];
            await this.handleMUCLeave(ws, client, roomName);
            return;
        }

        // Non-MUC unavailable - broadcast offline to friends
        if (type === 'unavailable') {
            await this.updatePresenceForFriends(ws, '{}', false, true);
            return;
        }

        // MUC join (presence with <x> or <muc:x> child)
        const hasMUCx = msg.root.children.find(c => c.name === 'x' || c.name === 'muc:x');
        if (hasMUCx && to) {
            if (!to.toLowerCase().startsWith('party-')) return;
            const roomName = to.split('@')[0];
            await this.handleMUCJoin(ws, client, roomName);
            return;
        }

        // Regular presence update
        const statusElement = msg.root.children.find(c => c.name === 'status');
        let status = statusElement ? (statusElement.content || '{}') : '{}';
        const away = !!msg.root.children.find(c => c.name === 'show');

        if (this.isJSON(status)) {
            if (Array.isArray(JSON.parse(status))) status = '{}';
        } else {
            status = '{}';
        }

        await this.updatePresenceForFriends(ws, status, away, false);
    }

    static async handleMUCJoin(ws, client, roomName) {
        if (!this.mucs[roomName]) this.mucs[roomName] = { members: [] };

        if (this.mucs[roomName].members.find(m => m.accountId === client.accountId)) return;

        this.mucs[roomName].members.push({ accountId: client.accountId });
        client.joinedMUCs.push(roomName);

        const mucFrom = this.getMUCMember(roomName, client.displayName, client.accountId, client.resource);

        // Confirm join to self
        ws.send(
            XMLBuilder.create('presence')
                .attribute('to', client.jid)
                .attribute('from', mucFrom)
                .attribute('xmlns', 'jabber:client')
                .element('x').attribute('xmlns', 'http://jabber.org/protocol/muc#user')
                    .element('item')
                        .attribute('nick', mucFrom.replace(`${roomName}@muc.${this.domain}/`, ''))
                        .attribute('jid', client.jid)
                        .attribute('role', 'participant')
                        .attribute('affiliation', 'none').up()
                    .element('status').attribute('code', '110').up()
                    .element('status').attribute('code', '100').up()
                    .element('status').attribute('code', '170').up()
                    .element('status').attribute('code', '201').up()
                .up()
                .toString()
        );

        // Notify all existing members of new joiner, and send existing members to new joiner
        this.mucs[roomName].members.forEach(member => {
            const memberClient = this.clients.find(c => c.accountId === member.accountId);
            if (!memberClient) return;

            const memberMUCFrom = this.getMUCMember(roomName, memberClient.displayName, memberClient.accountId, memberClient.resource);

            // Send existing member's presence to the new joiner
            ws.send(
                XMLBuilder.create('presence')
                    .attribute('from', memberMUCFrom)
                    .attribute('to', client.jid)
                    .attribute('xmlns', 'jabber:client')
                    .element('x').attribute('xmlns', 'http://jabber.org/protocol/muc#user')
                        .element('item')
                            .attribute('nick', memberMUCFrom.replace(`${roomName}@muc.${this.domain}/`, ''))
                            .attribute('jid', memberClient.jid)
                            .attribute('role', 'participant')
                            .attribute('affiliation', 'none').up()
                    .up()
                    .toString()
            );

            // Notify existing member of the new joiner (skip self)
            if (memberClient.accountId === client.accountId) return;

            memberClient.ws.send(
                XMLBuilder.create('presence')
                    .attribute('from', mucFrom)
                    .attribute('to', memberClient.jid)
                    .attribute('xmlns', 'jabber:client')
                    .element('x').attribute('xmlns', 'http://jabber.org/protocol/muc#user')
                        .element('item')
                            .attribute('nick', mucFrom.replace(`${roomName}@muc.${this.domain}/`, ''))
                            .attribute('jid', client.jid)
                            .attribute('role', 'participant')
                            .attribute('affiliation', 'none').up()
                    .up()
                    .toString()
            );
        });
    }

    static async handleMUCLeave(ws, client, roomName) {
        if (!this.mucs[roomName]) return;

        const memberIndex = this.mucs[roomName].members.findIndex(m => m.accountId === client.accountId);
        if (memberIndex !== -1) this.mucs[roomName].members.splice(memberIndex, 1);

        const joinedIdx = client.joinedMUCs.indexOf(roomName);
        if (joinedIdx !== -1) client.joinedMUCs.splice(joinedIdx, 1);

        const mucFrom = this.getMUCMember(roomName, client.displayName, client.accountId, client.resource);

        ws.send(
            XMLBuilder.create('presence')
                .attribute('to', client.jid)
                .attribute('from', mucFrom)
                .attribute('xmlns', 'jabber:client')
                .attribute('type', 'unavailable')
                .element('x').attribute('xmlns', 'http://jabber.org/protocol/muc#user')
                    .element('item')
                        .attribute('nick', mucFrom.replace(`${roomName}@muc.${this.domain}/`, ''))
                        .attribute('jid', client.jid)
                        .attribute('role', 'none').up()
                    .element('status').attribute('code', '110').up()
                    .element('status').attribute('code', '100').up()
                    .element('status').attribute('code', '170').up()
                .up()
                .toString()
        );
    }

    static async updatePresenceForFriends(ws, body, away, offline) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        const clientIndex = this.clients.indexOf(client);
        this.clients[clientIndex].lastPresenceUpdate.away = away;
        this.clients[clientIndex].lastPresenceUpdate.status = body;

        let acceptedFriendIds = [];
        try {
            const friendsData = await DatabaseManager.getFriends(client.accountId);
            acceptedFriendIds = friendsData.friends.map(f => f.accountId);
        } catch (_) {}

        this.clients.forEach(otherClient => {
            if (!acceptedFriendIds.includes(otherClient.accountId)) return;

            let xml = XMLBuilder.create('presence')
                .attribute('to', otherClient.jid)
                .attribute('xmlns', 'jabber:client')
                .attribute('from', client.jid)
                .attribute('type', offline ? 'unavailable' : 'available');

            if (away) {
                xml = xml.element('show', 'away').up().element('status', body).up();
            } else {
                xml = xml.element('status', body).up();
            }

            otherClient.ws.send(xml.toString());
        });
    }

    static async sendPresenceFromFriends(ws, accountId, jid) {
        let acceptedFriendIds = [];
        try {
            const friendsData = await DatabaseManager.getFriends(accountId);
            acceptedFriendIds = friendsData.friends.map(f => f.accountId);
        } catch (_) {}

        this.clients.forEach(otherClient => {
            if (!acceptedFriendIds.includes(otherClient.accountId)) return;

            let xml = XMLBuilder.create('presence')
                .attribute('to', jid)
                .attribute('xmlns', 'jabber:client')
                .attribute('from', otherClient.jid)
                .attribute('type', 'available');

            if (otherClient.lastPresenceUpdate.away) {
                xml = xml.element('show', 'away').up().element('status', otherClient.lastPresenceUpdate.status).up();
            } else {
                xml = xml.element('status', otherClient.lastPresenceUpdate.status).up();
            }

            ws.send(xml.toString());
        });
    }

    static async removeClient(ws) {
        const client = this.clients.find(c => c.ws === ws);
        if (!client) return;

        // 1. Extract partyId from last presence status
        let partyId = '';
        try {
            const lastStatus = JSON.parse(client.lastPresenceUpdate.status);
            if (lastStatus && typeof lastStatus === 'object' && lastStatus.Properties) {
                for (const key of Object.keys(lastStatus.Properties)) {
                    if (key.toLowerCase().startsWith('party.joininfo')) {
                        const val = lastStatus.Properties[key];
                        if (val && typeof val === 'object' && typeof val.partyId === 'string') {
                            partyId = val.partyId;
                            break;
                        }
                    }
                }
            }
        } catch (_) {}

        // 2. Broadcast offline presence to friends
        await this.updatePresenceForFriends(ws, '{}', false, true);

        // 3. Clean up all MUC memberships
        for (const roomName of [...client.joinedMUCs]) {
            if (this.mucs[roomName]) {
                const idx = this.mucs[roomName].members.findIndex(m => m.accountId === client.accountId);
                if (idx !== -1) this.mucs[roomName].members.splice(idx, 1);
            }
        }

        // 4. Notify all other connected clients of party member exit
        if (partyId) {
            const payload = JSON.stringify({
                type: 'com.epicgames.party.memberexited',
                payload: {
                    partyId,
                    memberId: client.accountId,
                    wasKicked: false
                },
                timestamp: new Date().toISOString()
            });

            this.clients.forEach(otherClient => {
                if (otherClient.accountId === client.accountId) return;

                otherClient.ws.send(
                    XMLBuilder.create('message')
                        .attribute('id', this.generateId())
                        .attribute('from', client.jid)
                        .attribute('xmlns', 'jabber:client')
                        .attribute('to', otherClient.jid)
                        .element('body', payload).up()
                        .toString()
                );
            });
        }

        LoggerService.log('info', `XMPP client disconnected: ${client.displayName} (${client.accountId})`);

        const index = this.clients.findIndex(c => c.ws === ws);
        if (index !== -1) this.clients.splice(index, 1);
    }

    static getMUCMember(roomName, displayName, accountId, resource) {
        return `${roomName}@muc.${this.domain}/${encodeURIComponent(displayName)}:${accountId}:${resource}`;
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
        return crypto.randomUUID().replace(/-/g, '');
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
            this.mucs = {};

            this.wss.close();
            LoggerService.log('info', 'XMPP server stopped');
        }
    }
}

module.exports = XMPPManager;
