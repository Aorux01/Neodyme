const express = require('express');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const readline = require('readline');
const { performance } = require('perf_hooks');
const LoggerService = require('./src/utils/logger');
const DiscordManager = require('./src/discord/DiscordManager');

// Import error handling
const { ApiError, sendError } = require('./src/errors/errors');

const c = chalk;

// ASCII Art for Neodyme
const NEODYME_ASCII = `
${c.cyan('███╗   ██╗███████╗ ██████╗ ██████╗ ██╗   ██╗███╗   ███╗███████╗')}
${c.cyan('████╗  ██║██╔════╝██╔═══██╗██╔══██╗╚██╗ ██╔╝████╗ ████║██╔════╝')}
${c.cyan('██╔██╗ ██║█████╗  ██║   ██║██║  ██║ ╚████╔╝ ██╔████╔██║█████╗  ')}
${c.cyan('██║╚██╗██║██╔══╝  ██║   ██║██║  ██║  ╚██╔╝  ██║╚██╔╝██║██╔══╝  ')}
${c.cyan('██║ ╚████║███████╗╚██████╔╝██████╔╝   ██║   ██║ ╚═╝ ██║███████╗')}
${c.cyan('╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═════╝    ╚═╝   ╚═╝     ╚═╝╚══════╝')}
`;

class NeodymeServer {
    constructor() {
        this.app = express();
        this.config = this.loadConfig();
        this.startTime = Date.now();
        this.requestCount = 0;
        this.plugins = [];
        this.commands = new Map();
        this.discordManager = null;
        this.discordBot = null
        this.setupConsole();
    }

    loadConfig() {
        try {
            const configPath = path.join(__dirname, 'server.properties');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = {};
            
            configData.split('\n').forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [key, value] = line.split('=').map(s => s.trim());
                    if (key && value !== undefined) {
                        // Parse boolean values
                        if (value === 'true' || value === 'false') {
                            config[key] = value === 'true';
                        } else if (!isNaN(value)) {
                            config[key] = parseInt(value);
                        } else {
                            config[key] = value;
                        }
                    }
                }
            });
            
            return {
                port: config.port || 3551,
                host: config.host || '0.0.0.0',
                debug: config.debug || false,
                debugRequests: config.debugRequests || false,
                debugResponses: config.debugResponses || false,
                debugIps: config.debugIps || false,
                compression: config.compression !== false,
                corsEnabled: config.corsEnabled !== false,
                rateLimit: config.rateLimit || 100,
                rateLimitWindow: config.rateLimitWindow || 60000,
                pluginsEnabled: config.pluginsEnabled !== false,
                xmppEnabled: config.xmppEnabled !== false,
                xmppPort: config.xmppPort || 443,
                apiVersion: config.apiVersion || 'v1',
                ...config
            };
        } catch (error) {
            LoggerService.log('warn', 'Failed to load server.properties, using default configuration');
            return {
                port: 3551,
                host: '0.0.0.0',
                debug: false,
                debugRequests: false,
                debugResponses: false,
                debugIps: false,
                compression: true,
                corsEnabled: true,
                rateLimit: 100,
                rateLimitWindow: 60000,
                pluginsEnabled: true,
                xmppEnabled: true,
                xmppPort: 443,
                apiVersion: 'v1'
            };
        }
    }

    log(level, message, data = null) {
        LoggerService.log(level, message, data);
    }

    setupConsole() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: c.green('Neodyme> ')
        });

        // Register default commands
        this.registerCommand('help', () => {
            LoggerService.log('info', 'Available commands:');
            this.commands.forEach((handler, cmd) => {
                console.log(c.cyan(`  - ${cmd}`));
            });
        });

        this.registerCommand('status', () => {
            const uptime = Math.floor((Date.now() - this.startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            
            LoggerService.log('info', `Server Status:`);
            console.log(c.cyan(`  Uptime: ${hours}h ${minutes}m ${seconds}s`));
            console.log(c.cyan(`  Requests handled: ${this.requestCount}`));
            console.log(c.cyan(`  Active plugins: ${this.plugins.length}`));
            console.log(c.cyan(`  Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`));
        });

        this.registerCommand('reload', async () => {
            LoggerService.log('info', 'Reloading configuration...');
            this.config = this.loadConfig();
            await this.loadPlugins();
            LoggerService.log('success', 'Configuration reloaded');
        });

        this.registerCommand('stop', () => {
            LoggerService.log('info', 'Shutting down server...');
            process.exit(0);
        });

        this.registerCommand('clear', () => {
            console.clear();
            console.log(NEODYME_ASCII);
        });

        this.registerCommand('debug', (args) => {
            if (args.length === 0) {
                this.config.debug = !this.config.debug;
                LoggerService.log('info', `Debug mode ${this.config.debug ? 'enabled' : 'disabled'}`);
            } else {
                const debugType = args[0];
                switch(debugType) {
                    case 'requests':
                        this.config.debugRequests = !this.config.debugRequests;
                        LoggerService.log('info', `Request debugging ${this.config.debugRequests ? 'enabled' : 'disabled'}`);
                        break;
                    case 'responses':
                        this.config.debugResponses = !this.config.debugResponses;
                        LoggerService.log('info', `Response debugging ${this.config.debugResponses ? 'enabled' : 'disabled'}`);
                        break;
                    case 'ips':
                        this.config.debugIps = !this.config.debugIps;
                        LoggerService.log('info', `IP debugging ${this.config.debugIps ? 'enabled' : 'disabled'}`);
                        break;
                    default:
                        LoggerService.log('warn', `Unknown debug type: ${debugType}`);
                }
            }
        });

        rl.on('line', (input) => {
            const [command, ...args] = input.trim().split(' ');
            
            if (command) {
                const handler = this.commands.get(command.toLowerCase());
                if (handler) {
                    handler(args);
                } else {
                    LoggerService.log('error', `Unknown command: ${command}. Type 'help' for available commands.`);
                }
            }
            
            rl.prompt();
        });

        // Don't show prompt immediately to not interfere with startup logs
        setTimeout(() => rl.prompt(), 1000);
    }

    registerCommand(name, handler) {
        this.commands.set(name.toLowerCase(), handler);
    }

    async setupDiscordIntegration() {
        try {
            this.discordManager = new DiscordManager(this);
            const success = await this.discordManager.initialize();
            
            if (success) {
                this.discordBot = this.discordManager.getBot();
                LoggerService.log('success', 'Discord integration setup completed');
            } else {
                LoggerService.log('info', 'Discord integration disabled or failed to initialize');
            }
            
            return true;
        } catch (error) {
            LoggerService.log('error', 'Discord integration setup failed:', error.message);
            return false;
        }
    }

    async loadPlugins() {
        if (!this.config.pluginsEnabled) {
            LoggerService.log('info', 'Plugins are disabled');
            return;
        }
    
        const pluginsDir = path.join(__dirname, 'plugins');
        
        try {
            if (!fs.existsSync(pluginsDir)) {
                fs.mkdirSync(pluginsDir, { recursive: true });
                LoggerService.log('info', 'Created plugins directory');
                return;
            }
    
            const files = fs.readdirSync(pluginsDir);
            this.plugins = [];
    
            for (const file of files) {
                if (file.endsWith('.js')) {
                    try {
                        const pluginPath = path.join(pluginsDir, file);
                        delete require.cache[require.resolve(pluginPath)];
                        const PluginClass = require(pluginPath);
                        const plugin = new PluginClass();
                        
                        if (plugin.name && plugin.init) {
                            const success = await plugin.init(this);
                            if (success) {
                                this.plugins.push(plugin);
                                LoggerService.log('success', `Loaded plugin: ${plugin.name} v${plugin.version || '1.0.0'}`);
                                
                                // Register Discord commands if Discord is available
                                if (this.discordManager && this.discordManager.isReady()) {
                                    this.discordManager.registerPluginCommands(plugin);
                                }
                            } else {
                                LoggerService.log('error', `Failed to initialize plugin: ${plugin.name}`);
                            }
                        } else {
                            LoggerService.log('warn', `Invalid plugin format: ${file}`);
                        }
                    } catch (error) {
                        LoggerService.log('error', `Failed to load plugin ${file}: ${error.message}`);
                    }
                }
            }
    
            if (this.plugins.length === 0) {
                LoggerService.log('info', 'No plugins loaded');
            } else {
                LoggerService.log('success', `Loaded ${this.plugins.length} plugin(s)`);
            }
        } catch (error) {
            LoggerService.log('error', `Failed to load plugins: ${error.message}`);
        }
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            crossOriginEmbedderPolicy: false,
            contentSecurityPolicy: false
        }));

        // CORS
        if (this.config.corsEnabled) {
            this.app.use(cors({
                origin: true,
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Epic-Correlation-ID', 'X-Requested-With']
            }));
        }

        // Compression
        if (this.config.compression) {
            this.app.use(compression());
        }

        this.app.use('/fortnite/api/cloudstorage/user/*/*', express.raw({
            limit: '50mb',
            type: '*/*'
        }));

        // Body parsing
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, 'public')));
        this.app.use(cookieParser());

        // Request tracking
        this.app.use((req, res, next) => {
            req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            req.startTime = performance.now();
            this.requestCount++;
            next();
        });

        // Debug middleware
        if (this.config.debug) {
            this.app.use((req, res, next) => {
                const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                
                if (this.config.debugIps) {
                    LoggerService.log('debug', `Incoming request from ${clientIp}`);
                }

                if (this.config.debugRequests) {
                    LoggerService.log('debug', `Request: ${req.method} ${req.url}`, {
                        headers: req.headers,
                        body: req.body,
                        query: req.query
                    });
                }

                // Intercept response
                const originalSend = res.send;
                res.send = function(data) {
                    if (this.config.debugResponses) {
                        LoggerService.log('debug', `Response: ${res.statusCode}`, {
                            headers: res.getHeaders(),
                            body: data
                        });
                    }
                    originalSend.call(res, data);
                }.bind(this);

                next();
            });
        }

        // Morgan logging
        if (this.config.debug) {
            this.app.use(morgan('dev', {
                stream: {
                    write: (message) => {
                        LoggerService.log('debug', message.trim());
                    }
                }
            }));
        }

        // Favicon
        this.app.use('/favicon.ico', (req, res) => {
            const faviconPath = path.join(__dirname, 'static-content', 'favicon.ico');
            if (fs.existsSync(faviconPath)) {
                res.sendFile(faviconPath);
            } else {
                res.status(204).end();
            }
        });

        // Static files for game assets
        this.app.use('/static', express.static(path.join(__dirname, 'static-content')));

        if (this.config.webEnabled !== false) {
            const webDir = path.join(__dirname, this.config.webDirectory || 'web');
            
            if (!fs.existsSync(webDir)) {
                fs.mkdirSync(webDir, { recursive: true });
                LoggerService.log('info', `Created web directory at ${webDir}`);
            }
            
            this.app.use('/', express.static(webDir));
            
            this.app.get('/', (req, res) => {
                const indexPath = path.join(webDir, 'index.html');
                if (fs.existsSync(indexPath)) {
                    res.sendFile(indexPath);
                } else {
                    res.status(404).send('Web interface not found');
                }
            });
    
            LoggerService.log('info', `Web interface enabled at ${webDir}`);
        }
    }

    async loadRoutes() {
        const routesDir = path.join(__dirname, 'api');
        
        try {
            if (!fs.existsSync(routesDir)) {
                fs.mkdirSync(routesDir, { recursive: true });
                LoggerService.log('warn', 'API directory created, no routes loaded');
                return;
            }
    
            const files = fs.readdirSync(routesDir);
            
            files.forEach(file => {
                if (file.endsWith('.js')) {
                    try {
                        const routePath = path.join(routesDir, file);
                        const route = require(routePath);
                        
                        // Mount at root level, not with filename prefix
                        if (typeof route === 'function' || (route && route.router)) {
                            this.app.use('/', route); // Changed this line
                            LoggerService.log('success', `Loaded route: ${file}`);
                        } else {
                            LoggerService.log('warn', `Invalid route format: ${file}`);
                        }
                    } catch (error) {
                        LoggerService.log('error', `Failed to load route ${file}: ${error.message}`);
                    }
                }
            });
        } catch (error) {
            LoggerService.log('error', `Failed to load routes: ${error.message}`);
        }
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res, next) => {
            const error = new ApiError(
                'errors.com.epicgames.common.not_found',
                'Sorry, the resource you were trying to find could not be found',
                1004,
                404
            );
            sendError(res, error);
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            const endTime = performance.now();
            const duration = Math.round(endTime - req.startTime);
            
            LoggerService.log('error', `Request ${req.requestId} failed after ${duration}ms`, {
                error: err.message,
                stack: this.config.debug ? err.stack : undefined
            });

            if (err instanceof ApiError) {
                sendError(res, err);
            } else {
                const error = new ApiError(
                    'errors.com.epicgames.common.server_error',
                    'An error occurred while processing your request',
                    1000,
                    500
                );
                sendError(res, error);
            }
        });

        // Response time tracking
        this.app.use((req, res, next) => {
            res.on('finish', () => {
                const endTime = performance.now();
                const duration = Math.round(endTime - req.startTime);
                
                if (this.config.debug) {
                    LoggerService.log('debug', `Request ${req.requestId} completed in ${duration}ms`);
                }
            });
            next();
        });
    }

    async start() {
        console.clear();
        console.log(NEODYME_ASCII);
        console.log(c.gray('─'.repeat(65)));
        
        LoggerService.log('info', 'Starting Neodyme server...');
        LoggerService.log('info', 'Version: 1.0.0');
        
        // Show progress
        const steps = [
            { name: 'Loading configuration', fn: () => this.config },
            { name: 'Setting up middleware', fn: () => this.setupMiddleware() },
            { name: 'Loading plugins', fn: () => this.loadPlugins() },
            { name: 'Loading routes', fn: () => this.loadRoutes() },
            { name: 'Setting up error handling', fn: () => this.setupErrorHandling() },
            { name: 'Starting XMPP service', fn: () => this.startXMPP() }
        ];

        // Conditionally add Discord integration step
        if (this.config.discordEnabled) {
            steps.splice(3, 0, { name: 'Setting up Discord integration', fn: () => this.setupDiscordIntegration() });
        }

        for (const step of steps) {
            try {
                LoggerService.log('info', `${step.name}...`);
                await step.fn();
                LoggerService.log('success', `${step.name} completed`);
            } catch (error) {
                LoggerService.log('error', `${step.name} failed: ${error.message}`);
                if (step.name === 'Loading configuration') {
                    process.exit(1);
                }
            }
        }

        // Start server
        this.server = this.app.listen(this.config.port, this.config.host, () => {
            console.log(c.gray('─'.repeat(65)));
            LoggerService.log('success', `Server started successfully`);
            LoggerService.log('info', `HTTP Server listening on ${c.cyan(`http://${this.config.host}:${this.config.port}`)}`);
            if (this.config.xmppEnabled) {
                LoggerService.log('info', `XMPP Server listening on ${c.cyan(`${this.config.host}:${this.config.xmppPort}`)}`);
            }
            if (this.discordManager && this.discordManager.isReady()) {
                LoggerService.log('info', `Discord Bot: ${c.green('Connected')}`);
            }
            LoggerService.log('info', `Debug mode: ${this.config.debug ? c.green('ON') : c.red('OFF')}`);
            LoggerService.log('info', `Plugins: ${this.plugins.length} loaded`);
            console.log(c.gray('─'.repeat(65)));
            LoggerService.log('info', 'Type "help" for available commands');

            if (this.discordManager) {
                this.discordManager.onServerStart();
            }
        });

        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        
        process.on('uncaughtException', (error) => {
            try {
                LoggerService.log('error', 'Uncaught exception', {
                    message: error.message,
                    stack: error.stack
                });
            } catch (logError) {
                console.error('Failed to log uncaught exception:', logError);
                console.error('Original exception:', error);
            }
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            try {
                LoggerService.log('error', 'Unhandled promise rejection', {
                    reason: reason?.toString() || 'Unknown reason',
                    stack: reason?.stack || 'No stack trace',
                    promise: promise?.toString() || 'Unknown promise'
                });
            } catch (logError) {
                console.error('Failed to log unhandled rejection:', logError);
                console.error('Original rejection reason:', reason);
            }
        });
    }

    async startXMPP() {
        if (!this.config.xmppEnabled) {
            LoggerService.log('info', 'XMPP service is disabled');
            return;
        }

        try {
            const xmppPath = path.join(__dirname, 'src', 'xmpp', 'server.js');
            if (fs.existsSync(xmppPath)) {
                const XMPPServer = require(xmppPath);
                this.xmppServer = new XMPPServer(this.config);
                await this.xmppServer.start();
                
                // Add XMPP commands to console
                this.registerCommand('xmpp', (args) => {
                    if (args.length === 0) {
                        const stats = this.xmppServer.getStats();
                        LoggerService.log('info', 'XMPP Server Statistics:');
                        console.log(c.cyan(`  Connected clients: ${stats.connectedClients}`));
                        console.log(c.cyan(`  Active rooms: ${stats.activeRooms}`));
                        console.log(c.cyan(`  Uptime: ${Math.floor(stats.uptime / 1000)}s`));
                    } else {
                        switch(args[0]) {
                            case 'clients':
                                const stats = this.xmppServer.getStats();
                                LoggerService.log('info', `XMPP Clients (${stats.clients.length}):`);
                                stats.clients.forEach(client => {
                                    console.log(c.cyan(`  - ${client.displayName} (${client.accountId})`));
                                    console.log(c.gray(`    JID: ${client.jid}`));
                                    console.log(c.gray(`    Connected: ${client.connectedAt}`));
                                    if (client.joinedRooms.length > 0) {
                                        console.log(c.gray(`    Rooms: ${client.joinedRooms.join(', ')}`));
                                    }
                                });
                                break;
                            case 'rooms':
                                const roomStats = this.xmppServer.getStats();
                                LoggerService.log('info', `XMPP Rooms (${roomStats.rooms.length}):`);
                                roomStats.rooms.forEach(room => {
                                    console.log(c.cyan(`  - ${room.name} (${room.memberCount} members)`));
                                });
                                break;
                            default:
                                LoggerService.log('warn', 'Usage: xmpp [clients|rooms]');
                        }
                    }
                });
            } else {
                LoggerService.log('warn', 'XMPP server module not found');
            }
        } catch (error) {
            LoggerService.log('error', `Failed to start XMPP service: ${error.message}`);
        }
    }

    async shutdown() {
        LoggerService.log('info', 'Shutting down server...');
        
        // Notify Discord before shutdown
        if (this.discordManager) {
            await this.discordManager.onServerShutdown();
        }
        
        // Call plugin cleanup
        for (const plugin of this.plugins) {
            if (plugin.cleanup) {
                try {
                    await plugin.cleanup();
                    LoggerService.log('info', `Cleaned up plugin: ${plugin.name}`);
                } catch (error) {
                    LoggerService.log('error', `Failed to cleanup plugin ${plugin.name}: ${error.message}`);
                }
            }
        }
    
        // Close servers
        if (this.server) {
            this.server.close(() => {
                LoggerService.log('info', 'HTTP server closed');
            });
        }
    
        if (this.xmppServer) {
            await this.xmppServer.stop();
            LoggerService.log('info', 'XMPP server closed');
        }
    
        setTimeout(() => {
            LoggerService.log('info', 'Goodbye!');
            process.exit(0);
        }, 1000);
    }
}

// Start the server
const server = new NeodymeServer();
server.start().catch(error => {
    console.error(c.red('Failed to start server:'), error);
    process.exit(1);
});
    if (!this.discordManager) {
        LoggerService.log('warn', 'Discord integration not available');
        return;
    }

    if (args.length === 0) {
        const isReady = this.discordManager.isReady();
        const config = this.discordManager.getConfig();
        
        LoggerService.log('info', 'Discord Integration Status:');
        console.log(c.cyan(`  Status: ${isReady ? c.green('Connected') : c.red('Disconnected')}`));
        console.log(c.cyan(`  Enabled: ${config.enabled ? c.green('Yes') : c.red('No')}`));
        
        if (isReady) {
            const bot = this.discordManager.getBot();
            console.log(c.cyan(`  Bot User: ${bot.client.user?.tag || 'Unknown'}`));
            console.log(c.cyan(`  Commands: ${bot.commands.size}`));
            console.log(c.cyan(`  Guilds: ${bot.client.guilds.cache.size}`));
        }
        return;
    }

    switch(args[0]) {
        case 'reload':
            LoggerService.log('info', 'Reloading Discord configuration...');
            this.setupDiscordIntegration().then(() => {
                LoggerService.log('success', 'Discord configuration reloaded');
            }).catch((error) => {
                LoggerService.log('error', 'Failed to reload Discord configuration:', error.message);
            });
            break;
            
        case 'status':
            if (this.discordManager.isReady()) {
                const bot = this.discordManager.getBot();
                const uptime = Math.floor((Date.now() - bot.serverStartTime) / 1000);
                LoggerService.log('info', `Discord Bot Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`);
            } else {
                LoggerService.log('warn', 'Discord bot is not ready');
            }
            break;
            
        default:
            LoggerService.log('warn', 'Usage: discord [reload|status]');
    }