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
        }
    }

    static get(key, defaultValue = null) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }
}

module.exports = ConfigManager;
