const chalk = require('chalk');

class LoggerService {
    static log(level, message, data = null) {
        const timestamp = new Date();
        const dateStr = timestamp.toLocaleDateString('en-GB').replace(/\//g, '/');
        const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '.');
        
        let coloredLevel;
        switch(level.toLowerCase()) {
            case 'error':
                coloredLevel = chalk.red('[ERROR]');
                break;
            case 'warn':
                coloredLevel = chalk.yellow('[WARN]');
                break;
            case 'info':
                coloredLevel = chalk.blue('[INFO]');
                break;
            case 'debug':
                coloredLevel = chalk.gray('[DEBUG]');
                break;
            case 'success':
                coloredLevel = chalk.green('[SUCCESS]');
                break;
            default:
                coloredLevel = chalk.white(`[${level.toUpperCase()}]`);
        }
        
        let logMessage = `${chalk.gray(dateStr)} | ${chalk.gray(timeStr)} - ${coloredLevel}: ${message}`;
        
        if (data) {
            logMessage += ` ${chalk.gray(JSON.stringify(data))}`;
        }
        
        console.log(logMessage);
    }
}

module.exports = LoggerService;