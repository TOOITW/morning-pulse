/**
 * Structured Logger using Winston
 * Supports correlation IDs, log levels, and file rotation
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata(),
  isDevelopment
    ? winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, metadata }) => {
          const meta = metadata as Record<string, unknown>;
          const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
          return `[${timestamp}] ${level}: ${message}${metaStr}`;
        })
      )
    : winston.format.json()
);

// Console transport
const consoleTransport = new winston.transports.Console({
  level: isDevelopment ? 'debug' : 'info',
});

// File transports with rotation (only in production)
const fileTransports: winston.transport[] = [];

if (!isDevelopment) {
  // Error logs
  fileTransports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.json(),
    })
  );

  // Combined logs
  fileTransports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      format: winston.format.json(),
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: logFormat,
  transports: [consoleTransport, ...fileTransports],
  exitOnError: false,
});

// Helper to add correlation ID
export function withCorrelationId(correlationId: string) {
  return logger.child({ correlationId });
}

// Helper to log with context
export function logWithContext(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context?: Record<string, unknown>
) {
  logger.log(level, message, context);
}

// Convenience methods
export const logInfo = (message: string, context?: Record<string, unknown>) =>
  logger.info(message, context);

export const logWarn = (message: string, context?: Record<string, unknown>) =>
  logger.warn(message, context);

export const logError = (message: string, error?: Error, context?: Record<string, unknown>) => {
  logger.error(message, {
    ...context,
    error: error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined,
  });
};

export const logDebug = (message: string, context?: Record<string, unknown>) =>
  logger.debug(message, context);

export default logger;
