const fs = require('fs');
const path = require('path');
const colors = require('../../utils/colors');

class LoggerService {
    static logsDir = path.join(__dirname, '../../../logs');
    static currentLogFile = null;
    static currentLogDate = null;
    static maxLineLength = 2000;
    static writeStream = null;

    static ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    static getLogFileName() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}.log`;
    }

    static getLogFilePath() {
        return path.join(this.logsDir, this.getLogFileName());
    }

    static formatTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
    }

    static truncateMessage(message) {
        if (message.length <= this.maxLineLength) {
            return message;
        }

        const truncated = message.substring(0, this.maxLineLength);
        const remainingBytes = message.length - this.maxLineLength;
        const remainingKb = (remainingBytes / 1024).toFixed(2);
        return `${truncated}... [${remainingKb}kb more]`;
    }

    static writeToFile(level, message, data = null) {
        try {
            this.ensureLogsDirectory();

            const timestamp = this.formatTimestamp();
            const levelTag = `[${level.toUpperCase()}]`.padEnd(9);

            let logLine = `${timestamp} ${levelTag} ${message}`;

            if (data) {
                const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
                logLine += ` ${dataStr}`;
            }

            // Truncate if too long
            logLine = this.truncateMessage(logLine);
            logLine += '\n';

            // Check if we need to create a new log file (new day)
            const currentDate = this.getLogFileName();
            if (this.currentLogDate !== currentDate) {
                if (this.writeStream) {
                    this.writeStream.end();
                }
                this.currentLogDate = currentDate;
                this.currentLogFile = this.getLogFilePath();
                this.writeStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
            }

            if (this.writeStream) {
                this.writeStream.write(logLine);
            } else {
                fs.appendFileSync(this.currentLogFile || this.getLogFilePath(), logLine);
            }
        } catch (error) {
            // Silent fail to avoid infinite loops
        }
    }

    static log(level, message, data = null) {
        const timestamp = new Date();
        const dateStr = timestamp.toLocaleDateString('en-GB').replace(/\//g, '/');
        const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '.');

        let coloredLevel;
        switch(level.toLowerCase()) {
            case 'error':
                coloredLevel = colors.red('[ERROR]');
                break;
            case 'warn':
                coloredLevel = colors.yellow('[WARN]');
                break;
            case 'info':
                coloredLevel = colors.blue('[INFO]');
                break;
            case 'debug':
                coloredLevel = colors.gray('[DEBUG]');
                break;
            case 'success':
                coloredLevel = colors.green('[SUCCESS]');
                break;
            default:
                coloredLevel = colors.white(`[${level.toUpperCase()}]`);
        }

        let logMessage = `${colors.gray(`${dateStr} | ${timeStr}`)} ${coloredLevel}: ${message}`;
        const ConfigManager = require('../../manager/config-manager');
        const globalDebug = ConfigManager.get('globalDebug', true);

        if (data) {
            logMessage += ` ${colors.gray(JSON.stringify(data))}`;
        }

        if (level.toLowerCase() === 'debug' && !globalDebug) {
            return;
        }

        // Write to console
        console.log(logMessage);

        // Write to file (without colors)
        this.writeToFile(level, message, data);
    }

    static cleanup() {
        if (this.writeStream) {
            this.writeStream.end();
            this.writeStream = null;
        }
    }
}

// Cleanup on process exit
process.on('exit', () => LoggerService.cleanup());
process.on('SIGINT', () => {
    LoggerService.cleanup();
    process.exit();
});
process.on('SIGTERM', () => {
    LoggerService.cleanup();
    process.exit();
});

module.exports = LoggerService;
