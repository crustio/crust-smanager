import { createLogger, format, transports } from 'winston';

const defaultLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.colorize(),
    format.errors({ stack: true }),
    format.splat(),
    format.printf((info) => {
      let left = `[${info.timestamp}] ${info.level}: `;
      if (info.modulePrefix) {
        left += info.modulePrefix + ' ';
      }
      if (info.moduleId) {
        left += `[${info.moduleId}]`;
      }
      return `${left} ${info.message}`;
    }),
  ),
  transports: [
    //
    // - Write to all logs with level `info` and below to `crust-api-combined.log`.
    // - Write all logs error (and below) to `crust-api-error.log`.
    //
    new transports.Console(),
    new transports.File({ filename: 'crust-api-error.log', level: 'error' }),
    new transports.File({ filename: 'crust-api-combined.log' }),
  ],
});

export interface ChildLoggerConfig {
  moduleId: string;
  modulePrefix?: string;
}

export function createChildLogger(config: ChildLoggerConfig) {
  return defaultLogger.child(config);
}

export const logger = createChildLogger({
  moduleId: 'global',
  modulePrefix: '☄',
});
