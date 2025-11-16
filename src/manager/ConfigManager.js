const fs = require('fs').promises;
const path = require('path');

const LoggerService = require('../service/logger/LoggerService');
const { debug } = require('console');

class ConfigManager {
    static config = {};

    static async load() {
        try{
            const configPath = path.join(__dirname, '..', '..', 'server.properties');
            const configData = await fs.readFile(configPath, 'utf-8');
    
            configData.split('\n').forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [key, value] = line.split('=').map(s => s.trim());
                    if (key && value !== undefined) {
                        if (value === 'true' || value === 'false') {
                            this.config[key] = value === 'true';
                        } else if (!isNaN(value)) {
                            this.config[key] = Number(value);
                        } else {
                            this.config[key] = value;
                        }
                    }
                }
            });

            LoggerService.log('info', 'Version: ' + this.config.version);

            if (this.config.customVersion === false) {
                LoggerService.log('info', 'Fortnite version: ' + this.config.fnVersion);
            }

            LoggerService.log('success', 'Configuration loaded successfully.');
        } catch (error) {
            LoggerService.log('error', `Failed to load configuration: ${error.message}`);
            this.config = {
                port: 3551,
                version: '1.1.0',
                apiVersion: 'v1.1',
                customVersion: true,
                fnVersion: 3.60,
                debug: true,
                debugRequests: false,
                debugResponses: false,
                debugIps: false,
                plugins: true,
                autoShopRotation: true,
                xmppEnable: true,
                xmppPort: 80,
                databaseType: 'json',
                databasePath: 'data/',
                databaseLogging: false,
                databaseBackup: true,
                databaseBackupInterval: 60,
                databaseBackupExpiryDays: 7,
                jsonBeautify: true,
                sqliteJournalMode: 'WAL',
                rateLimiting: true,
                maxRequestsPerMinute: 100,
                apiKey: 'secret_api_key_change_me_in_production',
                corsEnabled: true,
                compressionEnable: true,
                helmetEnable: true,
                trustProxy: true,
                LimitBodySize: '50mb',
                jwtSecret: 'your-super-secret-key-change-this-in-production',
                accessTokenExpiryHours: 8,
                exchangeTokenExpiryMinutes: 5,
                refreshTokenExpiryDays: 30,
                maxSessionsPerAccount: 5,
                allowMultipleSessions: true,
                webInterface: true,
                maxPlayers: 10000,
                waitingRoomThreshold: 80,
                waitingRoom_1: 2,
                gameServerSecret: 'your-gameserver-secret-key-change-this',
                gameServerHeartbeatInterval: 30,
                gameServerTimeout: 120,
                maintenanceMode: false,
                maintenanceMessage: 'The server is currently under maintenance. Please try again later.',
                maintenanceEstimatedDowntime: '2025-10-27T15:00:00Z',
                bGrantFoundersPacks: false,
                bAllSTWEventsActivated: false,
                bCompletedSeasonalQuests: false
            };
        }
    }

    static get(key, defaultValue = null) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }
}

module.exports = ConfigManager;