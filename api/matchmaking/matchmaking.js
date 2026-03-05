const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Errors, sendError } = require('../../src/service/error/errors-system');
const MatchmakerService = require('../../src/service/matchmaker/matchmaker-service');
const ConfigManager = require('../../src/manager/config-manager');
const LoggerService = require('../../src/service/logger/logger-service');
 
router.get('/fortnite/api/matchmaking/session/findPlayer/:accountId', (req, res) => {
    res.status(200).send();
});

router.post('/fortnite/api/matchmaking/session/matchMakingRequest', (req, res) => {
    res.status(200).json([
        {
            "id": uuidv4().replace(/-/ig, '').toUpperCase(),
            "ownerId": uuidv4().replace(/-/ig, '').toUpperCase(),
            "ownerName": "[DS]neodyme-stw-server-01",
            "serverName": "[DS]neodyme-stw-server-01",
            "serverAddress": "127.0.0.1",
            "serverPort": 7777,
            "maxPublicPlayers": 4,
            "openPublicPlayers": 3,
            "maxPrivatePlayers": 0,
            "openPrivatePlayers": 0,
            "attributes": {
                "THEATERID_s": "33A2311D4AE64B361CCE27BC9F313C8B",
                "GAMEMODE_s": "FORTPVE",
                "REGION_s": "NAE",
                "serverAddress_s": "127.0.0.1",
                "serverPort_s": "7777",
                "buildUniqueId_s": "40085714",
                "PLAYLISTNAME_s": "Playlist_DefaultSolo",
                "LASTUPDATED_s": new Date().toISOString()
            },
            "publicPlayers": [],
            "privatePlayers": [],
            "totalPlayers": 1,
            "allowJoinInProgress": true,
            "shouldAdvertise": true,
            "isDedicated": true,
            "usesStats": false,
            "allowInvites": true,
            "usesPresence": false,
            "allowJoinViaPresence": true,
            "allowJoinViaPresenceFriendsOnly": false,
            "buildUniqueId": "40085714",
            "lastUpdated": new Date().toISOString(),
            "started": true
        }
    ]);
});

router.get('/fortnite/api/game/v2/matchmakingservice/ticket/player/:accountId', (req, res) => {
    try {
        const { accountId } = req.params;
        const { bucketId } = req.query;
 
        if (typeof bucketId !== 'string') {
            return sendError(res, Errors.Matchmaking.invalidBucketId());
        }
 
        const bucketParts = bucketId.split(':');
        if (bucketParts.length !== 4) {
            return sendError(res, Errors.Matchmaking.invalidBucketId());
        }
 
        LoggerService.log('info', `Matchmaking request from ${accountId} for bucket ${bucketId}`);
 
        let ticket;
        try {
            ticket = MatchmakerService.createTicket(accountId, bucketId, req.query);
        } catch (error) {
            LoggerService.log('error', `Failed to create ticket: ${error.message}`);
            return sendError(res, Errors.custom(
                'errors.com.epicgames.matchmaking.ticket_creation_failed',
                error.message,
                4001,
                400
            ));
        }
 
        const payload = MatchmakerService.generatePayload(accountId, bucketId, req.query);
        const signedPayload = MatchmakerService.signPayload(payload);
 
        const xmppPort = ConfigManager.get('xmppPort') || 3000;
        const wsUrl = `ws://127.0.0.1:${xmppPort}`;
 
        res.status(200).json({
            serviceUrl: wsUrl,
            ticketType: 'mms-player',
            payload: signedPayload,
            signature: '420='
        });
 
        LoggerService.log('success', `Matchmaking ticket created for ${accountId}`);
 
    } catch (error) {
        LoggerService.log('error', `Matchmaking ticket error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.get('/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId', (req, res) => {
    const { accountId, sessionId } = req.params;
 
    res.status(200).json({
        accountId: accountId,
        sessionId: sessionId,
        key: 'AOJEv8uTFmUh7XM2328kq9rlAzeQ5xzWzPIiyKn2s7s='
    });
});

router.get('/fortnite/api/matchmaking/session/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
 
        let accountId = null;
        const authHeader = req.headers['authorization'];
 
        if (authHeader) {
            try {
                const TokenService = require('../../src/service/token/token-service');
                const token = authHeader.replace('Bearer ', '');
                const decoded = TokenService.verifyToken(token);
                accountId = decoded?.sub || decoded?.account_id;
            } catch (err) {
                LoggerService.log('warn', `Failed to decode token: ${err.message}`);
            }
        }
 
        if (!accountId) {
            let foundTicket = null;
            for (const [accId, ticket] of MatchmakerService.tickets.entries()) {
                if (ticket.sessionId === sessionId) {
                    accountId = accId;
                    foundTicket = ticket;
                    break;
                }
            }
 
            if (!foundTicket) {
                LoggerService.log('warn', `Session not found: ${sessionId}`);
                return sendError(res, Errors.Matchmaking.unknownSession());
            }
        }
 
        const ticket = MatchmakerService.getTicket(accountId);
 
        if (!ticket || !ticket.assignedServer) {
            LoggerService.log('warn', `No assigned server for session ${sessionId}`);
            return sendError(res, Errors.Matchmaking.unknownSession());
        }
 
        const server = ticket.assignedServer;
 
        res.status(200).json({
            id: sessionId,
            ownerId: uuidv4().replace(/-/ig, '').toUpperCase(),
            ownerName: server.serverName,
            serverName: server.serverName,
            serverAddress: server.gameserverIP,
            serverPort: server.gameserverPort,
            maxPublicPlayers: 128,
            openPublicPlayers: 103,
            maxPrivatePlayers: 0,
            openPrivatePlayers: 0,
            attributes: {
                "ALLOWMIGRATION_s": "false",
                "REJOINAFTERKICK_s": "OPEN",
                "CHECKSANCTIONS_s": "false",
                "BEACONPORT_i": 15058,
                "DEPLOYMENT_s": "Fortnite",
                "LASTUPDATED_s": new Date().toISOString(),
                "PLAYLISTNAME_s": server.PLAYLISTNAME_s,
                "LINKID_s": `${server.PLAYLISTNAME_s.toLowerCase()}?v=95`,
                "DCID_s": `NEODYME-${server.REGION_s}-${server.serverId}`,
                "SERVERADDRESS_s": server.gameserverIP,
                "ALLOWBROADCASTING_b": true,
                "NETWORKMODULE_b": true,
                "HOTFIXVERSION_i": 1,
                "SUBREGION_s": server.REGION_s,
                "MATCHMAKINGPOOL_s": "Any",
                "SESSIONKEY_s": uuidv4().replace(/-/ig, '').toUpperCase(),
                "REGION_s": server.REGION_s,
                "serverAddress_s": server.gameserverIP,
                "LINKTYPE_s": "BR:Playlist",
                "GAMEMODE_s": "FORTATHENA",
                "ADDRESS_s": server.gameserverIP,
                "lastUpdated_s": new Date().toISOString()
            },
            publicPlayers: [],
            privatePlayers: [],
            totalPlayers: 25,
            allowJoinInProgress: false,
            shouldAdvertise: false,
            isDedicated: true,
            usesStats: false,
            allowInvites: false,
            usesPresence: false,
            allowJoinViaPresence: true,
            allowJoinViaPresenceFriendsOnly: false,
            buildUniqueId: ticket.buildId || "0",
            lastUpdated: new Date().toISOString(),
            started: false
        });
 
    } catch (error) {
        LoggerService.log('error', `Session lookup error: ${error.message}`);
        sendError(res, Errors.Internal.serverError());
    }
});

router.post('/fortnite/api/matchmaking/session/:sessionId/join', (req, res) => {
    res.status(204).send();
});

router.post('/fortnite/api/matchmaking/session/matchmakingrequest', (req, res) => {
    res.status(200).json([]);
});

router.post('/api/verify/match', (req, res) => {
    res.status(200).json({
        account_id: req.body.account_id,
        data: req.body.data,
        allow: true
    });
});

router.get('/api/matchmaking/stats', (req, res) => {
    const MatchmakerManager = require('../../src/manager/MatchmakerManager');
    const stats = MatchmakerManager.getStats();
 
    res.status(200).json({
        success: true,
        stats: stats
    });
});
 
module.exports = router;