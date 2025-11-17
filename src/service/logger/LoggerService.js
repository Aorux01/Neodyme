const colors = require('../../utils/Colors');

class LoggerService {
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

        if (data) {
            logMessage += ` ${colors.gray(JSON.stringify(data))}`;
        }

        console.log(logMessage);
    }
}

module.exports = LoggerService;