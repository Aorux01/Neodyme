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
            const message = {
                payload: {
                    accountId: fromAccountId,
                    status: 'PENDING',
                    direction: direction,
                    created: timestamp || new Date().toISOString(),
                    favorite: false
                },
                type: 'com.epicgames.friends.core.apiobjects.Friend',
                timestamp: timestamp || new Date().toISOString()
            };

            return XmppService.sendMessageToId(toAccountId, message);
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

            const message = {
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

            return XmppService.sendMessageToId(toAccountId, message);
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
