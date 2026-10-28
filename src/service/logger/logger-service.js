const fs = require('fs');
const path = require('path');
const colors = require('../../utils/colors');

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function buildSessionFileName() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `${date}_${time}.txt`;
}

class LoggerService {
    static logsDir = path.join(__dirname, '../../../logs');
    static sessionFile = path.join(this.logsDir, buildSessionFileName());
    static maxLineLength = 2000;
    static rl = null;

    static setReadline(rl) {
        this.rl = rl;
        // Once the prompt is closed, logging must fall back to plain output.
        rl.on('close', () => {
            if (this.rl === rl) this.rl = null;
        });
    }

    static ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    static getLogFilePath() {
        return this.sessionFile;
    }

    static pruneOldLogs(maxFiles) {
        try {
            if (!fs.existsSync(this.logsDir) || !(maxFiles > 0)) return;
            const files = fs.readdirSync(this.logsDir)
                .filter(f => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt$/.test(f))
                .sort();
            files.slice(0, Math.max(0, files.length - maxFiles))
                .forEach(f => fs.unlinkSync(path.join(this.logsDir, f)));
        } catch (_) {}
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

            const levelTag = `[${level.toUpperCase()}]`.padEnd(9);
            let logLine = `${this.formatTimestamp()} ${levelTag} ${message}`;

            if (data) {
                logLine += ` ${typeof data === 'string' ? data : JSON.stringify(data)}`;
            }

            logLine = this.truncateMessage(logLine.replace(ANSI_PATTERN, ''));
            fs.appendFileSync(this.sessionFile, logLine + '\n');
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

        // Write to console (with sticky prompt support)
        if (this.rl && process.stdout.isTTY) {
            const readline = require('readline');
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(logMessage + '\n');
            try {
                this.rl.prompt(true);
            } catch (_) {
                this.rl = null;
            }
        } else {
            console.log(logMessage);
        }

        // Write to file (without colors)
        this.writeToFile(level, message, data);
    }
}

process.on('uncaughtException', (err) => {
    try {
        LoggerService.writeToFile('error', `Uncaught exception: ${err.message}`, { stack: err.stack });
        console.error(`Uncaught exception: ${err.stack || err.message}`);
    } finally {
        process.exit(1);
    }
});
process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    LoggerService.log('error', `Unhandled rejection: ${err.message}`, { stack: err.stack });
});
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

module.exports = LoggerService;
