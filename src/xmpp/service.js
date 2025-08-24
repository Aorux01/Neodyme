const XMLBuilder = require('xmlbuilder');
const XMPPUtils = require('./utils');
const { Errors } = require('../errors/errors');

class XMPPService {
    constructor(xmppServer) {
        this.xmppServer = xmppServer;
        this.messageHandlers = new Map();
        this.initializeHandlers();
    }

    initializeHandlers() {
        // Party message handlers
        this.registerHandler('com.epicgames.party.invitation', this.handlePartyInvitation.bind(this));
        this.registerHandler('com.epicgames.party.join', this.handlePartyJoin.bind(this));
        this.registerHandler('com.epicgames.party.leave', this.handlePartyLeave.bind(this));
        this.registerHandler('com.epicgames.party.kick', this.handlePartyKick.bind(this));
        this.registerHandler('com.epicgames.party.promote', this.handlePartyPromote.bind(this));
        this.registerHandler('com.epicgames.party.update', this.handlePartyUpdate.bind(this));
        
        // Friend message handlers
        this.registerHandler('com.epicgames.friends.request', this.handleFriendRequest.bind(this));
        this.registerHandler('com.epicgames.friends.accept', this.handleFriendAccept.bind(this));
        this.registerHandler('com.epicgames.friends.reject', this.handleFriendReject.bind(this));
        this.registerHandler('com.epicgames.friends.remove', this.handleFriendRemove.bind(this));
        this.registerHandler('com.epicgames.friends.block', this.handleFriendBlock.bind(this));
        
        // Presence handlers
        this.registerHandler('com.epicgames.presence.update', this.handlePresenceUpdate.bind(this));
        
        // Chat handlers
        this.registerHandler('com.epicgames.chat.whisper', this.handleWhisper.bind(this));
    }

    registerHandler(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    async processMessage(fromClient, message) {
        try {
            const parsedMessage = JSON.parse(message);
            
            if (!parsedMessage.type) {
                throw new Error('Message type not specified');
            }

            const handler = this.messageHandlers.get(parsedMessage.type);
            if (!handler) {
                this.xmppServer.log('warn', `No handler for message type: ${parsedMessage.type}`);
                return false;
            }

            return await handler(fromClient, parsedMessage);
        } catch (error) {
            this.xmppServer.log('error', 'Error processing XMPP message', error);
            return false;
        }
    }

    // Party Handlers
    async handlePartyInvitation(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.partyId || !payload.inviteeId) {
            return false;
        }

        const invitee = this.xmppServer.clients.get(payload.inviteeId);
        if (!invitee) {
            return false;
        }

        // Send invitation to invitee
        this.sendMessage(fromClient.jid, invitee.jid, JSON.stringify({
            type: 'com.epicgames.party.invitation',
            payload: {
                partyId: payload.partyId,
                inviterId: fromClient.accountId,
                inviterDisplayName: fromClient.displayName,
                partyTypeId: payload.partyTypeId || 289,
                partyFlags: payload.partyFlags || -2024557306,
                notAcceptingReason: payload.notAcceptingReason || 0,
                buildId: payload.buildId || '1:3:',
                ...payload
            },
            timestamp: new Date().toISOString()
        }));

        return true;
    }

    async handlePartyJoin(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.partyId) {
            return false;
        }

        const roomName = XMPPUtils.formatRoomName(payload.partyId);
        
        // Join MUC room for party chat
        const joinPresence = XMLBuilder.create('presence')
            .attribute('to', `${roomName}@muc.${this.xmppServer.xmppDomain}`)
            .attribute('from', fromClient.jid)
            .attribute('xmlns', 'jabber:client')
            .element('x', { xmlns: 'http://jabber.org/protocol/muc' })
            .toString();

        // Process the join through normal presence handling
        fromClient.ws.send(joinPresence);

        // Notify party members
        this.broadcastToParty(payload.partyId, {
            type: 'com.epicgames.party.memberjoined',
            payload: {
                partyId: payload.partyId,
                memberId: fromClient.accountId,
                displayName: fromClient.displayName,
                platform: payload.platform || 'WIN',
                joinTime: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        }, fromClient.accountId);

        return true;
    }

    async handlePartyLeave(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.partyId) {
            return false;
        }

        const roomName = XMPPUtils.formatRoomName(payload.partyId);
        
        // Leave MUC room
        const leavePresence = XMLBuilder.create('presence')
            .attribute('to', `${roomName}@muc.${this.xmppServer.xmppDomain}`)
            .attribute('from', fromClient.jid)
            .attribute('type', 'unavailable')
            .attribute('xmlns', 'jabber:client')
            .toString();

        fromClient.ws.send(leavePresence);

        // Notify party members
        this.broadcastToParty(payload.partyId, {
            type: 'com.epicgames.party.memberexited',
            payload: {
                partyId: payload.partyId,
                memberId: fromClient.accountId,
                wasKicked: false
            },
            timestamp: new Date().toISOString()
        }, fromClient.accountId);

        return true;
    }

    async handlePartyKick(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.partyId || !payload.memberId) {
            return false;
        }

        const kickedMember = this.xmppServer.clients.get(payload.memberId);
        if (!kickedMember) {
            return false;
        }

        // Force leave the kicked member
        await this.handlePartyLeave(kickedMember, {
            payload: { partyId: payload.partyId }
        });

        // Notify party members
        this.broadcastToParty(payload.partyId, {
            type: 'com.epicgames.party.memberkicked',
            payload: {
                partyId: payload.partyId,
                memberId: payload.memberId,
                kickedBy: fromClient.accountId,
                wasKicked: true
            },
            timestamp: new Date().toISOString()
        });

        // Notify kicked member
        this.sendMessage(fromClient.jid, kickedMember.jid, JSON.stringify({
            type: 'com.epicgames.party.kicked',
            payload: {
                partyId: payload.partyId,
                kickedBy: fromClient.accountId
            },
            timestamp: new Date().toISOString()
        }));

        return true;
    }

    async handlePartyPromote(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.partyId || !payload.memberId) {
            return false;
        }

        // Notify party members
        this.broadcastToParty(payload.partyId, {
            type: 'com.epicgames.party.promoted',
            payload: {
                partyId: payload.partyId,
                memberId: payload.memberId,
                promotedBy: fromClient.accountId,
                newRole: 'CAPTAIN'
            },
            timestamp: new Date().toISOString()
        });

        return true;
    }

    async handlePartyUpdate(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.partyId) {
            return false;
        }

        // Broadcast party update to all members
        this.broadcastToParty(payload.partyId, {
            type: 'com.epicgames.party.updated',
            payload: payload,
            timestamp: new Date().toISOString()
        });

        return true;
    }

    // Friend Handlers
    async handleFriendRequest(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.friendId) {
            return false;
        }

        const friend = this.xmppServer.clients.get(payload.friendId);
        if (!friend) {
            return false;
        }

        // Send friend request notification
        this.sendMessage(fromClient.jid, friend.jid, JSON.stringify({
            type: 'com.epicgames.friends.request',
            payload: {
                accountId: fromClient.accountId,
                displayName: fromClient.displayName,
                status: 'PENDING'
            },
            timestamp: new Date().toISOString()
        }));

        return true;
    }

    async handleFriendAccept(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.friendId) {
            return false;
        }

        const friend = this.xmppServer.clients.get(payload.friendId);
        if (!friend) {
            return false;
        }

        // Send acceptance notification
        this.sendMessage(fromClient.jid, friend.jid, JSON.stringify({
            type: 'com.epicgames.friends.accept',
            payload: {
                accountId: fromClient.accountId,
                displayName: fromClient.displayName,
                status: 'ACCEPTED'
            },
            timestamp: new Date().toISOString()
        }));

        // Exchange presence information
        await this.exchangePresence(fromClient, friend);

        return true;
    }

    async handleFriendReject(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.friendId) {
            return false;
        }

        const friend = this.xmppServer.clients.get(payload.friendId);
        if (friend) {
            this.sendMessage(fromClient.jid, friend.jid, JSON.stringify({
                type: 'com.epicgames.friends.reject',
                payload: {
                    accountId: fromClient.accountId,
                    status: 'REJECTED'
                },
                timestamp: new Date().toISOString()
            }));
        }

        return true;
    }

    async handleFriendRemove(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.friendId) {
            return false;
        }

        const friend = this.xmppServer.clients.get(payload.friendId);
        if (friend) {
            // Send removal notification
            this.sendMessage(fromClient.jid, friend.jid, JSON.stringify({
                type: 'com.epicgames.friends.remove',
                payload: {
                    accountId: fromClient.accountId,
                    reason: payload.reason || 'DELETED'
                },
                timestamp: new Date().toISOString()
            }));

            // Send unavailable presence
            const unavailablePresence = XMLBuilder.create('presence')
                .attribute('from', fromClient.jid)
                .attribute('to', friend.jid)
                .attribute('type', 'unavailable')
                .attribute('xmlns', 'jabber:client')
                .toString();

            friend.ws.send(unavailablePresence);

            // Remove friend's presence from this client
            const friendUnavailable = XMLBuilder.create('presence')
                .attribute('from', friend.jid)
                .attribute('to', fromClient.jid)
                .attribute('type', 'unavailable')
                .attribute('xmlns', 'jabber:client')
                .toString();

            fromClient.ws.send(friendUnavailable);
        }

        return true;
    }

    async handleFriendBlock(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.friendId) {
            return false;
        }

        // Similar to remove but with blocked status
        await this.handleFriendRemove(fromClient, {
            payload: {
                friendId: payload.friendId,
                reason: 'BLOCKED'
            }
        });

        return true;
    }

    // Presence Handlers
    async handlePresenceUpdate(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.status) {
            return false;
        }

        // Update client's presence
        fromClient.lastPresenceUpdate = {
            away: payload.away || false,
            status: JSON.stringify(payload.status)
        };

        // Broadcast to friends
        await this.xmppServer.broadcastPresenceToFriends(fromClient);

        return true;
    }

    // Chat Handlers
    async handleWhisper(fromClient, message) {
        const { payload } = message;
        
        if (!payload || !payload.recipientId || !payload.message) {
            return false;
        }

        const recipient = this.xmppServer.clients.get(payload.recipientId);
        if (!recipient) {
            return false;
        }

        // Validate message
        const validation = XMPPUtils.validateMessageBody(payload.message);
        if (!validation.valid) {
            this.xmppServer.log('warn', `Invalid whisper message: ${validation.error}`);
            return false;
        }

        // Send whisper
        this.sendChatMessage(fromClient.jid, recipient.jid, payload.message);

        return true;
    }

    // Helper Methods
    sendMessage(from, to, body) {
        const messageId = XMPPUtils.generateMessageId();
        
        const message = XMLBuilder.create('message')
            .attribute('from', from)
            .attribute('to', to)
            .attribute('id', messageId)
            .attribute('xmlns', 'jabber:client')
            .element('body', body).up()
            .toString();

        const recipient = Array.from(this.xmppServer.clients.values())
            .find(c => c.jid === to || (c.jid && c.jid.split('/')[0] === to.split('/')[0]));

        if (recipient) {
            recipient.ws.send(message);
        }
    }

    sendChatMessage(from, to, text) {
        const message = XMLBuilder.create('message')
            .attribute('from', from)
            .attribute('to', to)
            .attribute('type', 'chat')
            .attribute('xmlns', 'jabber:client')
            .element('body', XMPPUtils.sanitizeXML(text)).up()
            .toString();

        const recipient = Array.from(this.xmppServer.clients.values())
            .find(c => c.jid === to || (c.jid && c.jid.split('/')[0] === to.split('/')[0]));

        if (recipient) {
            recipient.ws.send(message);
        }
    }

    broadcastToParty(partyId, message, excludeAccountId = null) {
        const roomName = XMPPUtils.formatRoomName(partyId);
        const room = this.xmppServer.MUCs.get(roomName);

        if (!room) {
            return;
        }

        const messageStr = JSON.stringify(message);

        room.members.forEach(memberAccountId => {
            if (memberAccountId === excludeAccountId) return;

            const member = this.xmppServer.clients.get(memberAccountId);
            if (!member) return;

            this.sendMessage('xmpp-service@' + this.xmppServer.xmppDomain, member.jid, messageStr);
        });
    }

    async exchangePresence(client1, client2) {
        // Send client1's presence to client2
        const presence1to2 = XMLBuilder.create('presence')
            .attribute('from', client1.jid)
            .attribute('to', client2.jid)
            .attribute('xmlns', 'jabber:client');

        if (client1.lastPresenceUpdate.away) {
            presence1to2.element('show', 'away').up();
        }
        presence1to2.element('status', client1.lastPresenceUpdate.status).up();

        client2.ws.send(presence1to2.toString());

        // Send client2's presence to client1
        const presence2to1 = XMLBuilder.create('presence')
            .attribute('from', client2.jid)
            .attribute('to', client1.jid)
            .attribute('xmlns', 'jabber:client');

        if (client2.lastPresenceUpdate.away) {
            presence2to1.element('show', 'away').up();
        }
        presence2to1.element('status', client2.lastPresenceUpdate.status).up();

        client1.ws.send(presence2to1.toString());
    }

    // External API methods for other services to use
    async sendPartyInvite(fromAccountId, toAccountId, partyData) {
        const fromClient = this.xmppServer.clients.get(fromAccountId);
        const toClient = this.xmppServer.clients.get(toAccountId);

        if (!fromClient || !toClient) {
            return false;
        }

        return await this.handlePartyInvitation(fromClient, {
            payload: {
                partyId: partyData.partyId,
                inviteeId: toAccountId,
                ...partyData
            }
        });
    }

    async notifyPartyUpdate(partyId, updateData) {
        this.broadcastToParty(partyId, {
            type: 'com.epicgames.party.updated',
            payload: updateData,
            timestamp: new Date().toISOString()
        });
    }

    async sendFriendRequest(fromAccountId, toAccountId) {
        const fromClient = this.xmppServer.clients.get(fromAccountId);
        if (!fromClient) {
            return false;
        }

        return await this.handleFriendRequest(fromClient, {
            payload: {
                friendId: toAccountId
            }
        });
    }

    async updateUserPresence(accountId, presenceData) {
        const client = this.xmppServer.clients.get(accountId);
        if (!client) {
            return false;
        }

        return await this.handlePresenceUpdate(client, {
            payload: {
                status: presenceData,
                away: presenceData.away || false
            }
        });
    }

    isUserOnline(accountId) {
        return this.xmppServer.clients.has(accountId);
    }

    getOnlineUsers() {
        return Array.from(this.xmppServer.clients.keys());
    }

    getUserPresence(accountId) {
        const client = this.xmppServer.clients.get(accountId);
        if (!client) {
            return null;
        }

        try {
            return {
                online: true,
                away: client.lastPresenceUpdate.away,
                status: JSON.parse(client.lastPresenceUpdate.status)
            };
        } catch (error) {
            return {
                online: true,
                away: false,
                status: {}
            };
        }
    }

    getPartyMembers(partyId) {
        const roomName = XMPPUtils.formatRoomName(partyId);
        const room = this.xmppServer.MUCs.get(roomName);

        if (!room) {
            return [];
        }

        return Array.from(room.members);
    }

    async kickFromParty(kickerAccountId, targetAccountId, partyId) {
        const kicker = this.xmppServer.clients.get(kickerAccountId);
        if (!kicker) {
            return false;
        }

        return await this.handlePartyKick(kicker, {
            payload: {
                partyId: partyId,
                memberId: targetAccountId
            }
        });
    }

    async promotePartyLeader(promoterAccountId, newLeaderAccountId, partyId) {
        const promoter = this.xmppServer.clients.get(promoterAccountId);
        if (!promoter) {
            return false;
        }

        return await this.handlePartyPromote(promoter, {
            payload: {
                partyId: partyId,
                memberId: newLeaderAccountId
            }
        });
    }
}

// Export a singleton instance
let serviceInstance = null;

module.exports = {
    XMPPService,
    
    getService: (xmppServer) => {
        if (!serviceInstance && xmppServer) {
            serviceInstance = new XMPPService(xmppServer);
        }
        return serviceInstance;
    },
    
    resetService: () => {
        serviceInstance = null;
    }
};