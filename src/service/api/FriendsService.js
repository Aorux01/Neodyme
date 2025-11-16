const XMPPManager = require('../../manager/XMPPManager');
const LoggerService = require('../logger/LoggerService');

function sendXmppFriendRequest(toAccountId, fromAccountId, direction, timestamp) {
    try {
        const message = {
            type: 'FRIENDSHIP_REQUEST',
            timestamp: timestamp || new Date().toISOString(),
            from: fromAccountId,
            status: 'PENDING'
        };

        const client = XMPPManager.clients.find(c => c.accountId === toAccountId);
        if (client) {
            const XMLBuilder = require('xmlbuilder');
            const xml = XMLBuilder.create('message')
                .attribute('from', `xmpp-admin@${XMPPManager.domain}`)
                .attribute('to', client.jid)
                .attribute('xmlns', 'jabber:client')
                .element('body', JSON.stringify(message))
                .up()
                .toString();

            client.ws.send(xml);
        }
    } catch (error) {
        LoggerService.log('error', `Failed to send XMPP friend request: ${error.message}`);
    }
}

function sendXmppFriendAccepted(toAccountId, friendAccountId) {
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

        const client = XMPPManager.clients.find(c => c.accountId === toAccountId);
        if (client) {
            const XMLBuilder = require('xmlbuilder');
            const xml = XMLBuilder.create('message')
                .attribute('from', `xmpp-admin@${XMPPManager.domain}`)
                .attribute('to', client.jid)
                .attribute('xmlns', 'jabber:client')
                .element('body', JSON.stringify(message))
                .up()
                .toString();

            client.ws.send(xml);
        }
    } catch (error) {
        LoggerService.log('error', `Failed to send XMPP friend accepted: ${error.message}`);
    }
}

function sendXmppFriendRemoved(toAccountId, friendAccountId) {
    try {
        const message = {
            payload: {
                accountId: friendAccountId,
                reason: 'DELETED'
            },
            type: 'com.epicgames.friends.core.apiobjects.FriendRemoval',
            timestamp: new Date().toISOString()
        };

        const client = XMPPManager.clients.find(c => c.accountId === toAccountId);
        if (client) {
            const XMLBuilder = require('xmlbuilder');
            const xml = XMLBuilder.create('message')
                .attribute('from', `xmpp-admin@${XMPPManager.domain}`)
                .attribute('to', client.jid)
                .attribute('xmlns', 'jabber:client')
                .element('body', JSON.stringify(message))
                .up()
                .toString();

            client.ws.send(xml);
        }
    } catch (error) {
        LoggerService.log('error', `Failed to send XMPP friend removed: ${error.message}`);
    }
}

module.exports = {
    sendXmppFriendRequest,
    sendXmppFriendAccepted,
    sendXmppFriendRemoved
};