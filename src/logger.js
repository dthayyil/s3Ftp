import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }

    return msg;
});

// Create logger instance
const winstonLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        // Console output
        new winston.transports.Console({
            format: combine(
                colorize(),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        }),
        // File output for errors
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // File output for all logs
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// Create a wrapper to match ftp-srv logger interface
class FtpLogger {
    constructor(baseLogger, metadata = {}) {
        this.baseLogger = baseLogger;
        this.metadata = metadata;
    }

    trace(msg, meta = {}) {
        return this.baseLogger.debug(msg, { ...this.metadata, ...meta });
    }

    debug(msg, meta = {}) {
        return this.baseLogger.debug(msg, { ...this.metadata, ...meta });
    }

    info(msg, meta = {}) {
        return this.baseLogger.info(msg, { ...this.metadata, ...meta });
    }

    warn(msg, meta = {}) {
        return this.baseLogger.warn(msg, { ...this.metadata, ...meta });
    }

    error(msg, meta = {}) {
        return this.baseLogger.error(msg, { ...this.metadata, ...meta });
    }

    child(metadata = {}) {
        return new FtpLogger(this.baseLogger, { ...this.metadata, ...metadata });
    }
}

export const logger = new FtpLogger(winstonLogger);

export default logger;
