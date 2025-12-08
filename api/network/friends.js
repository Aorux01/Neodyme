const router = require('express').Router();
const DatabaseManager = require('../../src/manager/DatabaseManager');
const LoggerService = require('../../src/service/logger/LoggerService');
const { Errors, sendError } = require('../../src/service/error/Errors');
const { verifyToken } = require('../../src/middleware/authMiddleware');
const FriendsService = require('../../src/service/api/FriendsService');

router.get('/friends/api/v1/:accountId/settings', verifyToken, async (req, res) => {
    try {
        if (req.params.accountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friends = await DatabaseManager.getFriends(req.user.accountId);
        res.json(friends.settings || { acceptInvites: 'public' });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to get friend settings: ${error.message}`);
        res.json({ acceptInvites: 'public' });
    }
});

router.get('/friends/api/v1/:accountId/blocklist', verifyToken, async (req, res) => {
    try {
        if (req.params.accountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friends = await DatabaseManager.getFriends(req.user.accountId);

        res.json(friends.blocklist || []);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to get blocklist: ${error.message}`);
        res.json([]);
    }
});

router.get('/friends/api/public/friends/:accountId', verifyToken, async (req, res) => {
    try {
        const targetAccountId = req.params.accountId;

        if (targetAccountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friendsList = await DatabaseManager.getFriendsList(targetAccountId);

        res.json(friendsList);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to get friends list: ${error.message}`);
        res.json([]);
    }
});

router.post('/friends/api/public/friends/:accountId/:friendId', verifyToken, async (req, res) => {
    try {
        if (req.params.accountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friendId = req.params.friendId;

        if (friendId === req.user.accountId) {
            throw Errors.Friends.selfFriend();
        }

        const friendAccount = await DatabaseManager.getAccount(friendId);
        if (!friendAccount) {
            throw Errors.Friends.accountNotFound();
        }

        const alreadyFriend = await DatabaseManager.isFriend(req.user.accountId, friendId);
        if (alreadyFriend) {
            throw Errors.Friends.requestAlreadySent();
        }

        const result = await DatabaseManager.sendFriendRequest(req.user.accountId, friendId);
        
        if (!result.success) {
            throw Errors.Friends.requestAlreadySent();
        }

        const timestamp = new Date().toISOString();
        FriendsService.sendXmppFriendRequest(req.user.accountId, friendId, 'OUTGOING', timestamp);
        FriendsService.sendXmppFriendRequest(friendId, req.user.accountId, 'INCOMING', timestamp);

        res.status(204).send();
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to send friend request: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/friends/api/v1/:accountId/summary', verifyToken, async (req, res) => {
    try {
        if (req.params.accountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friends = await DatabaseManager.getFriends(req.user.accountId);
        res.json(friends);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to get friend summary: ${error.message}`);
        res.json({
            friends: [],
            incoming: [],
            outgoing: [],
            suggested: [],
            blocklist: [],
            settings: { acceptInvites: 'public' }
        });
    }
});

router.post('/friends/api/v1/:accountId/friends/:friendId', verifyToken, async (req, res) => {
    try {
        if (req.params.accountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friendId = req.params.friendId;

        if (friendId === req.user.accountId) {
            throw Errors.Friends.selfFriend();
        }

        const friendAccount = await DatabaseManager.getAccount(friendId);
        if (!friendAccount) {
            throw Errors.Friends.accountNotFound();
        }

        const alreadyFriend = await DatabaseManager.isFriend(req.user.accountId, friendId);
        if (alreadyFriend) {
            throw Errors.Friends.requestAlreadySent();
        }

        const result = await DatabaseManager.sendFriendRequest(req.user.accountId, friendId);
        
        if (!result.success) {
            throw Errors.Friends.requestAlreadySent();
        }

        const timestamp = new Date().toISOString();
        FriendsService.sendXmppFriendRequest(req.user.accountId, friendId, 'OUTGOING', timestamp);
        FriendsService.sendXmppFriendRequest(friendId, req.user.accountId, 'INCOMING', timestamp);

        res.status(204).send();
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to send friend request: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/friends/api/v1/:accountId/friends/:friendId/accept', verifyToken, async (req, res) => {
    try {
        if (req.params.accountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friendId = req.params.friendId;

        const result = await DatabaseManager.acceptFriendRequest(req.user.accountId, friendId);
        
        if (!result.success) {
            throw Errors.Friends.friendshipNotFound();
        }

        FriendsService.sendXmppFriendAccepted(req.user.accountId, friendId);
        FriendsService.sendXmppFriendAccepted(friendId, req.user.accountId);

        LoggerService.log('success', `Friend request accepted: ${req.user.accountId} <-> ${friendId}`);

        res.status(204).send();
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to accept friend request: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.delete('/friends/api/v1/:accountId/friends/:friendId', verifyToken, async (req, res) => {
    try {
        if (req.params.accountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friendId = req.params.friendId;

        const result = await DatabaseManager.rejectOrRemoveFriend(req.user.accountId, friendId);
        
        if (!result.success) {
            throw Errors.Friends.friendshipNotFound();
        }

        FriendsService.sendXmppFriendRemoved(req.user.accountId, friendId);
        FriendsService.sendXmppFriendRemoved(friendId, req.user.accountId);

        LoggerService.log('info', `Friend removed/rejected: ${req.user.accountId} -> ${friendId}`);

        res.status(204).send();
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to remove friend: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/friends/api/public/list/fortnite/:accountId/recentPlayers', verifyToken, async (req, res) => {
    res.json([]);
});

router.get('/friends/api/public/blocklist/:accountId', verifyToken, async (req, res) => {
    try {
        if (req.params.accountId !== req.user.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        const friends = await DatabaseManager.getFriends(req.user.accountId);
        res.json({
            blockedUsers: friends.blocklist || []
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to get blocklist: ${error.message}`);
        res.json({ blockedUsers: [] });
    }
});

module.exports = router;
