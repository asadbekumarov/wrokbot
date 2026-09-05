const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
}

export const logger = {
    info(tag, message) {
        if (!message) {
            message = tag;
            tag = 'SYSTEM';
        }
        console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.green}[INFO]${colors.reset} ${colors.cyan}[${tag}]${colors.reset} ${message}`);
    },

    warn(tag, message) {
        if (!message) {
            message = tag;
            tag = 'SYSTEM';
        }
        console.warn(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${colors.yellow}[${tag}]${colors.reset} ${message}`);
    },

    error(tag, message, err = null) {
        if (!message) {
            message = tag;
            tag = 'SYSTEM';
        }
        console.error(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${colors.red}[${tag}]${colors.reset} ${message}`);
        if (err && err.stack) {
            console.error(`${colors.red}${err.stack}${colors.reset}`);
        }
    },

    userbot(userId, message) {
        console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.blue}[USERBOT:${userId}]${colors.reset} ${message}`);
    },

    bot(message) {
        console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.magenta}[BOT]${colors.reset} ${message}`);
    },

    auth(userId, message) {
        console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.yellow}[AUTH:${userId}]${colors.reset} ${message}`);
    },

    match(userId, channel, matchedKeywords) {
        console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.bright}${colors.green}[MATCH:${userId}]${colors.reset} 🎯 Topildi: [${matchedKeywords.join(', ')}] | Kanal: ${channel}`);
    },

    memory() {
        const mem = process.memoryUsage();
        const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
        console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.magenta}[RAM]${colors.reset} RSS: ${rssMB}MB | Heap: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    }
};
