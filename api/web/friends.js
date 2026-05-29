const express = require('express');
const router = express.Router();
const DatabaseManager = require('../../src/manager/database-manager');
const WebResponse = require('../../src/service/api/web-response-service');
const WebService = require('../../src/service/api/web-service');
const { csrfProtection } = require('../../src/service/token/csrf-token-service');

const verifyToken = WebService.verifyToken;

// Resolves a list of accountIds into { accountId, displayName } pairs.
const withDisplayNames = (accountIds) => Promise.all(
    accountIds.map(async (accountId) => {
        const account = await DatabaseManager.getAccount(accountId);
        return { accountId, displayName: account?.displayName || 'Unknown' };
    })
);

router.get('/neodyme/api/user/friends', verifyToken, async (req, res) => {
    try {
        const data = await DatabaseManager.getFriends(req.user.accountId);

        const friends = await Promise.all(data.friends.map(async (friend) => {
            const account = await DatabaseManager.getAccount(friend.accountId);
            return {
                accountId: friend.accountId,
                displayName: account?.displayName || 'Unknown',
                status: 'offline',
                created: friend.created
            };
        }));

        return WebResponse.ok(res, {
            friends,
            incoming: await withDisplayNames(data.incoming),
            outgoing: await withDisplayNames(data.outgoing),
            blocklist: data.blocklist
        });
    } catch (error) {
        return WebResponse.serverError(res, 'get friends', error);
    }
});

router.post('/neodyme/api/user/friends/add', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.body;
        if (!accountId) {
            return WebResponse.badRequest(res, 'Account id is required.');
        }
        if (accountId === req.user.accountId) {
            return WebResponse.badRequest(res, 'You cannot add yourself as a friend.');
        }

        const target = await DatabaseManager.getAccount(accountId);
        if (!target) {
            return WebResponse.notFound(res, 'User not found.');
        }

        const result = await DatabaseManager.sendFriendRequest(req.user.accountId, accountId);
        if (!result.success) {
            return WebResponse.conflict(res, 'Friend request already sent, or you are already friends.');
        }
        return WebResponse.ok(res, { message: 'Friend request sent.' });
    } catch (error) {
        return WebResponse.serverError(res, 'add friend', error);
    }
});

router.post('/neodyme/api/user/friends/accept', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.body;
        if (!accountId) {
            return WebResponse.badRequest(res, 'Account id is required.');
        }

        const result = await DatabaseManager.acceptFriendRequest(req.user.accountId, accountId);
        if (!result.success) {
            return WebResponse.conflict(res, 'No pending request from this user.');
        }
        return WebResponse.ok(res, { message: 'Friend request accepted.' });
    } catch (error) {
        return WebResponse.serverError(res, 'accept friend', error);
    }
});

router.post('/neodyme/api/user/friends/reject', verifyToken, csrfProtection, async (req, res) => {
    try {
        const { accountId } = req.body;
        if (!accountId) {
            return WebResponse.badRequest(res, 'Account id is required.');
        }

        const result = await DatabaseManager.rejectOrRemoveFriend(req.user.accountId, accountId);
        if (!result.success) {
            return WebResponse.conflict(res, 'Failed to reject request.');
        }
        return WebResponse.ok(res, { message: 'Friend request rejected.' });
    } catch (error) {
        return WebResponse.serverError(res, 'reject friend', error);
    }
});

router.delete('/neodyme/api/user/friends/:accountId', verifyToken, csrfProtection, async (req, res) => {
    try {
        const result = await DatabaseManager.rejectOrRemoveFriend(req.user.accountId, req.params.accountId);
        if (!result.success) {
            return WebResponse.conflict(res, 'Failed to remove friend.');
        }
        return WebResponse.ok(res, { message: 'Friend removed.' });
    } catch (error) {
        return WebResponse.serverError(res, 'remove friend', error);
    }
});

module.exports = router;
