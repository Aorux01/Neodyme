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
                    const separator = line.indexOf('=');
                    const key = separator === -1 ? line : line.slice(0, separator).trim();
                    const value = separator === -1 ? undefined : line.slice(separator + 1).trim();
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
                LoggerService.log('warn', '.env file not found, creating one...');

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

            if (!this.env.tfaKey) {
                const tfaKey = crypto.randomBytes(32).toString('hex');
                const current = fsSync.readFileSync(envPath, 'utf-8');
                const separator = current === '' || current.endsWith('\n') ? '' : '\n';
                await fs.writeFile(envPath, `${current}${separator}tfaKey=${tfaKey}\n`, 'utf-8');
                this.env.tfaKey = tfaKey;
                LoggerService.log('info', 'Generated tfaKey in .env (encrypts two-factor secrets, back it up with the rest of .env).');
            }

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

    // Create or update a key in the .env file (and the in-memory env cache).
    static async saveEnv(key, value) {
        this.env[key] = String(value);
        process.env[key] = String(value);

        try {
            const envPath = path.join(__dirname, '..', '..', '.env');
            let lines = [];
            if (fsSync.existsSync(envPath)) {
                lines = (await fs.readFile(envPath, 'utf-8')).split('\n');
            }

            let found = false;
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.split('=')[0].trim() === key) {
                    lines[i] = `${key}=${value}`;
                    found = true;
                    break;
                }
            }

            if (!found) {
                if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
                    lines.push(`${key}=${value}`);
                } else {
                    lines[Math.max(0, lines.length - 1)] = `${key}=${value}`;
                    lines.push('');
                }
            }

            await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
            return true;
        } catch (error) {
            LoggerService.log('error', `Failed to save .env key '${key}': ${error.message}`);
            return false;
        }
    }

    // Remove a key from the .env file (and the in-memory env cache).
    static async deleteEnv(key) {
        delete this.env[key];
        delete process.env[key];

        try {
            const envPath = path.join(__dirname, '..', '..', '.env');
            if (!fsSync.existsSync(envPath)) {
                return true;
            }

            const lines = (await fs.readFile(envPath, 'utf-8')).split('\n');
            const filtered = lines.filter(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return true;
                return trimmed.split('=')[0].trim() !== key;
            });

            await fs.writeFile(envPath, filtered.join('\n'), 'utf-8');
            return true;
        } catch (error) {
            LoggerService.log('error', `Failed to delete .env key '${key}': ${error.message}`);
            return false;
        }
    }
}

module.exports = ConfigManager;

