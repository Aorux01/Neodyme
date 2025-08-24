const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const functions = require('../utils/functions');
const LoggerService = require('../utils/logger');

class MatchmakingService {
    constructor() {
        this.gameServers = null;
        this.activeMatches = new Map();
        this.queuedPlayers = new Map();
        this.playerSessions = new Map();
        this.wsServer = null;
        this.loadGameServers();
        
        // Update server status every 30 seconds
        setInterval(() => this.updateServerStatus(), 30000);
    }

    async loadGameServers() {
        try {
            const gameServersPath = path.join(process.cwd(), 'gameservers_list.json');
            const data = await fs.readFile(gameServersPath, 'utf8');
            this.gameServers = JSON.parse(data);
            LoggerService.log('success', `Loaded ${Object.keys(this.gameServers.regions).length} regions with game servers`);
        } catch (error) {
            LoggerService.log('error', 'Failed to load game servers list:', error.message);
            this.gameServers = this.getDefaultGameServers();
        }
    }

    getDefaultGameServers() {
        return {
            regions: {
                "NA-EAST": {
                    name: "North America East",
                    code: "NAE",
                    servers: [{
                        id: "nae-default",
                        name: "[DS]neodyme-default-server",
                        ip: "127.0.0.1",
                        port: 7777,
                        status: "online",
                        max_players: 100,
                        current_players: 0,
                        gamemode: "BR_Solo",
                        region: "NAE"
                    }]
                }
            },
            game_modes: {
                "BR_Solo": { name: "Battle Royale Solo", max_players: 100, team_size: 1 }
            }
        };
    }

    setupWebSocketServer(server) {
        this.wsServer = new WebSocket.Server({ 
            server,
            path: '/matchmaking',
            verifyClient: (info) => {
                // Add authentication verification here if needed
                return true;
            }
        });

        this.wsServer.on('connection', (ws, req) => {
            ws.isAlive = true;
            ws.on('pong', () => { ws.isAlive = true; });
            
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this.handleWebSocketMessage(ws, data);
                } catch (error) {
                    LoggerService.log('error', 'WebSocket message error:', error.message);
                    this.sendError(ws, 'Invalid message format');
                }
            });

            ws.on('close', () => {
                this.handlePlayerDisconnect(ws);
            });

            ws.on('error', (error) => {
                LoggerService.log('error', 'WebSocket error:', error.message);
            });
        });

        // Ping all connections every 30 seconds
        setInterval(() => {
            this.wsServer.clients.forEach((ws) => {
                if (!ws.isAlive) {
                    ws.terminate();
                    return;
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        LoggerService.log('success', 'Matchmaking WebSocket server initialized');
    }

    async handleWebSocketMessage(ws, data) {
        switch (data.type) {
            case 'join_queue':
                await this.handleJoinQueue(ws, data);
                break;
            case 'leave_queue':
                await this.handleLeaveQueue(ws, data);
                break;
            case 'ping_test':
                await this.handlePingTest(ws, data);
                break;
            case 'get_regions':
                await this.handleGetRegions(ws);
                break;
            default:
                this.sendError(ws, `Unknown message type: ${data.type}`);
        }
    }

    async handleJoinQueue(ws, data) {
        const { accountId, gamemode, region, playlist } = data;
        
        if (!accountId || !gamemode) {
            return this.sendError(ws, 'Missing required fields: accountId, gamemode');
        }

        // Check if player is already in queue
        if (this.queuedPlayers.has(accountId)) {
            return this.sendError(ws, 'Player already in matchmaking queue');
        }

        const selectedRegion = await this.selectBestRegion(region, accountId);
        const availableServers = this.getAvailableServers(selectedRegion, gamemode);
        
        if (availableServers.length === 0) {
            return this.sendError(ws, 'No available servers for this gamemode and region');
        }

        const queueData = {
            accountId,
            gamemode,
            region: selectedRegion,
            playlist,
            ws,
            joinedAt: Date.now(),
            ticketId: this.generateTicketId(),
            sessionId: this.generateSessionId()
        };

        this.queuedPlayers.set(accountId, queueData);
        await this.startMatchmakingProcess(queueData);
    }

    async handleLeaveQueue(ws, data) {
        const { accountId } = data;
        
        if (this.queuedPlayers.has(accountId)) {
            this.queuedPlayers.delete(accountId);
            this.sendStatusUpdate(ws, { state: "Cancelled" });
            LoggerService.log('info', `Player ${accountId} left matchmaking queue`);
        }
    }

    async handlePingTest(ws, data) {
        const { regions } = data;
        const pingResults = {};

        for (const regionCode of regions) {
            const region = this.gameServers.regions[regionCode];
            if (region && region.ping_url) {
                // Simulate ping test (in real implementation, you'd actually ping)
                pingResults[regionCode] = Math.floor(Math.random() * 150) + 20;
            }
        }

        ws.send(JSON.stringify({
            type: 'ping_results',
            results: pingResults
        }));
    }

    async handleGetRegions(ws) {
        const regions = {};
        
        for (const [code, region] of Object.entries(this.gameServers.regions)) {
            regions[code] = {
                name: region.name,
                code: region.code,
                location: region.location,
                serverCount: region.servers.filter(s => s.status === 'online').length,
                totalPlayers: region.servers.reduce((sum, s) => sum + s.current_players, 0)
            };
        }

        ws.send(JSON.stringify({
            type: 'regions',
            regions
        }));
    }

    async selectBestRegion(preferredRegion, accountId) {
        // If preferred region is specified and available, use it
        if (preferredRegion && this.gameServers.regions[preferredRegion]) {
            const region = this.gameServers.regions[preferredRegion];
            const onlineServers = region.servers.filter(s => s.status === 'online');
            
            if (onlineServers.length > 0) {
                return preferredRegion;
            }
        }

        // Find region with lowest latency (simplified logic)
        // In a real implementation, you'd use actual ping data
        const availableRegions = Object.entries(this.gameServers.regions)
            .filter(([_, region]) => region.servers.some(s => s.status === 'online'))
            .map(([code, region]) => ({
                code,
                region,
                estimatedPing: this.estimatePing(code, accountId)
            }))
            .sort((a, b) => a.estimatedPing - b.estimatedPing);

        return availableRegions.length > 0 ? availableRegions[0].code : 'NA-EAST';
    }

    estimatePing(regionCode, accountId) {
        // Simplified ping estimation based on region
        const basePings = {
            'NA-WEST': 50,
            'NA-EAST': 40,
            'EU-WEST': 80,
            'ASIA': 150,
            'OCE': 200,
            'BRAZIL': 120,
            'MIDDLE-EAST': 100
        };
        
        return basePings[regionCode] || 100;
    }

    getAvailableServers(region, gamemode) {
        if (!this.gameServers.regions[region]) return [];
        
        return this.gameServers.regions[region].servers.filter(server => {
            return server.status === 'online' && 
                   (server.gamemode === gamemode || server.gamemode === 'ANY') &&
                   server.current_players < server.max_players;
        });
    }

    async startMatchmakingProcess(queueData) {
        const { ws, accountId, gamemode, region } = queueData;
        
        try {
            // Step 1: Connecting
            this.sendStatusUpdate(ws, { state: "Connecting" });
            await this.sleep(800);

            // Step 2: Waiting
            this.sendStatusUpdate(ws, {
                state: "Waiting",
                totalPlayers: 1,
                connectedPlayers: 1
            });
            await this.sleep(1000);

            // Step 3: Queued
            const queuedPlayers = this.getQueuedPlayersCount(region, gamemode);
            const estimatedWait = this.calculateEstimatedWait(queuedPlayers);
            
            this.sendStatusUpdate(ws, {
                state: "Queued",
                ticketId: queueData.ticketId,
                queuedPlayers,
                estimatedWaitSec: estimatedWait,
                status: {}
            });
            await this.sleep(Math.min(estimatedWait * 1000, 10000)); // Max 10 seconds for demo

            // Check if player is still in queue
            if (!this.queuedPlayers.has(accountId)) return;

            // Step 4: Session Assignment
            const selectedServer = await this.findBestServer(region, gamemode);
            if (!selectedServer) {
                return this.sendError(ws, 'No available servers');
            }

            const matchId = this.generateMatchId();
            
            this.sendStatusUpdate(ws, {
                state: "SessionAssignment",
                matchId
            });
            await this.sleep(2000);

            // Step 5: Join
            this.sendJoinMessage(ws, {
                matchId,
                sessionId: queueData.sessionId,
                server: selectedServer,
                joinDelaySec: 1
            });

            // Clean up
            this.queuedPlayers.delete(accountId);
            
            // Store player session
            this.playerSessions.set(accountId, {
                matchId,
                sessionId: queueData.sessionId,
                server: selectedServer,
                joinedAt: Date.now()
            });

            LoggerService.log('info', `Player ${accountId} matched to server ${selectedServer.id}`);
            
        } catch (error) {
            LoggerService.log('error', `Matchmaking error for player ${accountId}:`, error.message);
            this.sendError(ws, 'Matchmaking failed');
            this.queuedPlayers.delete(accountId);
        }
    }

    async findBestServer(region, gamemode) {
        const availableServers = this.getAvailableServers(region, gamemode);
        
        if (availableServers.length === 0) return null;

        // Sort by current load (lowest first)
        availableServers.sort((a, b) => {
            const loadA = a.current_players / a.max_players;
            const loadB = b.current_players / b.max_players;
            return loadA - loadB;
        });

        return availableServers[0];
    }

    getQueuedPlayersCount(region, gamemode) {
        return Array.from(this.queuedPlayers.values())
            .filter(p => p.region === region && p.gamemode === gamemode)
            .length;
    }

    calculateEstimatedWait(queuedPlayers) {
        // Simple estimation: more players = longer wait
        return Math.min(queuedPlayers * 2, 60); // Max 60 seconds
    }

    sendStatusUpdate(ws, payload) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                name: "StatusUpdate",
                payload
            }));
        }
    }

    sendJoinMessage(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                name: "Play",
                payload: {
                    matchId: data.matchId,
                    sessionId: data.sessionId,
                    joinDelaySec: data.joinDelaySec
                }
            }));
        }
    }

    sendError(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                name: "Error",
                payload: {
                    message,
                    timestamp: new Date().toISOString()
                }
            }));
        }
    }

    handlePlayerDisconnect(ws) {
        // Find and remove player from queue
        for (const [accountId, queueData] of this.queuedPlayers.entries()) {
            if (queueData.ws === ws) {
                this.queuedPlayers.delete(accountId);
                LoggerService.log('info', `Player ${accountId} disconnected from matchmaking`);
                break;
            }
        }
    }

    // Utility methods
    generateTicketId() {
        return uuidv4().replace(/-/g, '');
    }

    generateMatchId() {
        return uuidv4().replace(/-/g, '');
    }

    generateSessionId() {
        return uuidv4().replace(/-/g, '');
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // API Methods for HTTP endpoints
    async getMatchmakingTicket(accountId, bucketId, region) {
        const selectedRegion = await this.selectBestRegion(region, accountId);
        const wsUrl = this.getWebSocketUrl();
        
        return {
            serviceUrl: wsUrl,
            ticketType: "mms-player",
            payload: Buffer.from(JSON.stringify({
                accountId,
                bucketId,
                region: selectedRegion,
                timestamp: Date.now()
            })).toString('base64'),
            signature: this.generateSignature(accountId)
        };
    }

    async getPlayerSession(accountId, sessionId) {
        const session = this.playerSessions.get(accountId);
        
        if (!session || session.sessionId !== sessionId) {
            throw new Error('Session not found');
        }

        return {
            accountId,
            sessionId,
            key: Buffer.from(`${accountId}:${sessionId}:${Date.now()}`).toString('base64')
        };
    }

    async getSessionDetails(sessionId) {
        // Find session by ID
        for (const [accountId, session] of this.playerSessions.entries()) {
            if (session.sessionId === sessionId) {
                const server = session.server;
                
                return {
                    id: sessionId,
                    ownerId: this.generateSessionId(),
                    ownerName: server.name,
                    serverName: server.name,
                    serverAddress: server.ip,
                    serverPort: server.port,
                    maxPublicPlayers: server.max_players,
                    openPublicPlayers: server.max_players - server.current_players,
                    maxPrivatePlayers: 0,
                    openPrivatePlayers: 0,
                    attributes: {
                        REGION_s: server.region,
                        GAMEMODE_s: "FORTATHENA",
                        ALLOWBROADCASTING_b: true,
                        SUBREGION_s: server.subregion || "US",
                        DCID_s: server.datacenter || `NEODYME-${server.region}-01`,
                        tenant_s: "Fortnite",
                        MATCHMAKINGPOOL_s: "Any",
                        STORMSHIELDDEFENSETYPE_i: 0,
                        HOTFIXVERSION_i: 0,
                        PLAYLISTNAME_s: this.getPlaylistName(server.gamemode),
                        SESSIONKEY_s: this.generateSessionId(),
                        TENANT_s: "Fortnite",
                        BEACONPORT_i: 15009
                    },
                    publicPlayers: [],
                    privatePlayers: [],
                    totalPlayers: server.current_players,
                    allowJoinInProgress: false,
                    shouldAdvertise: false,
                    isDedicated: true,
                    usesStats: true,
                    allowInvites: false,
                    usesPresence: false,
                    allowJoinViaPresence: true,
                    allowJoinViaPresenceFriendsOnly: false,
                    buildUniqueId: server.version || "20.00",
                    lastUpdated: new Date().toISOString(),
                    started: false
                };
            }
        }
        
        throw new Error('Session not found');
    }

    getPlaylistName(gamemode) {
        const playlists = {
            'BR_Solo': 'Playlist_DefaultSolo',
            'BR_Duos': 'Playlist_DefaultDuo',
            'BR_Squads': 'Playlist_DefaultSquad',
            'Creative': 'Playlist_PlaygroundV2',
            'Arena_Solo': 'Playlist_ShowdownAlt_Solo',
            'Arena_Duos': 'Playlist_ShowdownAlt_Duos'
        };
        
        return playlists[gamemode] || 'Playlist_DefaultSolo';
    }

    getWebSocketUrl() {
        // In production, use proper WebSocket URL
        return "ws://127.0.0.1:3551/matchmaking";
    }

    generateSignature(accountId) {
        // Simple signature generation (use proper HMAC in production)
        return Buffer.from(`${accountId}:${Date.now()}`).toString('base64');
    }

    async updateServerStatus() {
        try {
            // Update server player counts and status
            // In a real implementation, you'd ping actual game servers
            for (const region of Object.values(this.gameServers.regions)) {
                for (const server of region.servers) {
                    if (server.status === 'online') {
                        // Simulate player count fluctuation
                        const change = Math.floor(Math.random() * 10) - 5; // -5 to +5
                        server.current_players = Math.max(0, Math.min(server.max_players, server.current_players + change));
                        server.last_updated = new Date().toISOString();
                    }
                }
            }
            
            // Save updated server list
            await this.saveGameServers();
            
        } catch (error) {
            LoggerService.log('error', 'Failed to update server status:', error.message);
        }
    }

    async saveGameServers() {
        try {
            const gameServersPath = path.join(process.cwd(), 'gameservers_list.json');
            await fs.writeFile(gameServersPath, JSON.stringify(this.gameServers, null, 2));
        } catch (error) {
            LoggerService.log('error', 'Failed to save game servers:', error.message);
        }
    }

    // Admin methods for server management
    async addGameServer(regionCode, serverData) {
        if (!this.gameServers.regions[regionCode]) {
            throw new Error(`Region ${regionCode} not found`);
        }

        const server = {
            id: serverData.id || `${regionCode.toLowerCase()}-${Date.now()}`,
            name: serverData.name || `[DS]neodyme-${regionCode.toLowerCase()}-server`,
            ip: serverData.ip,
            port: serverData.port || 7777,
            status: serverData.status || 'online',
            max_players: serverData.max_players || 100,
            current_players: 0,
            gamemode: serverData.gamemode || 'BR_Solo',
            version: serverData.version || '20.00',
            region: regionCode,
            subregion: serverData.subregion,
            datacenter: serverData.datacenter,
            last_updated: new Date().toISOString()
        };

        this.gameServers.regions[regionCode].servers.push(server);
        await this.saveGameServers();
        
        LoggerService.log('success', `Added server ${server.id} to region ${regionCode}`);
        return server;
    }

    async removeGameServer(regionCode, serverId) {
        if (!this.gameServers.regions[regionCode]) {
            throw new Error(`Region ${regionCode} not found`);
        }

        const region = this.gameServers.regions[regionCode];
        const serverIndex = region.servers.findIndex(s => s.id === serverId);
        
        if (serverIndex === -1) {
            throw new Error(`Server ${serverId} not found in region ${regionCode}`);
        }

        region.servers.splice(serverIndex, 1);
        await this.saveGameServers();
        
        LoggerService.log('info', `Removed server ${serverId} from region ${regionCode}`);
    }

    async updateGameServer(regionCode, serverId, updates) {
        if (!this.gameServers.regions[regionCode]) {
            throw new Error(`Region ${regionCode} not found`);
        }

        const server = this.gameServers.regions[regionCode].servers.find(s => s.id === serverId);
        if (!server) {
            throw new Error(`Server ${serverId} not found in region ${regionCode}`);
        }

        Object.assign(server, updates, {
            last_updated: new Date().toISOString()
        });

        await this.saveGameServers();
        
        LoggerService.log('info', `Updated server ${serverId} in region ${regionCode}`);
        return server;
    }

    // Statistics methods
    getMatchmakingStats() {
        const queuedPlayers = this.queuedPlayers.size;
        const activeSessions = this.playerSessions.size;
        
        const regionStats = {};
        let totalOnlineServers = 0;
        let totalPlayers = 0;

        for (const [regionCode, region] of Object.entries(this.gameServers.regions)) {
            const onlineServers = region.servers.filter(s => s.status === 'online');
            const regionPlayers = region.servers.reduce((sum, s) => sum + s.current_players, 0);
            
            regionStats[regionCode] = {
                name: region.name,
                onlineServers: onlineServers.length,
                totalServers: region.servers.length,
                currentPlayers: regionPlayers,
                maxCapacity: region.servers.reduce((sum, s) => sum + s.max_players, 0)
            };
            
            totalOnlineServers += onlineServers.length;
            totalPlayers += regionPlayers;
        }

        return {
            queuedPlayers,
            activeSessions,
            totalOnlineServers,
            totalPlayers,
            regionStats,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };
    }

    // Get best servers for a specific region and gamemode
    getBestServers(regionCode, gamemode, limit = 5) {
        if (!this.gameServers.regions[regionCode]) {
            return [];
        }

        const availableServers = this.getAvailableServers(regionCode, gamemode);
        
        return availableServers
            .sort((a, b) => {
                // Sort by load (ascending) and then by current players (ascending)
                const loadA = a.current_players / a.max_players;
                const loadB = b.current_players / b.max_players;
                
                if (loadA !== loadB) {
                    return loadA - loadB;
                }
                
                return a.current_players - b.current_players;
            })
            .slice(0, limit);
    }

    // Clean up old sessions and inactive queues
    cleanup() {
        const now = Date.now();
        const maxQueueTime = 5 * 60 * 1000; // 5 minutes
        const maxSessionAge = 60 * 60 * 1000; // 1 hour

        // Clean up old queued players
        for (const [accountId, queueData] of this.queuedPlayers.entries()) {
            if (now - queueData.joinedAt > maxQueueTime) {
                this.queuedPlayers.delete(accountId);
                if (queueData.ws && queueData.ws.readyState === WebSocket.OPEN) {
                    this.sendError(queueData.ws, 'Matchmaking timeout');
                }
                LoggerService.log('info', `Cleaned up expired queue entry for player ${accountId}`);
            }
        }

        // Clean up old player sessions
        for (const [accountId, session] of this.playerSessions.entries()) {
            if (now - session.joinedAt > maxSessionAge) {
                this.playerSessions.delete(accountId);
                LoggerService.log('info', `Cleaned up expired session for player ${accountId}`);
            }
        }
    }

    // Initialize cleanup interval
    startCleanupInterval() {
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000); // Run every 5 minutes
    }
}

// Export singleton instance
module.exports = new MatchmakingService();