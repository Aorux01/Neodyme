const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m',
    white: '\x1b[37m'
};

const colorsLevel = {
    cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
    green: (text) => `${colors.green}${text}${colors.reset}`,
    red: (text) => `${colors.red}${text}${colors.reset}`,
    yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
    blue: (text) => `${colors.blue}${text}${colors.reset}`,
    magenta: (text) => `${colors.magenta}${text}${colors.reset}`,
    gray: (text) => `${colors.gray}${text}${colors.reset}`,
    white: (text) => `${colors.white}${text}${colors.reset}`
};

module.exports = colorsLevel;
