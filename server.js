const https = require('https');
const fs = require('fs');
const path = require('path');
const colors = require('./src/utils/colors');

const LoggerService = require('./src/service/logger/logger-service');

const ConfigManager = require('./src/manager/config-manager');
const CommandManager = require('./src/manager/command-manager');
const DatabaseManager = require('./src/manager/database-manager');
const PluginManager = require('./src/manager/plugin-manager');
const EndpointManager = require('./src/manager/endpoint-manager');
const XMPPManager = require('./src/manager/xmpp-manager');
const CloudStorageManager = require('./src/manager/cloud-storage-manager');
const GameServerManager = require('./src/manager/game-server-manager');
const MatchmakerManager = require('./src/manager/matchmaker-manager');
const PartyManager = require('./src/manager/party-manager');
const ShopManager = require('./src/manager/shop-manager');
const BackupManager = require('./src/manager/backup-manager');
const EXPService = require('./src/service/api/experience-service');
const TokenService = require('./src/service/token/token-service');
const WebTokenService = require('./src/service/token/web-token-service');
const { CsrfTokenService } = require('./src/service/token/csrf-token-service');
const CreatorCodeService = require('./src/service/api/creator-code-service');
const TicketService = require('./src/service/api/ticket-service');
const AuditService = require('./src/service/api/audit-service');

const NEODYME_ASCII = `
${colors.cyan('███╗   ██╗███████╗ ██████╗ ██████╗ ██╗   ██╗███╗   ███╗███████╗')}
${colors.cyan('████╗  ██║██╔════╝██╔═══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██╔════╝')}
${colors.cyan('██╔██╗ ██║█████╗  ██║   ██║██║  ██║ ╚████╔╝ ██╔████╔██║█████╗  ')}
${colors.cyan('██║╚██╗██║██╔══╝  ██║   ██║██║  ██║  ╚██╔╝  ██║╚██╔╝██║██╔══╝  ')}
${colors.cyan('██║ ╚████║███████╗╚██████╔╝██████╔╝   ██║   ██║ ╚═╝ ██║███████╗')}
${colors.cyan('╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═════╝    ╚═╝   ╚═╝     ╚═╝╚══════╝')}
`;

class Server {
    constructor() {
        this.startTime = Date.now();
    }

    static async checkVersion() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/Aorux01/Neodyme/refs/heads/main/package.json');
            if (!response.ok) {
                LoggerService.log('error', `Failed to fetch package.json: ${response.status}`);
                return false;
            }

            const packageJson = await response.json();
            const latestVersion = packageJson.version;

            const currentVersion = require('./package.json').version;

            function isNewerVersion(latest, current) {
                const latestParts = latest.split('.').map(num => parseInt(num, 10));
                const currentParts = current.split('.').map(num => parseInt(num, 10));

                for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
                    const latestPart = latestParts[i] || 0;
                    const currentPart = currentParts[i] || 0;

                    if (latestPart > currentPart) {
                        return true;
                    } else if (latestPart < currentPart) {
                        return false;
                    }
                }
                return false;
            }

            if (isNewerVersion(latestVersion, currentVersion)) {
                LoggerService.log('warn', `A new version of Neodyme is available: ${colors.cyan(latestVersion)} (you are using ${colors.cyan(currentVersion)})`);
                return true;
            } else {

            }

            return false;
        } catch (error) {
            LoggerService.log('error', `Error while checking for updates: ${error.message}`);
            return false;
        }
    }

    async start() {
        try {
            console.clear();
            console.log(NEODYME_ASCII);
            console.log(colors.gray('─'.repeat(65)));
    
            LoggerService.log('info', 'Starting Neodyme server...');
    
            LoggerService.log('info', 'Loading configuration...');
            await ConfigManager.load();

            if (ConfigManager.get('databaseBackup')) {
                LoggerService.log('info', 'Initializing backup system...');
                await BackupManager.initialize();
            }
            
            LoggerService.log('info', 'Loading commands...');
            await CommandManager.load();

            LoggerService.log('info', 'Initializing database...');
            await DatabaseManager.initialize();

            LoggerService.log('info', 'Initializing Token Service...');
            await TokenService.initialize();

            LoggerService.log('info', 'Initializing Web Token Service...');
            await WebTokenService.initialize();

            LoggerService.log('info', 'Initializing CSRF Token Service...');
            await CsrfTokenService.initialize();

            LoggerService.log('info', 'Initializing Creator Code Service...');
            await CreatorCodeService.initialize();

            LoggerService.log('info', 'Initializing Ticket Service...');
            await TicketService.initialize();

            LoggerService.log('info', 'Initializing Audit Service...');
            await AuditService.initialize();

            if (ConfigManager.get('plugins')) {
                LoggerService.log('info', 'Loading plugin(s)...');
                await PluginManager.load();
            }
    
            LoggerService.log('info', 'Initializing API...');
            const app = await EndpointManager.start();
            this.app = app;

            LoggerService.log('info', 'Initializing Game Server system...');
            await GameServerManager.load();
            
            if (ConfigManager.get('xmppEnable')) {
                LoggerService.log('info', 'Initializing Matchmaker...');
                await MatchmakerManager.initialize();
            }

            LoggerService.log('info', 'Initializing Party Manager...');
            await PartyManager.initialize();

            if (ConfigManager.get('xmppEnable')) {
                LoggerService.log('info', 'Starting XMPP server...');
                await XMPPManager.start();
            }

            if (ConfigManager.get('autoShopRotation')) {
                LoggerService.log('info', 'Initializing Shop...')
                await ShopManager.initialize();
            }

            LoggerService.log('info', 'Initializing CloudStorage...');
            CloudStorageManager.initialize();

            await EXPService.loadConfig();

            LoggerService.log('info', 'Backend version check...');
            await Server.checkVersion();
    
            LoggerService.log('success', 'Server initialized successfully!');
            console.log(colors.gray('─'.repeat(65)));

            const protocol = ConfigManager.get('protocol', 'http');
            const port = ConfigManager.get('port');

            if (protocol === 'https') {
                const certPath = path.resolve(ConfigManager.get('sslCertPath', 'config/ssl/cert.pem'));
                const keyPath = path.resolve(ConfigManager.get('sslKeyPath', 'config/ssl/key.pem'));

                if (!fs.existsSync(certPath)) {
                    LoggerService.log('error', `SSL certificate file not found: ${certPath}`);
                    LoggerService.log('error', 'Cannot start HTTPS server without a valid certificate. Please provide cert.pem in config/ssl/ or set protocol=http');
                    process.exit(1);
                }
                if (!fs.existsSync(keyPath)) {
                    LoggerService.log('error', `SSL key file not found: ${keyPath}`);
                    LoggerService.log('error', 'Cannot start HTTPS server without a valid key. Please provide key.pem in config/ssl/ or set protocol=http');
                    process.exit(1);
                }

                try {
                    const sslOptions = {
                        cert: fs.readFileSync(certPath),
                        key: fs.readFileSync(keyPath)
                    };
                    this.server = https.createServer(sslOptions, this.app);
                } catch (err) {
                    LoggerService.log('error', `Failed to read SSL certificate files: ${err.message}`);
                    LoggerService.log('error', 'Ensure your certificate and key files are valid PEM format.');
                    process.exit(1);
                }

                if (!ConfigManager.get('secureCookies')) {
                    ConfigManager.set('secureCookies', true);
                    LoggerService.log('info', 'HTTPS detected: secureCookies automatically enabled');
                }
            } else {
                this.server = this.app;
            }

            this.httpServer = this.server.listen(port, () => {
                LoggerService.log('success', `API server is listening on port: ${colors.cyan(port)}`);
                if (ConfigManager.get('webInterface')) {
                    LoggerService.log('info', `Web Interface available at: ${colors.cyan(`${protocol}://localhost:${port}/`)}`);
                }
                if (ConfigManager.get('xmppEnable')) {
                    LoggerService.log('info', `XMPP and Matchmaking server are available on port: ${colors.cyan(ConfigManager.get('xmppPort'))}`);
                }
                LoggerService.log('info', `Server started in ${colors.cyan(Date.now() - this.startTime)} ms`);
                LoggerService.log('info', `Protocol: ${colors.cyan(protocol.toUpperCase())}`);
                LoggerService.log('info', `Debug mode: ${ConfigManager.get('debug') ? colors.green('ON') : colors.red('OFF')}`);
                LoggerService.log('info', `Database type: ${colors.cyan(ConfigManager.get('databaseType'))}`);
                LoggerService.log('info', `Token storage: ${colors.cyan(ConfigManager.get('redisEnabled') ? 'Redis' : 'json')}`);
                console.log(colors.gray('─'.repeat(65)));
                LoggerService.log('info', 'Type "/help" for available commands');
            });

            this.httpServer.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    LoggerService.log('error', `Port ${colors.cyan(ConfigManager.get('port'))} is already in use.`);
                    LoggerService.log('warn', 'Please close the other process using this port or change it in configuration.');
            
                    process.exit(1);
                } else {
                    LoggerService.log('error', `Unexpected server error: ${err.message}`);
                    process.exit(1);
                }
            });
        } catch (error) {
            LoggerService.log('error', 'Failed to start server:', { error: error.message });
            process.exit(1);
        }
    }
}

const server = new Server();
CommandManager.serverInstance = server;
server.start().catch((error) => {
    LoggerService.log('error', 'Unhandled exception during server start:', { error: error.message });
    process.exit(1);
});

