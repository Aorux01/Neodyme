const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const LoggerService = require('../../src/service/logger/logger-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');
const WebService = require('../../src/service/api/web-service');

const verifyToken = WebService.verifyToken;

router.get('*user/friends', verifyToken, csrfProtection, async (req, res) => {
    try {
        const friendsData = await DatabaseManager.getFriends(req.user.accountId);

        const friendsWithDetails = await Promise.all(
            friendsData.friends.map(async (friend) => {
                const account = await DatabaseManager.getAccount(friend.accountId);
                return {
                    accountId: friend.accountId,
                    displayName: account?.displayName || 'Unknown',
                    status: 'offline',
                    created: friend.created
                };
            })
        );

        const incomingWithDetails = await Promise.all(
            friendsData.incoming.map(async (accountId) => {
                const account = await DatabaseManager.getAccount(accountId);
                return {
                    accountId,
                    displayName: account?.displayName || 'Unknown'
                };
            })
        );

        const outgoingWithDetails = await Promise.all(
            friendsData.outgoing.map(async (accountId) => {
                const account = await DatabaseManager.getAccount(accountId);
                return {
                    accountId,
                    displayName: account?.displayName || 'Unknown'
                };
            })
        );

        res.json({
            success: true,
            friends: friendsWithDetails,
            incoming: incomingWithDetails,
            outgoing: outgoingWithDetails,
            blocklist: friendsData.blocklist
        });
    } catch (error) {
        LoggerService.log('error', `Get friends error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*user/friends/add', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({ success: false, message: 'Account ID is required' });
        }

        if (accountId === req.user.accountId) {
            return res.status(400).json({ success: false, message: 'Cannot add yourself as a friend' });
        }

        const targetAccount = await DatabaseManager.getAccount(accountId);
        if (!targetAccount) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const result = await DatabaseManager.sendFriendRequest(req.user.accountId, accountId);

        if (!result.success) {
            return res.status(400).json({ success: false, message: 'Friend request already sent or already friends' });
        }

        res.json({ success: true, message: 'Friend request sent' });
    } catch (error) {
        LoggerService.log('error', `Add friend error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*user/friends/accept', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({ success: false, message: 'Account ID is required' });
        }

        const result = await DatabaseManager.acceptFriendRequest(req.user.accountId, accountId);

        if (!result.success) {
            return res.status(400).json({ success: false, message: 'No pending request from this user' });
        }

        res.json({ success: true, message: 'Friend request accepted' });
    } catch (error) {
        LoggerService.log('error', `Accept friend error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('*user/friends/reject', csrfProtection, verifyToken, async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({ success: false, message: 'Account ID is required' });
        }

        const result = await DatabaseManager.rejectOrRemoveFriend(req.user.accountId, accountId);

        if (!result.success) {
            return res.status(400).json({ success: false, message: 'Failed to reject request' });
        }

        res.json({ success: true, message: 'Friend request rejected' });
    } catch (error) {
        LoggerService.log('error', `Reject friend error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('*user/friends/:accountId', csrfProtection, verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;

        const result = await DatabaseManager.rejectOrRemoveFriend(req.user.accountId, accountId);

        if (!result.success) {
            return res.status(400).json({ success: false, message: 'Failed to remove friend' });
        }

        res.json({ success: true, message: 'Friend removed' });
    } catch (error) {
        LoggerService.log('error', `Remove friend error: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
