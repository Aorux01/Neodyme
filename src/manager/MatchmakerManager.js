const jwt = require('jsonwebtoken');
const LoggerService = require('../service/logger/LoggerService');
const ConfigManager = require('./ConfigManager');
const MatchmakerService = require('../service/matchmaker/MatchmakerService');
const GameServerManager = require('./GameServerManager');
 
class MatchmakerManager {
    static clients = new Map();
 
    static async handleConnection(ws, req) {
        ws.on('error', () => {});
 
        try {
            const authHeader = req.headers['authorization'];
            if (!authHeader) {
                LoggerService.log('warn', 'Matchmaking connection without authorization header');
                ws.close();
                return;
            }
 
            const parts = authHeader.split(' ');
            if (parts.length < 3) {
                LoggerService.log('warn', 'Invalid authorization header format');
                ws.close();
                return;
            }
 
            const payload = parts[2];
            const secret = ConfigManager.get('jwtSecret') || 'your-secret-key';
 
            let decodedPayload;
            try {
                decodedPayload = jwt.verify(payload, secret);
            } catch (err) {
                LoggerService.log('warn', `Invalid JWT token: ${err.message}`);
                ws.close();
                return;
            }
 
            const accountId = decodedPayload.playerId;
            const region = decodedPayload.attributes['player.mms.region'];
            const playlist = decodedPayload.attributes['player.option.linkCode'];
 
            if (!accountId || !region) {
                LoggerService.log('warn', 'Missing required fields in JWT payload');
                ws.close();
                return;
            }
 
            let ticket = MatchmakerService.getTicket(accountId);
            if (!ticket) {
                LoggerService.log('warn', `No ticket found for ${accountId}, connection rejected`);
                ws.close();
                return;
            }
 
            this.clients.set(ws, {
                accountId,
                ticket,
                region,
                playlist,
                queued: false
            });
 
            LoggerService.log('info', `Matchmaking WebSocket connected: ${accountId}`);
 
            await this.runMatchmakingFlow(ws);
 
        } catch (error) {
            LoggerService.log('error', `Matchmaking connection error: ${error.message}`);
            ws.close();
        }
 
        ws.on('close', () => {
            const clientData = this.clients.get(ws);
            if (clientData) {
                MatchmakerService.removeFromQueue(clientData.accountId);
                this.clients.delete(ws);
                LoggerService.log('info', `Matchmaking WebSocket disconnected: ${clientData.accountId}`);
            }
        });
 
        ws.on('message', (message) => {
            if (Buffer.isBuffer(message)) message = message.toString();
            LoggerService.log('debug', `Matchmaking message: ${message}`);
        });
    }
 
    static async runMatchmakingFlow(ws) {
        const clientData = this.clients.get(ws);
        if (!clientData) return;
 
        const { accountId, ticket, region, playlist } = clientData;
        const config = GameServerManager.config?.matchmaking_settings || {};
 
        try {
            this.sendStatus(ws, 'Connecting', {});
            await this.sleep(config.connecting_delay_ms || 800);
 
            if (!this.clients.has(ws) || ws.readyState !== ws.OPEN) return;
 
            const queueCount = MatchmakerService.getQueuedPlayerCount(region, playlist);
            const maxQueue = config.max_players_in_queue || 1000;
 
            while (queueCount >= maxQueue && ws.readyState === ws.OPEN) {
                this.sendStatus(ws, 'QueueFull', {});
                await this.sleep(500);
            }
 
            this.sendStatus(ws, 'Waiting', {
                totalPlayers: 1,
                connectedPlayers: 1
            });
            await this.sleep(config.waiting_delay_ms || 1000);
 
            if (!this.clients.has(ws) || ws.readyState !== ws.OPEN) return;
 
            const added = MatchmakerService.addToQueue(accountId);
            if (!added) {
                LoggerService.log('warn', `Failed to add ${accountId} to queue`);
                ws.close();
                return;
            }
 
            clientData.queued = true;
 
            this.sendQueuedStatus(ws);
            await this.sleep(200);
 
            const minPlayers = config.min_players_to_start || 2;
 
            while (!MatchmakerService.canStartMatch(region, playlist) && ws.readyState === ws.OPEN) {
                this.updateQueueForAll(region, playlist);
                await this.sleep(config.queue_update_interval_ms || 1500);
            }
 
            if (!this.clients.has(ws) || ws.readyState !== ws.OPEN) return;
 
            await this.sleep(1500);
 
            this.sendStatus(ws, 'SessionAssignment', {
                matchId: ticket.matchId
            });
 
            await this.sleep(config.session_assignment_delay_ms || 2000);
 
            if (!this.clients.has(ws) || ws.readyState !== ws.OPEN) return;
 
            const server = MatchmakerService.assignServer(accountId);
 
            if (!server) {
                LoggerService.log('error', `No available server for ${accountId}`);
                this.sendStatus(ws, 'Error', {
                    errorMessage: 'No servers available'
                });
                ws.close();
                return;
            }
 
            await this.sleep(200);
 
            clientData.queued = false;
            this.sendJoin(ws);
 
            LoggerService.log('success', `Player ${accountId} matched successfully to ${server.serverName}`);
 
        } catch (error) {
            LoggerService.log('error', `Matchmaking flow error for ${accountId}: ${error.message}`);
            ws.close();
        }
    }
 
    static sendStatus(ws, state, payload) {
        if (ws.readyState !== ws.OPEN) return;
 
        ws.send(JSON.stringify({
            payload: {
                state,
                ...payload
            },
            name: 'StatusUpdate'
        }));
    }
 
    static sendQueuedStatus(ws) {
        const clientData = this.clients.get(ws);
        if (!clientData || ws.readyState !== ws.OPEN) return;
 
        const { ticket, region, playlist } = clientData;
        const queuedPlayers = MatchmakerService.getQueuedPlayerCount(region, playlist);
 
        ws.send(JSON.stringify({
            payload: {
                ticketId: ticket.ticketId,
                queuedPlayers: queuedPlayers,
                estimatedWaitSec: 5,
                status: {
                    'ticket.status.creative.islandCode': playlist
                },
                state: 'Queued'
            },
            name: 'StatusUpdate'
        }));
    }
 
    static sendJoin(ws) {
        const clientData = this.clients.get(ws);
        if (!clientData || ws.readyState !== ws.OPEN) return;
 
        const { ticket, accountId } = clientData;
        const secret = ConfigManager.get('jwtSecret') || 'your-secret-key';
 
        const serverPayload = jwt.sign(
            {
                accountId: accountId,
                server: ticket.assignedServer
            },
            secret,
            { expiresIn: '1h' }
        );
 
        ws.send(JSON.stringify({
            payload: {
                matchId: ticket.matchId,
                sessionId: ticket.sessionId,
                playerId: accountId,
                joinDelaySec: 3,
                payloadJwt: serverPayload
            },
            name: 'Play'
        }));
    }
 
    static updateQueueForAll(region, playlist) {
        const queuedPlayers = MatchmakerService.getQueuedPlayerCount(region, playlist);
 
        this.clients.forEach((clientData, ws) => {
            if (clientData.queued &&
                clientData.region === region &&
                clientData.playlist === playlist &&
                ws.readyState === ws.OPEN) {
 
                ws.send(JSON.stringify({
                    payload: {
                        ticketId: clientData.ticket.ticketId,
                        queuedPlayers: queuedPlayers,
                        estimatedWaitSec: 5,
                        status: {
                            'ticket.status.creative.islandCode': playlist
                        },
                        state: 'Queued'
                    },
                    name: 'StatusUpdate'
                }));
            }
        });
    }
 
    static getQueuedPlayerCount(region, playlist) {
        let count = 0;
        this.clients.forEach((clientData) => {
            if (clientData.queued &&
                clientData.region === region &&
                clientData.playlist === playlist) {
                count++;
            }
        });
        return count;
    }
 
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
 
    static initialize() {
        MatchmakerService.initialize();
        LoggerService.log('success', 'MatchmakerManager initialized');
    }

    static getStats() {
        return {
            connectedClients: this.clients.size,
            ...MatchmakerService.getStats()
        };
    }
}
 
module.exports = MatchmakerManager;