const crypto = require('crypto');
const LoggerService = require('../logger/LoggerService');
const MatchmakingService = require('./MatchmakerService');

class Matchmaker {
    static async handleConnection(ws) {
        try {
            const ticketId = crypto.randomBytes(16).toString('hex').replace(/-/g, '');
            const matchId = crypto.randomBytes(16).toString('hex').replace(/-/g, '');
            const sessionId = crypto.randomBytes(16).toString('hex').replace(/-/g, '');

            this.sendConnecting(ws);
            
            await this.sleep(800);
            if (ws.readyState !== 1) return;
            this.sendWaiting(ws);
            
            await this.sleep(1000);
            if (ws.readyState !== 1) return;
            this.sendQueued(ws, ticketId);
            
            await this.sleep(4000);
            if (ws.readyState !== 1) return;
            this.sendSessionAssignment(ws, matchId);
            
            await this.sleep(2000);
            if (ws.readyState !== 1) return;
            this.sendPlay(ws, matchId, sessionId);

            LoggerService.log('debug', `Matchmaking flow completed: sessionId=${sessionId}`);
        } catch (error) {
            LoggerService.log('error', `Matchmaker error: ${error.message}`);
        }
    }

    static sendConnecting(ws) {
        this.sendStatus(ws, 'Connecting', {});
    }

    static sendWaiting(ws) {
        this.sendStatus(ws, 'Waiting', {
            totalPlayers: 1,
            connectedPlayers: 1
        });
    }

    static sendQueued(ws, ticketId) {
        this.sendStatus(ws, 'Queued', {
            ticketId: ticketId,
            queuedPlayers: 0,
            estimatedWaitSec: 0,
            status: {}
        });
    }

    static sendSessionAssignment(ws, matchId) {
        this.sendStatus(ws, 'SessionAssignment', {
            matchId: matchId
        });
    }

    static sendPlay(ws, matchId, sessionId) {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({
                payload: {
                    matchId: matchId,
                    sessionId: sessionId,
                    joinDelaySec: 1
                },
                name: 'Play'
            }));
        }
    }

    static sendStatus(ws, state, payload) {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({
                payload: {
                    state: state,
                    ...payload
                },
                name: 'StatusUpdate'
            }));
        }
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Matchmaker;