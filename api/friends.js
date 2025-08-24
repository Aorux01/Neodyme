const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const AuthService = require('../src/services/AuthService');
const AccountService = require('../src/services/AccountService');
const { Errors, sendError } = require('../src/errors/errors');
const Functions = require('../src/utils/functions');
const VersionService = require('../src/services/VersionService');
const LoggerService = require("../src/utils/logger");
const TokenService = require('../src/services/TokenService');

const requireAuth = TokenService.createVerificationMiddleware();

// Friends service
class FriendsService {
    constructor() {
        this.playersDataPath = path.join(process.cwd(), 'data', 'players');
        this.initializeDirectories();
    }

    async initializeDirectories() {
        try {
            await fs.mkdir(this.playersDataPath, { recursive: true });
        } catch (error) {
            LoggerService.log('error', `Failed to initialize players directories: ${error}`);
        }
    }

    async getFriendsList(accountId) {
        try {
            const playerPath = path.join(this.playersDataPath, accountId);
            const friendsListPath = path.join(playerPath, 'friendslist.json');
            const friendsList2Path = path.join(playerPath, 'friendslist2.json');

            const [data1, data2] = await Promise.all([
                fs.readFile(friendsListPath, 'utf8').catch(() => null),
                fs.readFile(friendsList2Path, 'utf8').catch(() => null)
            ]);

            const list1 = data1 ? JSON.parse(data1) : null;
            const list2 = data2 ? JSON.parse(data2) : null;

            return {
                friends: list1?.friends || list2?.friends || [],
                incoming: list1?.incoming || list2?.incoming || [],
                outgoing: list1?.outgoing || list2?.outgoing || [],
                blocked: list1?.blocked || list2?.blocked || []
            };
        } catch (error) {
            return {
                friends: [],
                incoming: [],
                outgoing: [],
                blocked: []
            };
        }
    }

    async saveFriendsList(accountId, friendsList) {
        const playerPath = path.join(this.playersDataPath, accountId);
        await fs.mkdir(playerPath, { recursive: true });

        const friendsListPath = path.join(playerPath, 'friendslist.json');
        const friendsList2Path = path.join(playerPath, 'friendslist2.json');

        const friendsData = JSON.stringify(friendsList, null, 2);
        await Promise.all([
            fs.writeFile(friendsListPath, friendsData),
            fs.writeFile(friendsList2Path, friendsData)
        ]);
    }

    async addFriend(accountId, friendId) {
        const friendsList = await this.getFriendsList(accountId);
        const targetFriendsList = await this.getFriendsList(friendId);

        // Check if already friends
        if (friendsList.friends.find(f => f.accountId === friendId)) {
            return { exists: true };
        }

        const friendData = {
            accountId: friendId,
            status: "ACCEPTED",
            direction: "OUTBOUND",
            created: new Date().toISOString(),
            favorite: false
        };

        const recipientData = {
            accountId: accountId,
            status: "ACCEPTED",
            direction: "INBOUND",
            created: new Date().toISOString(),
            favorite: false
        };

        friendsList.friends.push(friendData);
        targetFriendsList.friends.push(recipientData);

        await this.saveFriendsList(accountId, friendsList);
        await this.saveFriendsList(friendId, targetFriendsList);

        // Send XMPP notifications if available
        try {
            const xmppService = require('../src/xmpp/service').getService();
            if (xmppService) {
                await xmppService.sendFriendRequest(accountId, friendId);
            }
        } catch (error) {
            // XMPP not available
        }

        return { success: true, friendData };
    }

    async removeFriend(accountId, friendId) {
        const friendsList = await this.getFriendsList(accountId);
        const targetFriendsList = await this.getFriendsList(friendId);

        friendsList.friends = friendsList.friends.filter(f => f.accountId !== friendId);
        targetFriendsList.friends = targetFriendsList.friends.filter(f => f.accountId !== accountId);

        await this.saveFriendsList(accountId, friendsList);
        await this.saveFriendsList(friendId, targetFriendsList);

        return { success: true };
    }

    async blockUser(accountId, blockedId) {
        const friendsList = await this.getFriendsList(accountId);

        // Remove from friends if exists
        friendsList.friends = friendsList.friends.filter(f => f.accountId !== blockedId);
        
        // Add to blocked
        if (!friendsList.blocked.find(b => b.accountId === blockedId)) {
            friendsList.blocked.push({
                accountId: blockedId,
                created: new Date().toISOString()
            });
        }

        await this.saveFriendsList(accountId, friendsList);
        return { success: true };
    }

    async unblockUser(accountId, blockedId) {
        const friendsList = await this.getFriendsList(accountId);
        friendsList.blocked = friendsList.blocked.filter(b => b.accountId !== blockedId);
        await this.saveFriendsList(accountId, friendsList);
        return { success: true };
    }

    formatFriendsSummary(accountId, friendsList) {
        return {
            friends: friendsList.friends.map(f => ({
                accountId: f.accountId,
                groups: [],
                mutual: 0,
                alias: "",
                note: "",
                favorite: f.favorite || false,
                created: f.created
            })),
            incoming: friendsList.incoming.map(f => ({
                accountId: f.accountId,
                mutual: 0,
                favorite: false,
                created: f.created
            })),
            outgoing: friendsList.outgoing.map(f => ({
                accountId: f.accountId,
                favorite: false,
                created: f.created
            })),
            blocklist: friendsList.blocked.map(b => ({
                accountId: b.accountId,
                created: b.created
            })),
            settings: {
                acceptInvites: "public"
            },
            limitsReached: {
                incoming: false,
                outgoing: false,
                accepted: false
            }
        };
    }
}

const friendsService = new FriendsService();

// Settings endpoint
router.get('/friends/api/v1/*/settings', requireAuth, async (req, res) => {
    res.json({
        acceptInvites: "public"
    });
});

// Blocklist endpoint
router.get('/friends/api/v1/*/blocklist', requireAuth, async (req, res) => {
    res.json([]);
});

// Get friends list
router.get('/friends/api/public/friends/:accountId', requireAuth, async (req, res) => {
    try {
        const versionInfo = VersionService.getVersionInfo(req);
        const friendsList = await friendsService.getFriendsList(req.params.accountId);
        
        let friends = [...friendsList.friends];
        
        // In season 7+, don't include self in friends list
        if (versionInfo.season >= 7) {
            friends = friends.filter(f => f.accountId !== req.params.accountId);
        }
        
        res.json(friends);
    } catch (error) {
        LoggerService.log('error', `Error getting friends list: ${error}`);
        res.json([]);
    }
});

// Get friends summary
router.get('/friends/api/v1/:accountId/summary', requireAuth, async (req, res) => {
    try {
        const friendsList = await friendsService.getFriendsList(req.params.accountId);
        const summary = friendsService.formatFriendsSummary(req.params.accountId, friendsList);
        res.json(summary);
    } catch (error) {
        LoggerService.log('error', `Error getting friends summary: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

// Get recent players
router.get('/friends/api/public/list/fortnite/*/recentPlayers', requireAuth, async (req, res) => {
    res.json([]);
});

// Get blocklist
router.get('/friends/api/public/blocklist/:accountId', requireAuth, async (req, res) => {
    try {
        const friendsList = await friendsService.getFriendsList(req.params.accountId);
        res.json({
            blockedUsers: friendsList.blocked || []
        });
    } catch (error) {
        res.json({
            blockedUsers: []
        });
    }
});

// Add friend
router.post('/friends/api/v1/:accountId/friends/:friendId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        if (req.params.accountId === req.params.friendId) {
            throw Errors.Friends.selfFriend();
        }

        // Check if friend exists
        try {
            await AccountService.getAccount(req.params.friendId);
        } catch (error) {
            throw Errors.Friends.accountNotFound();
        }

        const result = await friendsService.addFriend(req.params.accountId, req.params.friendId);
        
        if (result.exists) {
            throw Errors.Friends.requestAlreadySent();
        }

        res.status(204).end();
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Remove friend
router.delete('/friends/api/v1/:accountId/friends/:friendId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        await friendsService.removeFriend(req.params.accountId, req.params.friendId);
        res.status(204).end();
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Block user
router.post('/friends/api/v1/:accountId/blocklist/:blockedId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        await friendsService.blockUser(req.params.accountId, req.params.blockedId);
        res.status(204).end();
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Unblock user
router.delete('/friends/api/v1/:accountId/blocklist/:blockedId', requireAuth, async (req, res) => {
    try {
        if (req.user.account_id !== req.params.accountId) {
            throw Errors.Authentication.notYourAccount();
        }

        await friendsService.unblockUser(req.params.accountId, req.params.blockedId);
        res.status(204).end();
    } catch (error) {
        if (error.name === 'ApiError') {
            sendError(res, error);
        } else {
            sendError(res, Errors.Internal.serverError());
        }
    }
});

// Recent friends in Fortnite
router.get('/friends/api/v1/:accountId/recent/fortnite', requireAuth, async (req, res) => {
    try {
        const accountId = req.params.accountId;
        LoggerService.log('debug', `Recent Fortnite friends requested for ${accountId}`);
        
        res.json([]);
    } catch (error) {
        LoggerService.log('error', `Error in recent friends: ${error}`);
        sendError(res, Errors.Internal.serverError());
    }
});

module.exports = router;