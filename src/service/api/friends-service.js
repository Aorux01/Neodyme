const XmppService = require('../xmpp/xmpp-service');
const LoggerService = require('../logger/logger-service');

class FriendsService {
    /**
     * Send XMPP notification for a friend request
     * @param {string} toAccountId - The recipient's account ID
     * @param {string} fromAccountId - The sender's account ID
     * @param {string} direction - 'INBOUND' or 'OUTBOUND'
     * @param {string} timestamp - ISO timestamp
     */
    static sendXmppFriendRequest(toAccountId, fromAccountId, direction, timestamp) {
        try {
            const ts = timestamp || new Date().toISOString();

            LoggerService.log('info', `XMPP Friend Request: to=${toAccountId}, from=${fromAccountId}, direction=${direction}`);

            // Check if recipient is online
            const isOnline = XmppService.isOnline(toAccountId);
            LoggerService.log('info', `XMPP recipient ${toAccountId} is ${isOnline ? 'online' : 'offline'}`);

            // Message 1: Friend object (like LawinServer)
            const friendMessage = {
                payload: {
                    accountId: fromAccountId,
                    status: 'PENDING',
                    direction: direction,
                    created: ts,
                    favorite: false
                },
                type: 'com.epicgames.friends.core.apiobjects.Friend',
                timestamp: ts
            };

            const sent1 = XmppService.sendMessageToId(toAccountId, friendMessage);
            LoggerService.log('info', `XMPP Friend message sent to ${toAccountId}: ${sent1}`);

            // Message 2: Friendship request notification (like LawinServer)
            const friendshipRequestMessage = {
                type: 'FRIENDSHIP_REQUEST',
                timestamp: ts,
                from: fromAccountId,
                status: 'PENDING'
            };

            const sent2 = XmppService.sendMessageToId(toAccountId, friendshipRequestMessage);
            LoggerService.log('info', `XMPP Friendship request message sent to ${toAccountId}: ${sent2}`);

            return sent2;
        } catch (error) {
            LoggerService.log('error', `Failed to send XMPP friend request: ${error.message}`);
            return false;
        }
    }

    /**
     * Send XMPP notification for an accepted friend request
     * @param {string} toAccountId - The recipient's account ID
     * @param {string} friendAccountId - The friend's account ID
     */
    static sendXmppFriendAccepted(toAccountId, friendAccountId) {
        try {
            const timestamp = new Date().toISOString();

            // Message 1: Friend object (like LawinServer)
            const friendMessage = {
                payload: {
                    accountId: friendAccountId,
                    status: 'ACCEPTED',
                    direction: 'OUTBOUND',
                    created: timestamp,
                    favorite: false
                },
                type: 'com.epicgames.friends.core.apiobjects.Friend',
                timestamp: timestamp
            };

            XmppService.sendMessageToId(toAccountId, friendMessage);

            // Message 2: Friendship request notification (like LawinServer)
            const friendshipRequestMessage = {
                type: 'FRIENDSHIP_REQUEST',
                timestamp: timestamp,
                from: friendAccountId,
                status: 'ACCEPTED'
            };

            return XmppService.sendMessageToId(toAccountId, friendshipRequestMessage);
        } catch (error) {
            LoggerService.log('error', `Failed to send XMPP friend accepted: ${error.message}`);
            return false;
        }
    }

    /**
     * Send XMPP notification for a removed friend
     * @param {string} toAccountId - The recipient's account ID
     * @param {string} friendAccountId - The removed friend's account ID
     */
    static sendXmppFriendRemoved(toAccountId, friendAccountId) {
        try {
            const message = {
                payload: {
                    accountId: friendAccountId,
                    reason: 'DELETED'
                },
                type: 'com.epicgames.friends.core.apiobjects.FriendRemoval',
                timestamp: new Date().toISOString()
            };

            return XmppService.sendMessageToId(toAccountId, message);
        } catch (error) {
            LoggerService.log('error', `Failed to send XMPP friend removed: ${error.message}`);
            return false;
        }
    }

    /**
     * Send XMPP notification for a blocked user
     * @param {string} toAccountId - The recipient's account ID
     * @param {string} blockedAccountId - The blocked account ID
     */
    static sendXmppFriendBlocked(toAccountId, blockedAccountId) {
        try {
            const message = {
                payload: {
                    accountId: blockedAccountId,
                    reason: 'BLOCKED'
                },
                type: 'com.epicgames.friends.core.apiobjects.FriendRemoval',
                timestamp: new Date().toISOString()
            };

            return XmppService.sendMessageToId(toAccountId, message);
        } catch (error) {
            LoggerService.log('error', `Failed to send XMPP friend blocked: ${error.message}`);
            return false;
        }
    }

    /**
     * Send presence update between two users
     * @param {string} fromAccountId - The sender's account ID
     * @param {string} toAccountId - The recipient's account ID
     * @param {boolean} offline - Whether the sender is going offline
     */
    static sendPresenceUpdate(fromAccountId, toAccountId, offline = false) {
        return XmppService.sendPresence(fromAccountId, toAccountId, offline);
    }
}

module.exports = FriendsService;
