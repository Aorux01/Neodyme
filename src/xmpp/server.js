const WebSocket = require('ws');
const XMLBuilder = require('xmlbuilder');
const XMLParser = require('xml-parser');
const chalk = require('chalk');
const crypto = require('crypto');
const { Chalk } = require('chalk');
const c = chalk;
const LoggerService = require('../utils/logger');

// Import error handling
const { Errors, sendError } = require('../errors/errors');

class XMPPServer {
    constructor(config) {
        this.config = config;
        this.wss = null;
        this.clients = new Map();
        this.MUCs = new Map(); // Multi-User Chat rooms
        this.xmppDomain = config.xmppDomain || 'prod.ol.epicgames.com';
        this.startTime = Date.now();
    }

    log(level, message, data = null) {
        LoggerService.log(level, message, data);
    }

    async start() {
        try {
            this.wss = new WebSocket.Server({ 
                port: this.config.xmppPort,
                host: this.config.xmppHost || '0.0.0.0'
            });

            this.wss.on('listening', () => {
                LoggerService.log('success', `XMPP Server started on port ${this.config.xmppPort}`);
            });

            this.wss.on('connection', (ws, req) => {
                this.handleConnection(ws, req);
            });

            this.wss.on('error', (error) => {
                LoggerService.log('error', 'WebSocket server error', error);
            });

            // Start presence cleanup interval
            this.startPresenceCleanup();

        } catch (error) {
            LoggerService.log('error', 'Failed to start XMPP server', error);
            throw error;
        }
    }

    async stop() {
        if (this.wss) {
            // Notify all clients of server shutdown
            this.clients.forEach((client) => {
                try {
                    client.ws.send(XMLBuilder.create('close')
                        .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing')
                        .toString());
                    client.ws.close();
                } catch (error) {
                    // Client already disconnected
                }
            });

            this.clients.clear();
            this.MUCs.clear();

            return new Promise((resolve) => {
                this.wss.close(() => {
                    LoggerService.log('info', 'XMPP Server stopped');
                    resolve();
                });
            });
        }
    }

    handleConnection(ws, req) {
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        
        if (this.config.debugIps) {
            LoggerService.log('debug', `New XMPP connection from ${clientIp}`);
        }

        // Initialize client state
        const clientState = {
            ws: ws,
            id: this.generateId(),
            accountId: null,
            displayName: null,
            token: null,
            jid: null,
            resource: null,
            authenticated: false,
            joinedMUCs: new Set(),
            lastPresenceUpdate: {
                away: false,
                status: '{}'
            },
            connectionTime: Date.now(),
            ip: clientIp
        };

        ws.on('message', (data) => {
            this.handleMessage(clientState, data);
        });

        ws.on('close', () => {
            this.handleDisconnect(clientState);
        });

        ws.on('error', (error) => {
            LoggerService.log('error', `WebSocket error for client ${clientState.displayName || 'unknown'}`, error);
        });
    }

    async handleMessage(clientState, data) {
        try {
            if (Buffer.isBuffer(data)) data = data.toString();

            if (this.config.debugRequests) {
                LoggerService.log('debug', `Received XMPP message from ${clientState.displayName || 'unauthenticated'}`, data);
            }

            const msg = XMLParser(data);
            if (!msg || !msg.root || !msg.root.name) {
                return this.sendError(clientState.ws);
            }

            switch (msg.root.name) {
                case 'open':
                    await this.handleOpen(clientState, msg);
                    break;
                case 'auth':
                    await this.handleAuth(clientState, msg);
                    break;
                case 'iq':
                    await this.handleIQ(clientState, msg);
                    break;
                case 'presence':
                    await this.handlePresence(clientState, msg);
                    break;
                case 'message':
                    await this.handleXmppMessage(clientState, msg);
                    break;
                default:
                    LoggerService.log('warn', `Unknown XMPP message type: ${msg.root.name}`);
                    this.sendError(clientState.ws);
            }

        } catch (error) {
            LoggerService.log('error', 'Error handling XMPP message', error);
            this.sendError(clientState.ws);
        }
    }

    async handleOpen(clientState, msg) {
        // Send stream response
        clientState.ws.send(XMLBuilder.create('open')
            .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing')
            .attribute('from', this.xmppDomain)
            .attribute('id', clientState.id)
            .attribute('version', '1.0')
            .attribute('xml:lang', 'en')
            .toString());

        // Send features based on authentication state
        if (clientState.authenticated) {
            clientState.ws.send(XMLBuilder.create('stream:features')
                .attribute('xmlns:stream', 'http://etherx.jabber.org/streams')
                .element('ver').attribute('xmlns', 'urn:xmpp:features:rosterver').up()
                .element('starttls').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls').up()
                .element('bind').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind').up()
                .element('compression').attribute('xmlns', 'http://jabber.org/features/compress')
                    .element('method', 'zlib').up().up()
                .element('session').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-session').up()
                .toString());
        } else {
            clientState.ws.send(XMLBuilder.create('stream:features')
                .attribute('xmlns:stream', 'http://etherx.jabber.org/streams')
                .element('mechanisms').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
                    .element('mechanism', 'PLAIN').up().up()
                .element('ver').attribute('xmlns', 'urn:xmpp:features:rosterver').up()
                .element('starttls').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls').up()
                .element('compression').attribute('xmlns', 'http://jabber.org/features/compress')
                    .element('method', 'zlib').up().up()
                .element('auth').attribute('xmlns', 'http://jabber.org/features/iq-auth').up()
                .toString());
        }
    }

    async handleAuth(clientState, msg) {
        if (!msg.root.content) {
            return this.sendError(clientState.ws);
        }

        try {
            // Decode PLAIN auth (format: \0username\0password)
            const decoded = Buffer.from(msg.root.content, 'base64').toString();
            const parts = decoded.split('\0');
            
            if (parts.length !== 3) {
                return this.sendError(clientState.ws);
            }

            const [, username, token] = parts;

            // Validate token with auth service
            const authResult = await this.validateToken(token);
            if (!authResult.valid) {
                LoggerService.log('warn', `Authentication failed for ${username}`);
                clientState.ws.send(XMLBuilder.create('failure')
                    .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
                    .element('not-authorized')
                    .toString());
                return;
            }

            // Check if user is already connected
            if (this.clients.has(authResult.accountId)) {
                LoggerService.log('warn', `User ${username} already connected`);
                clientState.ws.send(XMLBuilder.create('failure')
                    .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
                    .element('conflict')
                    .toString());
                return;
            }

            // Update client state
            clientState.accountId = authResult.accountId;
            clientState.displayName = authResult.displayName;
            clientState.token = token;
            clientState.authenticated = true;

            LoggerService.log('success', `User ${clientState.displayName} authenticated successfully`);

            // Send success
            clientState.ws.send(XMLBuilder.create('success')
                .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
                .toString());

        } catch (error) {
            LoggerService.log('error', 'Authentication error', error);
            this.sendError(clientState.ws);
        }
    }

    async handleIQ(clientState, msg) {
        if (!clientState.authenticated) {
            return this.sendError(clientState.ws);
        }

        const iqId = msg.root.attributes.id;

        switch (iqId) {
            case '_xmpp_bind1':
                await this.handleBind(clientState, msg);
                break;
            case '_xmpp_session1':
                await this.handleSession(clientState, msg);
                break;
            default:
                // Echo back as success for other IQ requests
                clientState.ws.send(XMLBuilder.create('iq')
                    .attribute('to', clientState.jid)
                    .attribute('from', this.xmppDomain)
                    .attribute('id', iqId)
                    .attribute('xmlns', 'jabber:client')
                    .attribute('type', 'result')
                    .toString());
        }
    }

    async handleBind(clientState, msg) {
        const bindElement = msg.root.children.find(c => c.name === 'bind');
        if (!bindElement) {
            return this.sendError(clientState.ws);
        }

        const resourceElement = bindElement.children.find(c => c.name === 'resource');
        if (!resourceElement || !resourceElement.content) {
            return this.sendError(clientState.ws);
        }

        clientState.resource = resourceElement.content;
        clientState.jid = `${clientState.accountId}@${this.xmppDomain}/${clientState.resource}`;

        // Add client to active clients
        this.clients.set(clientState.accountId, clientState);

        // Send bind result
        clientState.ws.send(XMLBuilder.create('iq')
            .attribute('to', clientState.jid)
            .attribute('id', '_xmpp_bind1')
            .attribute('xmlns', 'jabber:client')
            .attribute('type', 'result')
            .element('bind')
                .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind')
                .element('jid', clientState.jid).up().up()
            .toString());

        LoggerService.log('info', `Client bound: ${clientState.jid}`);
    }

    async handleSession(clientState, msg) {
        if (!this.clients.has(clientState.accountId)) {
            return this.sendError(clientState.ws);
        }

        // Send session result
        clientState.ws.send(XMLBuilder.create('iq')
            .attribute('to', clientState.jid)
            .attribute('from', this.xmppDomain)
            .attribute('id', '_xmpp_session1')
            .attribute('xmlns', 'jabber:client')
            .attribute('type', 'result')
            .toString());

        // Send presence from friends
        await this.sendFriendsPresence(clientState);
    }

    async handlePresence(clientState, msg) {
        if (!this.clients.has(clientState.accountId)) {
            return this.sendError(clientState.ws);
        }

        const type = msg.root.attributes.type;

        if (type === 'unavailable') {
            // Handle MUC leave
            if (msg.root.attributes.to && msg.root.attributes.to.includes('@muc.')) {
                await this.handleMUCLeave(clientState, msg);
            }
        } else {
            // Check for MUC join
            const mucElement = msg.root.children.find(c => c.name === 'x' || c.name === 'muc:x');
            if (mucElement && msg.root.attributes.to) {
                await this.handleMUCJoin(clientState, msg);
            } else {
                // Handle presence update
                await this.handlePresenceUpdate(clientState, msg);
            }
        }
    }

    async handlePresenceUpdate(clientState, msg) {
        const statusElement = msg.root.children.find(c => c.name === 'status');
        if (!statusElement || !statusElement.content) {
            return;
        }

        try {
            const status = JSON.parse(statusElement.content);
            if (Array.isArray(status)) {
                return;
            }

            const showElement = msg.root.children.find(c => c.name === 'show');
            const away = !!showElement;

            clientState.lastPresenceUpdate = {
                away: away,
                status: statusElement.content
            };

            // Update presence for friends
            await this.broadcastPresenceToFriends(clientState);

            if (this.config.debug) {
                LoggerService.log('debug', `Presence updated for ${clientState.displayName}`, { away, status });
            }

        } catch (error) {
            LoggerService.log('error', 'Invalid presence status JSON', error);
        }
    }

    async handleXmppMessage(clientState, msg) {
        if (!this.clients.has(clientState.accountId)) {
            return this.sendError(clientState.ws);
        }

        const bodyElement = msg.root.children.find(c => c.name === 'body');
        if (!bodyElement || !bodyElement.content) {
            return;
        }

        const messageType = msg.root.attributes.type;
        const to = msg.root.attributes.to;
        const body = bodyElement.content;

        // Check message length
        if (body.length >= 300) {
            LoggerService.log('warn', `Message too long from ${clientState.displayName}`);
            return;
        }

        switch (messageType) {
            case 'chat':
                await this.handleChatMessage(clientState, to, body);
                break;
            case 'groupchat':
                await this.handleGroupChatMessage(clientState, to, body);
                break;
            default:
                // Handle JSON messages (party invites, etc.)
                if (this.isJSON(body)) {
                    await this.handleJsonMessage(clientState, msg, body);
                }
        }
    }

    async handleChatMessage(clientState, to, body) {
        if (!to) return;

        const receiverJid = to.split('/')[0];
        const receiver = Array.from(this.clients.values()).find(c => c.jid && c.jid.split('/')[0] === receiverJid);

        if (!receiver) {
            LoggerService.log('warn', `Receiver not found: ${to}`);
            return;
        }

        if (receiver.accountId === clientState.accountId) {
            LoggerService.log('warn', `Self-message attempt by ${clientState.displayName}`);
            return;
        }

        // Send message to receiver
        receiver.ws.send(XMLBuilder.create('message')
            .attribute('to', receiver.jid)
            .attribute('from', clientState.jid)
            .attribute('xmlns', 'jabber:client')
            .attribute('type', 'chat')
            .element('body', body).up()
            .toString());

        if (this.config.debug) {
            LoggerService.log('debug', `Chat message from ${clientState.displayName} to ${receiver.displayName}`);
        }
    }

    async handleGroupChatMessage(clientState, to, body) {
        if (!to) return;

        const roomName = to.split('@')[0];
        const room = this.MUCs.get(roomName);

        if (!room) {
            LoggerService.log('warn', `MUC room not found: ${roomName}`);
            return;
        }

        if (!room.members.has(clientState.accountId)) {
            LoggerService.log('warn', `User ${clientState.displayName} not in room ${roomName}`);
            return;
        }

        // Broadcast to all room members
        room.members.forEach(memberAccountId => {
            const member = this.clients.get(memberAccountId);
            if (!member) return;

            member.ws.send(XMLBuilder.create('message')
                .attribute('to', member.jid)
                .attribute('from', this.getMUCJid(roomName, clientState))
                .attribute('xmlns', 'jabber:client')
                .attribute('type', 'groupchat')
                .element('body', body).up()
                .toString());
        });

        if (this.config.debug) {
            LoggerService.log('debug', `Group chat message in ${roomName} from ${clientState.displayName}`);
        }
    }

    async handleJsonMessage(clientState, msg, body) {
        try {
            const jsonBody = JSON.parse(body);
            
            if (Array.isArray(jsonBody) || typeof jsonBody.type !== 'string') {
                return;
            }

            if (!msg.root.attributes.to || !msg.root.attributes.id) {
                return;
            }

            // Forward the JSON message
            this.sendXmppMessageToClient(clientState.jid, msg, body);

            if (this.config.debug) {
                LoggerService.log('debug', `JSON message type ${jsonBody.type} from ${clientState.displayName}`);
            }

        } catch (error) {
            LoggerService.log('error', 'Invalid JSON message', error);
        }
    }

    async handleMUCJoin(clientState, msg) {
        const roomName = msg.root.attributes.to.split('@')[0];

        if (!roomName.toLowerCase().startsWith('party-')) {
            LoggerService.log('warn', `Invalid MUC room name: ${roomName}`);
            return;
        }

        // Create room if it doesn't exist
        if (!this.MUCs.has(roomName)) {
            this.MUCs.set(roomName, {
                name: roomName,
                members: new Set(),
                createdAt: Date.now()
            });
        }

        const room = this.MUCs.get(roomName);

        if (room.members.has(clientState.accountId)) {
            return; // Already in room
        }

        room.members.add(clientState.accountId);
        clientState.joinedMUCs.add(roomName);

        const mucJid = this.getMUCJid(roomName, clientState);

        // Send join confirmation
        clientState.ws.send(XMLBuilder.create('presence')
            .attribute('to', clientState.jid)
            .attribute('from', mucJid)
            .attribute('xmlns', 'jabber:client')
            .element('x').attribute('xmlns', 'http://jabber.org/protocol/muc#user')
                .element('item')
                    .attribute('nick', this.getMUCNick(clientState))
                    .attribute('jid', clientState.jid)
                    .attribute('role', 'participant')
                    .attribute('affiliation', 'none').up()
                .element('status').attribute('code', '110').up()
                .element('status').attribute('code', '100').up()
                .element('status').attribute('code', '170').up()
                .element('status').attribute('code', '201').up().up()
            .toString());

        // Send presence of all room members
        room.members.forEach(memberAccountId => {
            const member = this.clients.get(memberAccountId);
            if (!member) return;

            // Send existing members to new member
            if (memberAccountId !== clientState.accountId) {
                clientState.ws.send(XMLBuilder.create('presence')
                    .attribute('from', this.getMUCJid(roomName, member))
                    .attribute('to', clientState.jid)
                    .attribute('xmlns', 'jabber:client')
                    .element('x').attribute('xmlns', 'http://jabber.org/protocol/muc#user')
                        .element('item')
                            .attribute('nick', this.getMUCNick(member))
                            .attribute('jid', member.jid)
                            .attribute('role', 'participant')
                            .attribute('affiliation', 'none').up().up()
                    .toString());
            }

            // Send new member to existing members
            if (memberAccountId !== clientState.accountId) {
                member.ws.send(XMLBuilder.create('presence')
                    .attribute('from', mucJid)
                    .attribute('to', member.jid)
                    .attribute('xmlns', 'jabber:client')
                    .element('x').attribute('xmlns', 'http://jabber.org/protocol/muc#user')
                        .element('item')
                            .attribute('nick', this.getMUCNick(clientState))
                            .attribute('jid', clientState.jid)
                            .attribute('role', 'participant')
                            .attribute('affiliation', 'none').up().up()
                    .toString());
            }
        });

        LoggerService.log('info', `${clientState.displayName} joined MUC ${roomName}`);
    }

    async handleMUCLeave(clientState, msg) {
        const roomName = msg.root.attributes.to.split('@')[0];
        const room = this.MUCs.get(roomName);

        if (!room || !room.members.has(clientState.accountId)) {
            return;
        }

        room.members.delete(clientState.accountId);
        clientState.joinedMUCs.delete(roomName);

        const mucJid = this.getMUCJid(roomName, clientState);

        // Send leave confirmation
        clientState.ws.send(XMLBuilder.create('presence')
            .attribute('to', clientState.jid)
            .attribute('from', mucJid)
            .attribute('xmlns', 'jabber:client')
            .attribute('type', 'unavailable')
            .element('x').attribute('xmlns', 'http://jabber.org/protocol/muc#user')
                .element('item')
                    .attribute('nick', this.getMUCNick(clientState))
                    .attribute('jid', clientState.jid)
                    .attribute('role', 'none').up()
                .element('status').attribute('code', '110').up()
                .element('status').attribute('code', '100').up()
                .element('status').attribute('code', '170').up().up()
            .toString());

        // Clean up empty rooms
        if (room.members.size === 0) {
            this.MUCs.delete(roomName);
        }

        LoggerService.log('info', `${clientState.displayName} left MUC ${roomName}`);
    }

    async handleDisconnect(clientState) {
        if (!clientState.accountId) {
            return; // Was never authenticated
        }

        LoggerService.log('info', `Client disconnected: ${clientState.displayName}`);

        // Remove from active clients
        this.clients.delete(clientState.accountId);

        // Leave all MUCs
        clientState.joinedMUCs.forEach(roomName => {
            const room = this.MUCs.get(roomName);
            if (room) {
                room.members.delete(clientState.accountId);
                if (room.members.size === 0) {
                    this.MUCs.delete(roomName);
                }
            }
        });

        // Notify friends of offline status
        await this.broadcastPresenceToFriends(clientState, true);

        // Send party member exit if applicable
        try {
            const lastStatus = JSON.parse(clientState.lastPresenceUpdate.status);
            let partyId = null;

            if (lastStatus.Properties) {
                for (const key in lastStatus.Properties) {
                    if (key.toLowerCase().startsWith('party.joininfo')) {
                        const joinInfo = lastStatus.Properties[key];
                        if (joinInfo && joinInfo.partyId) {
                            partyId = joinInfo.partyId;
                            break;
                        }
                    }
                }
            }

            if (partyId) {
                this.broadcastPartyMemberExit(clientState, partyId);
            }
        } catch (error) {
            // Ignore parsing errors
        }
    }

    broadcastPartyMemberExit(exitingClient, partyId) {
        this.clients.forEach((client) => {
            if (client.accountId === exitingClient.accountId) return;

            client.ws.send(XMLBuilder.create('message')
                .attribute('id', this.generateId().replace(/-/g, '').toUpperCase())
                .attribute('from', exitingClient.jid)
                .attribute('xmlns', 'jabber:client')
                .attribute('to', client.jid)
                .element('body', JSON.stringify({
                    type: 'com.epicgames.party.memberexited',
                    payload: {
                        partyId: partyId,
                        memberId: exitingClient.accountId,
                        wasKicked: false
                    },
                    timestamp: new Date().toISOString()
                })).up()
                .toString());
        });
    }

    async validateToken(token) {
        // This should integrate with your auth service
        // For now, returning a mock validation
        const fs = require('fs').promises;
        const path = require('path');
        
        try {
            const clientsPath = path.join(process.cwd(), 'data', 'clients.json');
            const clientsData = await fs.readFile(clientsPath, 'utf8');
            const clients = JSON.parse(clientsData);
            
            const client = clients.find(c => c.token === token);
            if (client) {
                return {
                    valid: true,
                    accountId: client.accountId,
                    displayName: client.displayName
                };
            }
        } catch (error) {
            LoggerService.log('error', 'Error validating token', error);
        }

        return { valid: false };
    }

    async sendFriendsPresence(clientState) {
        // This should integrate with your friends service
        // For now, sending presence of all online clients as an example
        this.clients.forEach((friend) => {
            if (friend.accountId === clientState.accountId) return;

            const xml = XMLBuilder.create('presence')
                .attribute('to', clientState.jid)
                .attribute('xmlns', 'jabber:client')
                .attribute('from', friend.jid)
                .attribute('type', 'available');

            if (friend.lastPresenceUpdate.away) {
                xml.element('show', 'away').up();
            }
            
            xml.element('status', friend.lastPresenceUpdate.status).up();

            clientState.ws.send(xml.toString());
        });
    }

    async broadcastPresenceToFriends(clientState, offline = false) {
        // This should integrate with your friends service
        // For now, broadcasting to all online clients as an example
        this.clients.forEach((friend) => {
            if (friend.accountId === clientState.accountId) return;

            const xml = XMLBuilder.create('presence')
                .attribute('to', friend.jid)
                .attribute('xmlns', 'jabber:client')
                .attribute('from', clientState.jid)
                .attribute('type', offline ? 'unavailable' : 'available');

            if (!offline && clientState.lastPresenceUpdate.away) {
                xml.element('show', 'away').up();
            }
            
            if (!offline) {
                xml.element('status', clientState.lastPresenceUpdate.status).up();
            }

            friend.ws.send(xml.toString());
        });
    }

    sendXmppMessageToClient(senderJid, msg, body) {
        const to = msg.root.attributes.to;
        const receiver = Array.from(this.clients.values()).find(c => 
            c.jid === to || (c.jid && c.jid.split('/')[0] === to.split('/')[0])
        );

        if (!receiver) {
            LoggerService.log('warn', `Cannot send message to ${to}: receiver not found`);
            return;
        }

        receiver.ws.send(XMLBuilder.create('message')
            .attribute('from', senderJid)
            .attribute('id', msg.root.attributes.id)
            .attribute('to', receiver.jid)
            .attribute('xmlns', 'jabber:client')
            .element('body', body).up()
            .toString());
    }

    getMUCJid(roomName, clientState) {
        return `${roomName}@muc.${this.xmppDomain}/${this.getMUCNick(clientState)}`;
    }

    getMUCNick(clientState) {
        return `${encodeURI(clientState.displayName)}:${clientState.accountId}:${clientState.resource}`;
    }

    sendError(ws) {
        try {
            ws.send(XMLBuilder.create('close')
                .attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing')
                .toString());
            ws.close();
        } catch (error) {
            // WebSocket already closed
        }
    }

    generateId() {
        return crypto.randomUUID();
    }

    isJSON(str) {
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    }

    startPresenceCleanup() {
        // Clean up stale presence data every 5 minutes
        setInterval(() => {
            const now = Date.now();
            const timeout = 300000; // 5 minutes

            this.clients.forEach((client, accountId) => {
                if (now - client.connectionTime > timeout && !client.ws.readyState === 1) {
                    LoggerService.log('info', `Cleaning up stale client: ${client.displayName}`);
                    this.handleDisconnect(client);
                }
            });

            // Clean up empty MUC rooms
            this.MUCs.forEach((room, roomName) => {
                if (room.members.size === 0 && now - room.createdAt > timeout) {
                    LoggerService.log('info', `Cleaning up empty MUC room: ${roomName}`);
                    this.MUCs.delete(roomName);
                }
            });
        }, 300000);
    }

    getStats() {
        return {
            connectedClients: this.clients.size,
            activeRooms: this.MUCs.size,
            uptime: Date.now() - this.startTime,
            clients: Array.from(this.clients.values()).map(c => ({
                accountId: c.accountId,
                displayName: c.displayName,
                jid: c.jid,
                connectedAt: new Date(c.connectionTime).toISOString(),
                joinedRooms: Array.from(c.joinedMUCs)
            })),
            rooms: Array.from(this.MUCs.entries()).map(([name, room]) => ({
                name: name,
                memberCount: room.members.size,
                members: Array.from(room.members)
            }))
        };
    }
}

module.exports = XMPPServer;