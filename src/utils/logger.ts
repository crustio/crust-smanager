import { createLogger, format, Logger, transports } from 'winston';

const level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

const defaultLogger = createLogger({
  level: level,
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
      if (typeof info.message === 'string') {
        return `${left} ${info.message}`;
      }
      const m = JSON.stringify(info.message);
      return `${left} ${m}`;
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

export const logger = createChildLogger({
  moduleId: 'global',
  modulePrefix: '☄',
});

export function createChildLoggerWith(
  config: ChildLoggerConfig,
  loggerParent: Logger,
): Logger {
  return loggerParent.child(config);
}

export function createChildLogger(config: ChildLoggerConfig): Logger {
  return createChildLoggerWith(config, defaultLogger);
}
