const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const LoggerService = require('../service/logger/logger-service');
const { debug } = require('console');

class ConfigManager {
    static config = {};
    static env = {};

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

            await this.loadEnv();

            LoggerService.log('info', 'Version: ' + this.config.version);

            if (this.config.customVersion === false) {
                LoggerService.log('info', 'Fortnite version: ' + this.config.fnVersion);
            }

            LoggerService.log('success', 'Configuration loaded successfully.');
        } catch (error) {
            LoggerService.log('error', `Failed to load configuration: ${error.message}`);
        }
    }

    static async loadEnv() {
        const envPath = path.join(__dirname, '..', '..', '.env');

        try {
            if (!fsSync.existsSync(envPath)) {
                LoggerService.log('warning', '.env file not found, creating one...');

                const jwtSecret = crypto.randomBytes(32).toString('hex');
                const gameServerSecret = crypto.randomBytes(32).toString('hex');

                const envContent = `jwtSecret=${jwtSecret}\ngameServerSecret=${gameServerSecret}\n`;

                await fs.writeFile(envPath, envContent, 'utf-8');

                LoggerService.log('success', 'Environment variables initialized successfully.');
            }

            const result = dotenv.config({ path: envPath });

            if (result.error) {
                throw result.error;
            }

            this.env = result.parsed || {};

            LoggerService.log('success', '.env file loaded successfully.');
        } catch (error) {
            LoggerService.log('error', `Failed to load .env file: ${error.message}`);
        }
    }

    static get(key, defaultValue = null) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    static key(key, defaultValue = null) {
        return this.env[key] !== undefined ? this.env[key] : defaultValue;
    }

    static set(key, value) {
        this.config[key] = value;
    }

    static async save(key, value) {
        this.config[key] = value;

        try {
            const configPath = path.join(__dirname, '..', '..', 'server.properties');
            let configData = await fs.readFile(configPath, 'utf-8');

            const lines = configData.split('\n');
            let found = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line && !line.startsWith('#')) {
                    const [lineKey] = line.split('=').map(s => s.trim());
                    if (lineKey === key) {
                        lines[i] = `${key}=${value}`;
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                lines.push(`${key}=${value}`);
            }

            await fs.writeFile(configPath, lines.join('\n'), 'utf-8');
            LoggerService.log('info', `Configuration saved: ${key}=${value}`);
            return true;
        } catch (error) {
            LoggerService.log('error', `Failed to save configuration: ${error.message}`);
            return false;
        }
    }
}

module.exports = ConfigManager;

