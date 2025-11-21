const colors = require('./src/utils/Colors');

const LoggerService = require('./src/service/logger/LoggerService');

const ConfigManager = require('./src/manager/ConfigManager');
const CommandManager = require('./src/manager/CommandManager');
const DatabaseManager = require('./src/manager/DatabaseManager');
const PluginManager = require('./src/manager/PluginManager');
const EndpointManager = require('./src/manager/EndpointManager');
const XMPPManager = require('./src/manager/XMPPManager');
const CloudStorageManager = require('./src/manager/CloudStorageManager');
const GameServerManager = require('./src/manager/GameServerManager');
const MatchmakerManager = require('./src/manager/MatchmakerManager');
const ShopManager = require('./src/manager/ShopManager');
const BackupManager = require('./src/manager/BackupManager');
const EXPService = require('./src/service/api/EXPService');

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

    async start() {
        try {
            console.clear();
            console.log(NEODYME_ASCII);
            console.log(colors.gray('─'.repeat(65)));
    
            LoggerService.log('info', 'Starting Neodyme server...');
    
            // Load configuration
            LoggerService.log('info', 'Loading configuration...');
            await ConfigManager.load();

            if (ConfigManager.get('databaseBackup')) {
                LoggerService.log('info', 'Initializing backup system...');
                await BackupManager.initialize();
            }
            
            // Load commands
            LoggerService.log('info', 'Loading commands...');
            await CommandManager.load();

            // Load database
            LoggerService.log('info', 'Initializing database...');
            await DatabaseManager.initialize();
    
            // Load plugins
            if (ConfigManager.get('plugins')) {
                LoggerService.log('info', 'Loading plugin(s)...');
                await PluginManager.load();
            }
    
            // Start API server
            LoggerService.log('info', 'Initializing API...');
            const app = await EndpointManager.start();
            this.app = app;

            // Load GameServer system
            LoggerService.log('info', 'Initializing Game Server system...');
            await GameServerManager.load();
            
            // Load Matchmaker system
            if (ConfigManager.get('xmppEnable')) {
                LoggerService.log('info', 'Initializing Matchmaker...');
                await MatchmakerManager.initialize();
            }
    
            // Start XMPP server
            if (ConfigManager.get('xmppEnable')) {
                LoggerService.log('info', 'Starting XMPP server...');
                await XMPPManager.start();
            }

            if (ConfigManager.get('autoShopRotation')) {
                LoggerService.log('info', 'Initializing Shop...')
                await ShopManager.initialize();
            }

            // Generate Cloudstorage
            LoggerService.log('info', 'Generate Cloudstorage file(s)...');
            await CloudStorageManager.generateDefaultEngine();

            await EXPService.loadConfig();
    
            LoggerService.log('success', 'Server initialized successfully!');
            console.log(colors.gray('─'.repeat(65)));

            this.server = this.app.listen(ConfigManager.get('port'), () => {
                LoggerService.log('success', `API server is listening on port: ${colors.cyan(ConfigManager.get('port'))}`);
                if (ConfigManager.get('webInterface')) {
                    LoggerService.log('info', `Web Interface available at: ${colors.cyan(`http://localhost:${ConfigManager.get('port')}/`)}`);
                }
                if (ConfigManager.get('xmppEnable')) {
                    LoggerService.log('info', `XMPP and Matchmaking server are available on port: ${colors.cyan(ConfigManager.get('xmppPort'))}`);
                }
                LoggerService.log('info', `Server started in ${colors.cyan(Date.now() - this.startTime)} ms`);
                LoggerService.log('info', `Debug mode: ${ConfigManager.get('debug') ? colors.green('ON') : colors.red('OFF')}`);
                LoggerService.log('info', `Database type: ${colors.cyan(ConfigManager.get('databaseType'))}`);
                console.log(colors.gray('─'.repeat(65)));
                LoggerService.log('info', 'Type "/help" for available commands');
            });

            this.server.on('error', (err) => {
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
