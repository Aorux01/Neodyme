const fs = require('fs');
const path = require('path');
const LoggerService = require('../service/logger/LoggerService');
const ConfigManager = require('./ConfigManager');

class GameServerManager {
    static gameServers = new Map();
    static configPath = path.join(__dirname, '..', '..', 'config', 'GameServers.json');
    static config = null;
    
    static load() {
        if (!fs.existsSync(this.configPath)) {
            LoggerService.log('error', 'GameServers.json not found');
            this.config = { regions: {}, game_modes: {}, matchmaking_settings: {} };
            return;
        }
        
        this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        LoggerService.log('success', `Loaded ${this.getTotalServers()} game servers across ${Object.keys(this.config.regions).length} regions`);
    }
    
    static registerServer(serverId, serverData, secret) {
        const expectedSecret = ConfigManager.key('gameServerSecret');
        
        if (secret !== expectedSecret) {
            throw new Error('Invalid gameserver secret');
        }
        
        this.gameServers.set(serverId, {
            ...serverData,
            lastHeartbeat: Date.now(),
            status: 'online'
        });
        
        LoggerService.log('success', `GameServer registered: ${serverId} (${serverData.region})`);
        return true;
    }
    
    static heartbeat(serverId, currentPlayers, status) {
        const server = this.gameServers.get(serverId);
        
        if (!server) {
            return false;
        }
        
        server.lastHeartbeat = Date.now();
        server.current_players = currentPlayers;
        server.status = status;
        
        return true;
    }
    
    static unregisterServer(serverId) {
        if (this.gameServers.has(serverId)) {
            this.gameServers.delete(serverId);
            LoggerService.log('info', `GameServer unregistered: ${serverId}`);
            return true;
        }
        return false;
    }
    
    static cleanInactiveServers() {
        const timeout = (ConfigManager.get('gameServerTimeout')) * 1000;
        const now = Date.now();
        
        for (const [serverId, server] of this.gameServers.entries()) {
            if (now - server.lastHeartbeat > timeout) {
                LoggerService.log('warn', `GameServer ${serverId} timed out, removing`);
                this.gameServers.delete(serverId);
            }
        }
    }
    
    static findBestServer(gamemode, region = null) {
        let availableServers = Array.from(this.gameServers.values()).filter(server => 
            server.status === 'online' &&
            server.gamemode === gamemode &&
            server.current_players < server.max_players
        );
        
        if (region) {
            availableServers = availableServers.filter(s => s.region === region);
        }
        
        if (availableServers.length === 0) {
            return null;
        }
        
        availableServers.sort((a, b) => b.current_players - a.current_players);
        
        return availableServers[0];
    }
    
    static getActiveServers() {
        return Array.from(this.gameServers.values());
    }
    
    static getServersByRegion(region) {
        return Array.from(this.gameServers.values()).filter(s => s.region === region);
    }
    
    static getTotalServers() {
        let total = 0;
        if (this.config && this.config.regions) {
            Object.values(this.config.regions).forEach(region => {
                total += region.servers.length;
            });
        }
        return total;
    }
    
    static getTotalPlayers() {
        let total = 0;
        this.gameServers.forEach(server => {
            total += server.current_players || 0;
        });
        return total;
    }
}

setInterval(() => {
    GameServerManager.cleanInactiveServers();
}, 60000);

module.exports = GameServerManager;
