// ========== FILE 5: backend/src/logger.js ==========
const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: [
        new winston.createLogger.transports.Console({
            format: winston.format.colorize({ all: true }),
        }),
    ],
});

module.exports = logger;