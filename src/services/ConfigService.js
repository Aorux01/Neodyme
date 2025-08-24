const fs = require('fs');
const path = require('path');

class ConfigService {
    constructor() {
        this.configPath = path.join(process.cwd(), 'server.properties');
        this.config = {};
        this.watchers = [];
        this.loadConfig();
        this.setupFileWatcher();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const content = fs.readFileSync(this.configPath, 'utf-8');
                this.parseProperties(content);
                console.log(`✅ Configuration loaded from ${this.configPath}`);
            } else {
                console.log(`⚠️  Configuration file not found at ${this.configPath}, creating default...`);
                this.createDefaultConfig();
            }
        } catch (error) {
            console.error('❌ Failed to load server.properties:', error.message);
            this.setDefaults();
        }
    }

    parseProperties(content) {
        const lines = content.split('\n');
        this.config = {}; // Reset config
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (trimmed.startsWith('#') || trimmed === '') {
                continue;
            }
            
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex > 0) {
                const key = trimmed.substring(0, equalIndex).trim();
                const value = trimmed.substring(equalIndex + 1).trim();
                this.config[key] = this.parseValue(value);
            }
        }
    }

    parseValue(value) {
        // Handle empty values
        if (value === '') return '';
        
        // Parse boolean
        if (value === 'true') return true;
        if (value === 'false') return false;
        
        // Parse number (including floats)
        if (!isNaN(value) && !isNaN(parseFloat(value)) && value !== '') {
            return value.includes('.') ? parseFloat(value) : parseInt(value);
        }
        
        // Parse array (comma separated)
        if (value.includes(',') && !value.startsWith('http')) {
            return value.split(',').map(v => v.trim()).filter(v => v !== '');
        }
        
        // Return as string
        return value;
    }

    setupFileWatcher() {
        if (fs.existsSync(this.configPath)) {
            fs.watchFile(this.configPath, (curr, prev) => {
                if (curr.mtime !== prev.mtime) {
                    console.log('🔄 Configuration file changed, reloading...');
                    this.loadConfig();
                    this.notifyWatchers();
                }
            });
        }
    }

    addWatcher(callback) {
        this.watchers.push(callback);
    }

    notifyWatchers() {
        this.watchers.forEach(callback => {
            try {
                callback(this.config);
            } catch (error) {
                console.error('❌ Error in config watcher:', error.message);
            }
        });
    }

    createDefaultConfig() {
        const defaultConfig = `# Neodyme Server Configuration
# This file contains all the configuration options for the Neodyme server

# Server Settings
port=3551
host=0.0.0.0
apiVersion=v1
customVersion=false
version=1.0.0

# XMPP Settings
xmppEnabled=true
xmppPort=443
xmppHost=0.0.0.0
xmppDomain=neodyme.local

# Debug Settings
debug=true
debugRequests=true
debugResponses=false
debugIps=false
logLevel=info

# Password Launcher Settings
launcherBypassEnabled=true
launcherPasswords=Rebooted,Launcher
launcherAutoCreateAccounts=true

# Security Settings
corsEnabled=true
compression=true
helmet=true
trustProxy=true

# Rate Limiting
rateLimit=100
rateLimitWindow=60000

# File Size Limits
maxUploadSize=52428800
maxRequestSize=10485760

# Plugin System
pluginsEnabled=true
pluginDirectory=plugins

# Database Settings
databaseType=json
databasePath=data
playersDirectory=data/players
clientsFile=data/clients.json

# Authentication Settings
sessionTimeout=86400000
refreshTokenExpiry=604800000
accessTokenExpiry=14400000
exchangeCodeExpiry=300000

# Two-Factor Authentication
twoFactorEnabled=true
twoFactorIssuer=Neodyme

# Shop Settings
shopEnabled=true
shopRotationInterval=86400000
featuredRotationInterval=86400000

# Matchmaking Settings
matchmakingEnabled=true
matchmakingRegions=NAE,NAW,EU,OCE,BR,ASIA,ME
matchmakingTimeout=300000

# Party Settings
partyMaxSize=16
partyInviteTimeout=300000

# Friends Settings
maxFriends=1000
maxFriendRequests=100

# CloudStorage Settings
cloudStorageEnabled=true
cloudStorageMaxSize=104857600
cloudStorageMaxFiles=100

# SSL/TLS Settings
sslEnabled=false
sslCert=
sslKey=
sslPort=443

# Advanced Settings
clusterEnabled=false
workerId=1
workerCount=1

# Performance Settings
requestTimeout=30000
keepAliveTimeout=65000
headersTimeout=60000

# Logging Settings
logToFile=true
logDirectory=logs
logRotation=daily
maxLogSize=10485760
maxLogFiles=30

# Game Server Settings
gameServerListFile=gameserver_lists.json
gameServerHeartbeatInterval=30000
gameServerTimeout=60000

# Content Delivery
staticContentPath=static-content
assetsPath=static-content/assets

# Development Settings
hotReload=false
sourceMapSupport=true

# Feature Flags
featuresV2Enabled=true
newShopEnabled=true
creativeEnabled=true
competitiveEnabled=true
saveTheWorldEnabled=false

# Email Settings
emailEnabled=false
emailHost=
emailPort=587
emailSecure=false
emailUser=
emailPass=
emailFrom=noreply@neodyme.local

# Discord Integration
discordEnabled=false
discordWebhook=
discordNotifyOnError=true
discordNotifyOnStart=true

# Backup Settings
backupEnabled=true
backupInterval=86400000
backupPath=backups
maxBackups=7

# Web Interface
webEnabled=true
webPort=3551
webDirectory=web

# Custom Settings
customBanner=Welcome to Neodyme!
maintenanceMode=false
maintenanceMessage=Server is under maintenance. Please try again later.
`;

        try {
            fs.writeFileSync(this.configPath, defaultConfig, 'utf-8');
            this.parseProperties(defaultConfig);
            console.log('✅ Created default server.properties file');
        } catch (error) {
            console.error('❌ Failed to create default config:', error.message);
            this.setDefaults();
        }
    }

    setDefaults() {
        this.config = {
            // Server Settings
            port: 3551,
            host: '0.0.0.0',
            apiVersion: 'v1',
            customVersion: false,
            version: '1.0.0',
            
            // XMPP Settings
            xmppEnabled: true,
            xmppPort: 443,
            xmppHost: '0.0.0.0',
            xmppDomain: 'neodyme.local',
            
            // Debug Settings
            debug: true,
            debugRequests: true,
            debugResponses: false,
            debugIps: false,
            logLevel: 'info',
            
            // Launcher Settings
            launcherBypassEnabled: true,
            launcherPasswords: ['Rebooted', 'Launcher'],
            launcherAutoCreateAccounts: true,
            
            // Security
            corsEnabled: true,
            compression: true,
            helmet: true,
            trustProxy: true,
            
            // Performance
            rateLimit: 100,
            rateLimitWindow: 60000,
            maxUploadSize: 52428800,
            maxRequestSize: 10485760,
            
            // Features
            pluginsEnabled: true,
            pluginDirectory: 'plugins',
            
            // Database
            databaseType: 'json',
            databasePath: 'data',
            playersDirectory: 'data/players',
            clientsFile: 'data/clients.json',
            
            // Auth
            sessionTimeout: 86400000,
            refreshTokenExpiry: 604800000,
            accessTokenExpiry: 14400000,
            exchangeCodeExpiry: 300000,
            twoFactorEnabled: true,
            twoFactorIssuer: 'Neodyme',
            
            // Shop
            shopEnabled: true,
            shopRotationInterval: 86400000,
            featuredRotationInterval: 86400000,
            
            // Matchmaking
            matchmakingEnabled: true,
            matchmakingRegions: ['NAE', 'NAW', 'EU', 'OCE', 'BR', 'ASIA', 'ME'],
            matchmakingTimeout: 300000,
            
            // Party & Friends
            partyMaxSize: 16,
            partyInviteTimeout: 300000,
            maxFriends: 1000,
            maxFriendRequests: 100,
            
            // Cloud Storage
            cloudStorageEnabled: true,
            cloudStorageMaxSize: 104857600,
            cloudStorageMaxFiles: 100,
            
            // Web Interface
            webEnabled: true,
            webPort: 3551,
            webDirectory: 'web',
            
            // Custom
            customBanner: 'Welcome to Neodyme!',
            maintenanceMode: false,
            maintenanceMessage: 'Server is under maintenance. Please try again later.'
        };
    }

    // Unified getter method
    get(key, defaultValue = null) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    // Set configuration value
    set(key, value) {
        this.config[key] = value;
    }

    // Get all configuration
    getAll() {
        return { ...this.config };
    }

    // Save current config to file
    save() {
        try {
            let content = '# Neodyme Server Configuration\n';
            content += '# This file contains all the configuration options for the Neodyme server\n\n';
            
            for (const [key, value] of Object.entries(this.config)) {
                if (Array.isArray(value)) {
                    content += `${key}=${value.join(',')}\n`;
                } else {
                    content += `${key}=${value}\n`;
                }
            }
            
            fs.writeFileSync(this.configPath, content, 'utf-8');
            console.log('✅ Configuration saved');
            return true;
        } catch (error) {
            console.error('❌ Failed to save config:', error.message);
            return false;
        }
    }

    // Reload config file
    reload() {
        this.config = {};
        this.loadConfig();
        this.notifyWatchers();
    }

    // Check if maintenance mode is active
    isMaintenanceMode() {
        return this.get('maintenanceMode', false);
    }

    // Server getters
    getServerPort() { return this.get('port', 3551); }
    getServerHost() { return this.get('host', '0.0.0.0'); }
    getServerVersion() { return this.get('version', '1.0.0'); }
    getApiVersion() { return this.get('apiVersion', 'v1'); }

    // Debug getters
    isDebugEnabled() { return this.get('debug', false); }
    isDebugRequestsEnabled() { return this.get('debugRequests', false); }
    isDebugResponsesEnabled() { return this.get('debugResponses', false); }
    isDebugIpsEnabled() { return this.get('debugIps', false); }
    getLogLevel() { return this.get('logLevel', 'info'); }

    // Launcher getters
    isLauncherBypassEnabled() { return this.get('launcherBypassEnabled', true); }
    getLauncherPasswords() { 
        const passwords = this.get('launcherPasswords', ['Rebooted', 'Launcher']);
        return Array.isArray(passwords) ? passwords : [passwords];
    }
    isAutoCreateAccountsEnabled() { return this.get('launcherAutoCreateAccounts', true); }

    // Security getters
    isCorsEnabled() { return this.get('corsEnabled', true); }
    isCompressionEnabled() { return this.get('compression', true); }
    isHelmetEnabled() { return this.get('helmet', true); }
    isTrustProxyEnabled() { return this.get('trustProxy', true); }

    // Performance getters
    getRateLimit() { return this.get('rateLimit', 100); }
    getRateLimitWindow() { return this.get('rateLimitWindow', 60000); }
    getMaxUploadSize() { return this.get('maxUploadSize', 52428800); }
    getMaxRequestSize() { return this.get('maxRequestSize', 10485760); }

    // XMPP getters
    isXmppEnabled() { return this.get('xmppEnabled', true); }
    getXmppPort() { return this.get('xmppPort', 443); }
    getXmppHost() { return this.get('xmppHost', '0.0.0.0'); }
    getXmppDomain() { return this.get('xmppDomain', 'neodyme.local'); }

    // Database getters
    getDatabaseType() { return this.get('databaseType', 'json'); }
    getDatabasePath() { return this.get('databasePath', 'data'); }
    getPlayersDirectory() { return this.get('playersDirectory', 'data/players'); }
    getClientsFile() { return this.get('clientsFile', 'data/clients.json'); }

    // Auth getters
    getSessionTimeout() { return this.get('sessionTimeout', 86400000); }
    getRefreshTokenExpiry() { return this.get('refreshTokenExpiry', 604800000); }
    getAccessTokenExpiry() { return this.get('accessTokenExpiry', 14400000); }
    getExchangeCodeExpiry() { return this.get('exchangeCodeExpiry', 300000); }

    // 2FA getters
    isTwoFactorEnabled() { return this.get('twoFactorEnabled', true); }
    getTwoFactorIssuer() { return this.get('twoFactorIssuer', 'Neodyme'); }

    // Plugin getters
    isPluginsEnabled() { return this.get('pluginsEnabled', true); }
    getPluginDirectory() { return this.get('pluginDirectory', 'plugins'); }

    // Shop getters
    isShopEnabled() { return this.get('shopEnabled', true); }
    getShopRotationInterval() { return this.get('shopRotationInterval', 86400000); }
    getFeaturedRotationInterval() { return this.get('featuredRotationInterval', 86400000); }

    // Matchmaking getters
    isMatchmakingEnabled() { return this.get('matchmakingEnabled', true); }
    getMatchmakingRegions() {
        const regions = this.get('matchmakingRegions', ['NAE', 'NAW', 'EU', 'OCE', 'BR', 'ASIA', 'ME']);
        return Array.isArray(regions) ? regions : regions.split(',').map(r => r.trim());
    }
    getMatchmakingTimeout() { return this.get('matchmakingTimeout', 300000); }

    // Party getters
    getPartyMaxSize() { return this.get('partyMaxSize', 16); }
    getPartyInviteTimeout() { return this.get('partyInviteTimeout', 300000); }

    // Friends getters
    getMaxFriends() { return this.get('maxFriends', 1000); }
    getMaxFriendRequests() { return this.get('maxFriendRequests', 100); }

    // Cloud Storage getters
    isCloudStorageEnabled() { return this.get('cloudStorageEnabled', true); }
    getCloudStorageMaxSize() { return this.get('cloudStorageMaxSize', 104857600); }
    getCloudStorageMaxFiles() { return this.get('cloudStorageMaxFiles', 100); }

    // Web interface getters
    isWebEnabled() { return this.get('webEnabled', true); }
    getWebPort() { return this.get('webPort', 3551); }
    getWebDirectory() { return this.get('webDirectory', 'web'); }

    // Custom getters
    getCustomBanner() { return this.get('customBanner', 'Welcome to Neodyme!'); }
    getMaintenanceMessage() { return this.get('maintenanceMessage', 'Server is under maintenance. Please try again later.'); }

    // Feature flags
    isFeaturesV2Enabled() { return this.get('featuresV2Enabled', true); }
    isNewShopEnabled() { return this.get('newShopEnabled', true); }
    isCreativeEnabled() { return this.get('creativeEnabled', true); }
    isCompetitiveEnabled() { return this.get('competitiveEnabled', true); }
    isSaveTheWorldEnabled() { return this.get('saveTheWorldEnabled', false); }

    // Discord getters
    isDiscordEnabled() { return this.get('discordEnabled', false); }
    getDiscordWebhook() { return this.get('discordWebhook', ''); }
    isDiscordNotifyOnError() { return this.get('discordNotifyOnError', true); }
    isDiscordNotifyOnStart() { return this.get('discordNotifyOnStart', true); }

    // Backup getters
    isBackupEnabled() { return this.get('backupEnabled', true); }
    getBackupInterval() { return this.get('backupInterval', 86400000); }
    getBackupPath() { return this.get('backupPath', 'backups'); }
    getMaxBackups() { return this.get('maxBackups', 7); }

    // Game server getters
    getGameServerListFile() { return this.get('gameServerListFile', 'gameserver_lists.json'); }
    getGameServerHeartbeatInterval() { return this.get('gameServerHeartbeatInterval', 30000); }
    getGameServerTimeout() { return this.get('gameServerTimeout', 60000); }

    // Content delivery getters
    getStaticContentPath() { return this.get('staticContentPath', 'static-content'); }
    getAssetsPath() { return this.get('assetsPath', 'static-content/assets'); }

    // Development getters
    isHotReloadEnabled() { return this.get('hotReload', false); }
    isSourceMapSupportEnabled() { return this.get('sourceMapSupport', true); }

    // Email getters
    isEmailEnabled() { return this.get('emailEnabled', false); }
    getEmailHost() { return this.get('emailHost', ''); }
    getEmailPort() { return this.get('emailPort', 587); }
    isEmailSecure() { return this.get('emailSecure', false); }
    getEmailUser() { return this.get('emailUser', ''); }
    getEmailPass() { return this.get('emailPass', ''); }
    getEmailFrom() { return this.get('emailFrom', 'noreply@neodyme.local'); }

    // SSL getters
    isSslEnabled() { return this.get('sslEnabled', false); }
    getSslCert() { return this.get('sslCert', ''); }
    getSslKey() { return this.get('sslKey', ''); }
    getSslPort() { return this.get('sslPort', 443); }

    // Log getters
    isLogToFileEnabled() { return this.get('logToFile', true); }
    getLogDirectory() { return this.get('logDirectory', 'logs'); }
    getLogRotation() { return this.get('logRotation', 'daily'); }
    getMaxLogSize() { return this.get('maxLogSize', 10485760); }
    getMaxLogFiles() { return this.get('maxLogFiles', 30); }

    // Performance getters
    getRequestTimeout() { return this.get('requestTimeout', 30000); }
    getKeepAliveTimeout() { return this.get('keepAliveTimeout', 65000); }
    getHeadersTimeout() { return this.get('headersTimeout', 60000); }

    // Cluster getters
    isClusterEnabled() { return this.get('clusterEnabled', false); }
    getWorkerId() { return this.get('workerId', 1); }
    getWorkerCount() { return this.get('workerCount', 1); }
}

// Export singleton instance
module.exports = new ConfigService();