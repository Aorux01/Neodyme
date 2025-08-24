const express = require('express');
const router = express.Router();
const MatchmakingService = require('../src/services/MatchmakingService');
const { Errors, sendError } = require('../src/errors/errors');
const functions = require('../src/utils/functions');
const { LoggerService } = require('../src/utils/logger');

// Get matchmaking ticket for WebSocket connection
router.get('/fortnite/api/game/v2/matchmakingservice/ticket/player/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        const { bucketId, region } = req.query;

        if (!bucketId) {
            return sendError(res, Errors.Basic.badRequest('Missing bucketId parameter'));
        }

        // Store current build info in cookie for session tracking
        if (bucketId.includes(':')) {
            res.cookie('currentbuildUniqueId', bucketId.split(':')[0], {
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });
        }

        const ticket = await MatchmakingService.getMatchmakingTicket(accountId, bucketId, region);
        
        res.json(ticket);
    } catch (error) {
        LoggerService.log('error', `Get matchmaking ticket error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Get player session details
router.get('/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId', async (req, res) => {
    try {
        const { accountId, sessionId } = req.params;
        
        const session = await MatchmakingService.getPlayerSession(accountId, sessionId);
        
        res.json(session);
    } catch (error) {
        if (error.message === 'Session not found') {
            return sendError(res, Errors.Basic.notFound('Session not found'));
        }
        LoggerService.log('error', `Get player session error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Get session details by session ID
router.get('/fortnite/api/matchmaking/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const sessionDetails = await MatchmakingService.getSessionDetails(sessionId);
        
        // Use build ID from cookie if available
        if (req.cookies.currentbuildUniqueId) {
            sessionDetails.buildUniqueId = req.cookies.currentbuildUniqueId;
        }
        
        res.json(sessionDetails);
    } catch (error) {
        if (error.message === 'Session not found') {
            return sendError(res, Errors.Basic.notFound('Session not found'));
        }
        LoggerService.log('error', `Get session details error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Join session (mostly just acknowledgment)
router.post('/fortnite/api/matchmaking/session/:sessionId/join', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Verify session exists
        await MatchmakingService.getSessionDetails(sessionId);
        
        // In a real implementation, you might update server player count here
        res.status(204).end();
    } catch (error) {
        if (error.message === 'Session not found') {
            return sendError(res, Errors.Basic.notFound('Session not found'));
        }
        LoggerService.log('error', `Join session error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Legacy matchmaking request (returns empty for compatibility)
router.post('/fortnite/api/matchmaking/session/matchMakingRequest', async (req, res) => {
    res.json([]);
});

// Find player endpoint (legacy support)
router.get('/fortnite/api/matchmaking/session/findPlayer/:accountId', async (req, res) => {
    res.status(200).end();
});

// Get available regions and their status
router.get('/fortnite/api/game/v2/matchmaking/regions', async (req, res) => {
    try {
        const regions = {};
        
        for (const [code, region] of Object.entries(MatchmakingService.gameServers.regions)) {
            const onlineServers = region.servers.filter(s => s.status === 'online');
            const totalPlayers = region.servers.reduce((sum, s) => sum + s.current_players, 0);
            
            regions[code] = {
                name: region.name,
                code: region.code,
                location: region.location || 'Unknown',
                ping_url: region.ping_url,
                servers: onlineServers.length,
                players: totalPlayers,
                status: onlineServers.length > 0 ? 'online' : 'offline'
            };
        }
        
        res.json({
            regions,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        LoggerService.log('error', `Get regions error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Get matchmaking statistics (admin/debug endpoint)
router.get('/fortnite/api/game/v2/matchmaking/stats', async (req, res) => {
    try {
        const stats = MatchmakingService.getMatchmakingStats();
        res.json(stats);
    } catch (error) {
        LoggerService.log('error', `Get matchmaking stats error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Get server list for a specific region and gamemode
router.get('/fortnite/api/game/v2/matchmaking/servers/:region', async (req, res) => {
    try {
        const { region } = req.params;
        const { gamemode, limit } = req.query;
        
        const servers = MatchmakingService.getBestServers(
            region, 
            gamemode || 'BR_Solo', 
            parseInt(limit) || 5
        );
        
        res.json({
            region,
            gamemode: gamemode || 'BR_Solo',
            servers: servers.map(server => ({
                id: server.id,
                name: server.name,
                ip: server.ip,
                port: server.port,
                current_players: server.current_players,
                max_players: server.max_players,
                load_percentage: Math.round((server.current_players / server.max_players) * 100),
                status: server.status,
                last_updated: server.last_updated
            })),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        LoggerService.log('error', `Get servers error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Ping test endpoint
router.post('/fortnite/api/game/v2/matchmaking/ping', async (req, res) => {
    try {
        const { regions } = req.body;
        
        if (!Array.isArray(regions)) {
            return sendError(res, Errors.Basic.badRequest('Regions must be an array'));
        }
        
        const pingResults = {};
        
        for (const regionCode of regions) {
            if (MatchmakingService.gameServers.regions[regionCode]) {
                // Simulate ping test (in production, implement actual ping)
                const basePing = MatchmakingService.estimatePing(regionCode, 'test');
                const jitter = Math.random() * 20 - 10; // ±10ms jitter
                pingResults[regionCode] = Math.max(1, Math.round(basePing + jitter));
            }
        }
        
        res.json({
            results: pingResults,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        LoggerService.log('error', `Ping test error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Admin endpoints for server management
router.post('/fortnite/api/admin/matchmaking/server', async (req, res) => {
    try {
        const { region, serverData } = req.body;
        
        if (!region || !serverData) {
            return sendError(res, Errors.Basic.badRequest('Missing region or serverData'));
        }
        
        const server = await MatchmakingService.addGameServer(region, serverData);
        
        res.status(201).json({
            success: true,
            message: 'Server added successfully',
            server
        });
    } catch (error) {
        LoggerService.log('error', `Add server error: ${error}`);
        
        if (error.message.includes('not found')) {
            return sendError(res, Errors.Basic.notFound(error.message));
        }
        
        sendError(res, Errors.InternalServerError);
    }
});

router.delete('/fortnite/api/admin/matchmaking/server/:region/:serverId', async (req, res) => {
    try {
        const { region, serverId } = req.params;
        
        await MatchmakingService.removeGameServer(region, serverId);
        
        res.json({
            success: true,
            message: 'Server removed successfully'
        });
    } catch (error) {
        LoggerService.log('error', `Remove server error: ${error}`);
        
        if (error.message.includes('not found')) {
            return sendError(res, Errors.Basic.notFound(error.message));
        }
        
        sendError(res, Errors.InternalServerError);
    }
});

router.put('/fortnite/api/admin/matchmaking/server/:region/:serverId', async (req, res) => {
    try {
        const { region, serverId } = req.params;
        const updates = req.body;
        
        const server = await MatchmakingService.updateGameServer(region, serverId, updates);
        
        res.json({
            success: true,
            message: 'Server updated successfully',
            server
        });
    } catch (error) {
        LoggerService.log('error', `Update server error: ${error}`);
        
        if (error.message.includes('not found')) {
            return sendError(res, Errors.Basic.notFound(error.message));
        }
        
        sendError(res, Errors.InternalServerError);
    }
});

// Queue status endpoint
router.get('/fortnite/api/game/v2/matchmaking/queue/status', async (req, res) => {
    try {
        const stats = MatchmakingService.getMatchmakingStats();
        
        res.json({
            queuedPlayers: stats.queuedPlayers,
            activeSessions: stats.activeSessions,
            estimatedWait: Math.min(stats.queuedPlayers * 2, 60), // Simple estimation
            serverLoad: stats.totalPlayers > 0 ? 
                Math.round((stats.totalPlayers / (stats.totalOnlineServers * 100)) * 100) : 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        LoggerService.log('error', `Get queue status error: ${error}`);
        sendError(res, Errors.InternalServerError);
    }
});

// Health check endpoint
router.get('/fortnite/api/game/v2/matchmaking/health', (req, res) => {
    const stats = MatchmakingService.getMatchmakingStats();
    
    res.json({
        status: 'healthy',
        uptime: stats.uptime,
        totalOnlineServers: stats.totalOnlineServers,
        queuedPlayers: stats.queuedPlayers,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

module.exports = router;