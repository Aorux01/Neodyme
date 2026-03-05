const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('../manager/config-manager');

class DateSanitizerMiddleware {
    static FUTURE_DATE_PATTERN = /9999-\d{2}-\d{2}/;
    static ISO_DATE_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g;

    static generateRealisticDate(daysFromNow = 7) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysFromNow);
        return futureDate.toISOString();
    }

    static isUnrealisticDate(dateString) {
        return this.FUTURE_DATE_PATTERN.test(dateString);
    }

    static sanitizeValue(value, maxDays = 7) {
        if (typeof value === 'string' && this.isUnrealisticDate(value)) {
            return this.generateRealisticDate(maxDays);
        }

        if (Array.isArray(value)) {
            return value.map(item => this.sanitizeValue(item, maxDays));
        }

        if (typeof value === 'object' && value !== null) {
            const sanitized = {};
            for (const key in value) {
                if (value.hasOwnProperty(key)) {
                    sanitized[key] = this.sanitizeValue(value[key], maxDays);
                }
            }
            return sanitized;
        }

        return value;
    }

    static middleware() {
        return (req, res, next) => {
            const enabled = ConfigManager.get('sanitizeExpirationDates', true);

            if (!enabled) {
                return next();
            }

            const originalJson = res.json.bind(res);

            res.json = function(data) {
                try {
                    const maxDays = ConfigManager.get('expirationMaxDays', 7);
                    const sanitized = DateSanitizerMiddleware.sanitizeValue(data, maxDays);

                    return originalJson(sanitized);
                } catch (error) {
                    LoggerService.log('error', `Date sanitization error: ${error.message}`);
                    return originalJson(data);
                }
            };

            next();
        };
    }

    static sanitize(data, maxDays = 7) {
        return this.sanitizeValue(data, maxDays);
    }

    static async sanitizeJsonFile(filePath, maxDays = 7) {
        const fs = require('fs').promises;

        try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            const sanitized = this.sanitizeValue(data, maxDays);

            if (JSON.stringify(data) !== JSON.stringify(sanitized)) {
                await fs.writeFile(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
                return true;
            }

            return false;
        } catch (error) {
            LoggerService.log('error', `Failed to sanitize file ${filePath}: ${error.message}`);
            return false;
        }
    }

    static async sanitizeAllProfiles() {
        const fs = require('fs').promises;
        const path = require('path');

        const playersPath = path.join(__dirname, '../../data/players');
        let filesModified = 0;
        let totalFiles = 0;

        try {
            const playerDirs = await fs.readdir(playersPath);

            for (const playerDir of playerDirs) {
                const playerPath = path.join(playersPath, playerDir);
                const stat = await fs.stat(playerPath);

                if (!stat.isDirectory()) continue;

                const files = await fs.readdir(playerPath);

                for (const file of files) {
                    if (!file.endsWith('.json')) continue;

                    const filePath = path.join(playerPath, file);
                    totalFiles++;

                    const modified = await this.sanitizeJsonFile(filePath);
                    if (modified) filesModified++;
                }
            }

            LoggerService.log('success', `Date sanitization complete: ${filesModified}/${totalFiles} files modified`);
            return { totalFiles, filesModified };
        } catch (error) {
            LoggerService.log('error', `Profile sanitization failed: ${error.message}`);
            return { totalFiles: 0, filesModified: 0 };
        }
    }
}

module.exports = DateSanitizerMiddleware;
