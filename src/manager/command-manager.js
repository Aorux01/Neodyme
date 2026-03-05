const readline = require('readline');
const fs = require('fs');
const path = require('path');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('./config-manager');

const PluginManager = require('./plugin-manager');
const BackupManager = require('./backup-manager');
const XMPPManager = require('./xmpp-manager');

class CommandManager {
    static readline = null;
    static commands = new Map();
    static startTime = Date.now();
    static pendingRestore = null;
    static pendingDelete = null;

    static async load() {
        this.readline = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        this.registerDefaultCommands();

        this.readline.on('line', (input) => {
            const [command, ...args] = input.trim().split(' ');

            if (command) {
                this.execute(command, args);
            }
        });

        LoggerService.log('success', 'Command system ready.');
    }

    static async serverStop() {
        try {
            if (ConfigManager.get('plugins')) {
                LoggerService.log('info', 'Unloading plugins...');
                await PluginManager.unloadAll();
            }

            if (ConfigManager.get('xmppEnable')) {
                LoggerService.log('info', 'Stopping XMPP server...');
                await XMPPManager.stop();
            }

            if (ConfigManager.get('databaseBackup')) {
                LoggerService.log('info', 'Shutting down backup system...');
                await BackupManager.shutdown();
            }

            LoggerService.log('info', 'Shutting down API server...');
            if (this.serverInstance?.httpServer) {
                this.serverInstance.httpServer.close(() => {
                    LoggerService.log('info', 'API server closed.');
                });
            }

            LoggerService.log('success', 'Server stopped successfully.');
            LoggerService.log('info', 'Goodbye!');
            process.exit(0);
        } catch (error) {
            LoggerService.log('error', 'Error during server shutdown:', { error: error.message });
            process.exit(1);
        }
    }

    static register(name, handler) {
        this.commands.set(name.toLowerCase(), handler);
    }

    static execute(command, args = []) {
        const handler = this.commands.get(command.toLowerCase());
        if (handler) {
            try {
                handler(args);
            } catch (error) {
                LoggerService.log('error', `Error executing command '${command}': ${error.message}`);
            }
        } else {
            LoggerService.log('warn', `Unknown command: '${command}'. Type '/help' for a list of commands.`);
        }
    }

    static registerDefaultCommands() {
        const commandsDir = path.join(__dirname, '../commands');

        if (!fs.existsSync(commandsDir)) {
            LoggerService.log('warn', 'Commands directory not found, no commands registered.');
            return;
        }

        const files = fs.readdirSync(commandsDir)
            .filter(f => f.endsWith('.js'))
            .sort();

        for (const file of files) {
            try {
                const mod = require(path.join(commandsDir, file));
                if (typeof mod.register === 'function') {
                    mod.register(this);
                }
            } catch (error) {
                LoggerService.log('error', `Failed to load command module '${file}': ${error.message}`);
            }
        }
    }
}

module.exports = CommandManager;
