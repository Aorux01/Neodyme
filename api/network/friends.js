const router = require('express').Router();
const DatabaseManager = require('../../src/manager/database-manager');
const LoggerService = require('../../src/service/logger/logger-service');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const { verifyToken } = require('../../src/middleware/auth-middleware');
const FriendsService = require('../../src/service/api/friends-service');

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

        // Check current friendship status
        const myFriends = await DatabaseManager.getFriends(req.user.accountId);

        // Already friends?
        if (myFriends.friends.some(f => f.accountId === friendId)) {
            throw Errors.Friends.requestAlreadySent();
        }

        // Already sent an outgoing request?
        if (myFriends.outgoing.includes(friendId)) {
            throw Errors.Friends.requestAlreadySent();
        }

        // If there's an INCOMING request from this person, auto-accept it
        if (myFriends.incoming.includes(friendId)) {
            LoggerService.log('info', `Auto-accepting friend request from ${friendId} to ${req.user.accountId}`);

            const result = await DatabaseManager.acceptFriendRequest(req.user.accountId, friendId);

            if (!result.success) {
                throw Errors.Friends.friendshipNotFound();
            }

            FriendsService.sendXmppFriendAccepted(req.user.accountId, friendId);
            FriendsService.sendXmppFriendAccepted(friendId, req.user.accountId);

            LoggerService.log('success', `Friend request auto-accepted: ${req.user.accountId} <-> ${friendId}`);
            return res.status(204).send();
        }

        // Otherwise, send a new friend request
        const result = await DatabaseManager.sendFriendRequest(req.user.accountId, friendId);

        if (!result.success) {
            throw Errors.Friends.requestAlreadySent();
        }

        LoggerService.log('success', `Friend request sent from ${req.user.accountId} to ${friendId}`);

        const timestamp = new Date().toISOString();

        // Send XMPP notification to sender (OUTBOUND)
        const sentToSender = FriendsService.sendXmppFriendRequest(req.user.accountId, friendId, 'OUTBOUND', timestamp);
        LoggerService.log('info', `XMPP to sender ${req.user.accountId}: ${sentToSender}`);

        // Send XMPP notification to receiver (INBOUND) - this is the important one
        const sentToReceiver = FriendsService.sendXmppFriendRequest(friendId, req.user.accountId, 'INBOUND', timestamp);
        LoggerService.log('info', `XMPP to receiver ${friendId}: ${sentToReceiver}`);

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

        const friendsData = await DatabaseManager.getFriends(req.user.accountId);

        const incomingFormatted = (friendsData.incoming || []).map(item => {
            if (typeof item === 'string') {
                return {
                    accountId: item,
                    status: 'PENDING',
                    direction: 'INBOUND',
                    created: new Date().toISOString(),
                    favorite: false
                };
            }
            return item;
        });

        const outgoingFormatted = (friendsData.outgoing || []).map(item => {
            if (typeof item === 'string') {
                return {
                    accountId: item,
                    status: 'PENDING',
                    direction: 'OUTBOUND',
                    created: new Date().toISOString(),
                    favorite: false
                };
            }
            return item;
        });

        res.json({
            friends: friendsData.friends || [],
            incoming: incomingFormatted,
            outgoing: outgoingFormatted,
            suggested: friendsData.suggested || [],
            blocklist: friendsData.blocklist || [],
            settings: friendsData.settings || { acceptInvites: 'public' }
        });
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

        // Check current friendship status
        const myFriends = await DatabaseManager.getFriends(req.user.accountId);

        // Already friends?
        if (myFriends.friends.some(f => f.accountId === friendId)) {
            throw Errors.Friends.requestAlreadySent();
        }

        // Already sent an outgoing request?
        if (myFriends.outgoing.includes(friendId)) {
            throw Errors.Friends.requestAlreadySent();
        }

        // If there's an INCOMING request from this person, auto-accept it
        if (myFriends.incoming.includes(friendId)) {
            LoggerService.log('info', `Auto-accepting friend request from ${friendId} to ${req.user.accountId}`);

            const result = await DatabaseManager.acceptFriendRequest(req.user.accountId, friendId);

            if (!result.success) {
                throw Errors.Friends.friendshipNotFound();
            }

            FriendsService.sendXmppFriendAccepted(req.user.accountId, friendId);
            FriendsService.sendXmppFriendAccepted(friendId, req.user.accountId);

            LoggerService.log('success', `Friend request auto-accepted: ${req.user.accountId} <-> ${friendId}`);
            return res.status(204).send();
        }

        // Otherwise, send a new friend request
        const result = await DatabaseManager.sendFriendRequest(req.user.accountId, friendId);

        if (!result.success) {
            throw Errors.Friends.requestAlreadySent();
        }

        LoggerService.log('success', `Friend request sent from ${req.user.accountId} to ${friendId}`);

        const timestamp = new Date().toISOString();

        // Send XMPP notification to sender (OUTBOUND)
        const sentToSender = FriendsService.sendXmppFriendRequest(req.user.accountId, friendId, 'OUTBOUND', timestamp);
        LoggerService.log('info', `XMPP to sender ${req.user.accountId}: ${sentToSender}`);

        // Send XMPP notification to receiver (INBOUND) - this is the important one
        const sentToReceiver = FriendsService.sendXmppFriendRequest(friendId, req.user.accountId, 'INBOUND', timestamp);
        LoggerService.log('info', `XMPP to receiver ${friendId}: ${sentToReceiver}`);

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


router.get('/api/v1/search/:accountId?', verifyToken, async (req, res) => {
    try {
        const platform = req.query.platform || req.query.plateform;
        const prefix = req.query.prefix;

        if (!platform) {
            return sendError(res, Errors.custom(
                'errors.com.epicgames.common.missing_parameter',
                'platform is required',
                1040,
                400
            ).withMessageVars(['platform']).withOriginatingService('user-search-service'));
        }

        if (!prefix) {
            return sendError(res, Errors.custom(
                'errors.com.epicgames.common.missing_parameter',
                'prefix is required',
                1040,
                400
            ).withMessageVars(['prefix']).withOriginatingService('user-search-service'));
        }

        const validPlatforms = ['epic', 'psn', 'xbl', 'steam', 'nsw'];
        if (!validPlatforms.includes(platform.toLowerCase())) {
            return sendError(res, Errors.custom(
                'errors.com.epicgames.common.invalid_parameter',
                `Invalid platform: ${platform}`,
                1040,
                400
            ).withMessageVars(['platform']).withOriginatingService('user-search-service'));
        }

        const allAccounts = await DatabaseManager.getAllAccounts();
        const searchResults = [];
        let sortPosition = 0;

        const prefixLower = prefix.toLowerCase();

        for (const account of allAccounts) {
            if (!account.displayName) continue;

            const displayNameLower = account.displayName.toLowerCase();

            if (displayNameLower === prefixLower) {
                searchResults.push({
                    accountId: account.accountId,
                    matches: [{ value: account.displayName, platform: platform.toLowerCase() }],
                    matchType: 'exact',
                    epicMutuals: 0,
                    sortPosition: sortPosition++
                });
            } else if (displayNameLower.startsWith(prefixLower)) {
                searchResults.push({
                    accountId: account.accountId,
                    matches: [{ value: account.displayName, platform: platform.toLowerCase() }],
                    matchType: 'prefix',
                    epicMutuals: 0,
                    sortPosition: sortPosition++
                });
            }
        }

        searchResults.sort((a, b) => {
            if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
            if (a.matchType !== 'exact' && b.matchType === 'exact') return 1;
            return a.sortPosition - b.sortPosition;
        });

        searchResults.forEach((result, index) => {
            result.sortPosition = index;
        });

        res.json(searchResults.slice(0, 100));
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json(error.toJSON());
        }
        LoggerService.log('error', `Failed to search users: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;
