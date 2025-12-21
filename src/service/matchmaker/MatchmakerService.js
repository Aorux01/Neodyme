const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const LoggerService = require('../logger/LoggerService');
const ConfigManager = require('../../manager/ConfigManager');
const GameServerManager = require('../../manager/GameServerManager');
 
class MatchmakerService {
    static tickets = new Map();
    static queues = new Map();
    static assignedServers = new Map();
    static matchmakingConfig = null;
 
    static initialize() {
        this.matchmakingConfig = GameServerManager.config?.matchmaking_settings || {
            min_players_to_start: 2,
            max_players_in_queue: 1000,
            queue_timeout_seconds: 300
        };
 
        setInterval(() => {
            this.recycleServers();
        }, 60000);
 
        LoggerService.log('success', 'MatchmakerService initialized');
    }
 
    static createTicket(accountId, bucketId, attributes) {
        const [buildId, unknown, region, playlistRaw] = bucketId.split(':');
 
        if (!region) {
            throw new Error('Invalid bucketId format');
        }
 
        const playlist = this.normalizePlaylist(playlistRaw);
        const gamemode = this.playlistToGamemode(playlist);
 
        if (!gamemode) {
            throw new Error(`Unknown playlist: ${playlist}`);
        }
 
        const ticketId = uuidv4().replace(/-/gi, '');
        const matchId = uuidv4().replace(/-/gi, '');
        const sessionId = uuidv4().replace(/-/gi, '');
 
        const ticket = {
            ticketId,
            matchId,
            sessionId,
            accountId,
            region: region.toUpperCase(),
            playlist,
            gamemode,
            buildId,
            attributes: attributes || {},
            createdAt: Date.now(),
            status: 'connecting',
            assignedServer: null
        };
 
        this.tickets.set(accountId, ticket);
 
        LoggerService.log('info', `Matchmaking ticket created for ${accountId} - ${gamemode} in ${region}`);
 
        return ticket;
    }
 
    static addToQueue(accountId) {
        const ticket = this.tickets.get(accountId);
        if (!ticket) {
            throw new Error('Ticket not found');
        }
 
        const queueKey = `${ticket.region}:${ticket.playlist}`;
 
        if (!this.queues.has(queueKey)) {
            this.queues.set(queueKey, new Set());
        }
 
        const queue = this.queues.get(queueKey);
 
        if (queue.size >= this.matchmakingConfig.max_players_in_queue) {
            return false;
        }
 
        queue.add(accountId);
        ticket.status = 'queued';
 
        LoggerService.log('debug', `Player ${accountId} added to queue ${queueKey} (${queue.size} players)`);
 
        return true;
    }
 
    static removeFromQueue(accountId) {
        const ticket = this.tickets.get(accountId);
        if (!ticket) return;
 
        const queueKey = `${ticket.region}:${ticket.playlist}`;
        const queue = this.queues.get(queueKey);
 
        if (queue) {
            queue.delete(accountId);
            LoggerService.log('debug', `Player ${accountId} removed from queue ${queueKey}`);
 
            if (queue.size === 0) {
                this.queues.delete(queueKey);
            }
        }
    }
 
    static getQueuedPlayerCount(region, playlist) {
        const queueKey = `${region}:${playlist}`;
        const queue = this.queues.get(queueKey);
        return queue ? queue.size : 0;
    }
 
    static canStartMatch(region, playlist) {
        const count = this.getQueuedPlayerCount(region, playlist);
        return count >= this.matchmakingConfig.min_players_to_start;
    }
 
    static assignServer(accountId) {
        const ticket = this.tickets.get(accountId);
        if (!ticket) {
            throw new Error('Ticket not found');
        }
 
        let server = this.findAvailableServer(ticket.gamemode, ticket.region);
 
        if (!server) {
            server = this.findAvailableServer(ticket.gamemode, null);
        }
 
        if (!server) {
            LoggerService.log('warn', `No available server for ${ticket.gamemode} in ${ticket.region}`);
            return null;
        }
 
        const gameModConfig = GameServerManager.config?.game_modes?.[ticket.gamemode];
        const timeBetweenGames = (gameModConfig?.time_between_games || 25) * 60 * 1000; // Convert to ms
 
        this.assignedServers.set(server.id, {
            assignedAt: Date.now(),
            recycleAt: Date.now() + timeBetweenGames,
            matchId: ticket.matchId,
            accountId: ticket.accountId
        });
 
        const playlistName = gameModConfig?.playlist || 'Playlist_DefaultSolo';
 
        ticket.assignedServer = {
            gameserverIP: server.ip,
            gameserverPort: server.port,
            PLAYLISTNAME_s: playlistName,
            REGION_s: ticket.region,
            serverName: server.name,
            serverId: server.id
        };
 
        ticket.status = 'session_assigned';
 
        LoggerService.log('success', `Server ${server.id} assigned to ${accountId} for match ${ticket.matchId}`);
 
        return ticket.assignedServer;
    }
 
    static findAvailableServer(gamemode, region = null) {
        const config = GameServerManager.config;
        if (!config || !config.regions) return null;
 
        const regionKeys = region
            ? [region]
            : Object.keys(config.regions);
 
        for (const regionKey of regionKeys) {
            const regionData = config.regions[regionKey];
            if (!regionData || !regionData.servers) continue;
 
            for (const server of regionData.servers) {
                if (server.gamemode === gamemode &&
                    server.status === 'online' &&
                    !this.assignedServers.has(server.id)) {
                    return server;
                }
            }
        }
 
        return null;
    }
 
    static recycleServers() {
        const now = Date.now();
        let recycled = 0;
 
        for (const [serverId, assignment] of this.assignedServers.entries()) {
            if (now >= assignment.recycleAt) {
                this.assignedServers.delete(serverId);
                recycled++;
                LoggerService.log('info', `Server ${serverId} recycled and available again`);
            }
        }
 
        if (recycled > 0) {
            LoggerService.log('success', `Recycled ${recycled} server(s)`);
        }
    }
 
    static getTicket(accountId) {
        return this.tickets.get(accountId);
    }
 
    static deleteTicket(accountId) {
        this.removeFromQueue(accountId);
        this.tickets.delete(accountId);
    }
 
    static normalizePlaylist(playlist) {
        if (!playlist) return 'none';
 
        const lower = playlist.toLowerCase();
 
        const gameModes = GameServerManager.config?.game_modes || {};
 
        for (const [gamemode, config] of Object.entries(gameModes)) {
            if (config.legacy_id === lower ||
                config.playlist_id === lower ||
                config.playlist.toLowerCase() === lower) {
                return config.playlist_id;
            }
        }
 
        return lower;
    }
 
    static playlistToGamemode(playlist) {
        const gameModes = GameServerManager.config?.game_modes || {};
 
        for (const [gamemode, config] of Object.entries(gameModes)) {
            if (config.playlist_id === playlist ||
                config.legacy_id === playlist ||
                config.playlist.toLowerCase() === playlist.toLowerCase()) {
                return gamemode;
            }
        }
 
        if (playlist === 'none' || playlist === '2') {
            return 'BR_Solo';
        }
 
        return null;
    }
 
    static getQueuedPlayers(region, playlist) {
        const queueKey = `${region}:${playlist}`;
        const queue = this.queues.get(queueKey);
        return queue ? Array.from(queue) : [];
    }
 
    static getStats() {
        const totalQueued = Array.from(this.queues.values())
            .reduce((sum, queue) => sum + queue.size, 0);
 
        return {
            totalTickets: this.tickets.size,
            totalQueued,
            totalAssignedServers: this.assignedServers.size,
            queues: Array.from(this.queues.entries()).map(([key, queue]) => ({
                key,
                players: queue.size
            }))
        };
    }
 
    static generatePayload(accountId, bucketId, queryParams) {
        const ticket = this.tickets.get(accountId);
        if (!ticket) {
            throw new Error('Ticket not found');
        }
 
        const payload = {
            playerId: accountId,
            partyPlayerId: queryParams['player.partyPlayerIds'] || accountId,
            bucketId: bucketId,
            serverPlaylist: queryParams['player.option.linkCode'] || ticket.playlist,
            attributes: {
                'player.mms.region': ticket.region,
                'player.userAgent': queryParams['player.userAgent'] || '',
                'player.preferredSubregion': queryParams['player.subregions']?.split(',')[0] || ticket.region,
                'player.option.spectator': 'false',
                'player.inputTypes': queryParams['player.inputTypes'] || '',
                'player.revision': queryParams['player.revision'] || '1',
                'player.teamFormat': 'fun',
                'player.subregions': queryParams['player.subregions'] || ticket.region,
                'player.season': queryParams['player.season'] || '1',
                'player.platform': queryParams['player.platform'] || 'Windows',
                'player.option.linkCode': queryParams['player.option.linkCode']?.toLowerCase() || ticket.playlist,
                'player.option.linkType': 'DEFAULT',
                'player.input': queryParams['player.input'] || 'KBM',
                'playlist.revision': queryParams['playlist.revision'] || '1',
                'player.option.fillTeam': queryParams['player.option.fillTeam'] || 'true',
                'player.option.uiLanguage': 'en',
                'player.option.microphoneEnabled': queryParams['player.option.microphoneEnabled'] || 'false',
                'player.option.partyId': queryParams['player.option.partyId'] || uuidv4()
            },
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            nonce: uuidv4().replace(/-/gi, '')
        };
 
        return payload;
    }
 
    static signPayload(payload) {
        const secret = ConfigManager.key('jwtSecret');
        return jwt.sign(payload, secret, { expiresIn: '10m' });
    }
}
 
module.exports = MatchmakerService;
