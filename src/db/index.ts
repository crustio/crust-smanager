import { NormalizedConfig } from '../types/smanager-config';
import path from 'path';
import { Sequelize } from 'sequelize';
import { Umzug, SequelizeStorage, LogFn } from 'umzug';
import { createChildLogger } from '../utils/logger';
import { Logger } from 'winston';
import _ from 'lodash';

function makeUmzugLogger(
  logger: Logger,
): Record<'info' | 'warn' | 'error' | 'debug', LogFn> {
  const logFn = (level: string, message: Record<string, unknown>) => {
    if ('event' in message) {
      logger[level](`${message.event} ${message.name}`);
    } else {
      const m = JSON.stringify(message);
      logger[level](m);
    }
  };
  const logLevels = ['info', 'warn', 'error', 'debug'];
  return _.chain(logLevels)
    .keyBy()
    .mapValues((lvl) => _.partial(logFn, lvl))
    .value() as Record<'info' | 'warn' | 'error' | 'debug', LogFn>;
}

export async function loadDb(config: NormalizedConfig) {
  const logger = createChildLogger({
    moduleId: 'db',
    modulePrefix: '💽',
  });
  const dbPath = path.join(config.dataDir, 'smanager-db.sqlite');
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
  });

  const umzug = new Umzug({
    migrations: {
      glob: [
        'migrations/*.[tj]s',
        {
          cwd: __dirname,
        },
      ],
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: makeUmzugLogger(logger),
  });

  logger.info('applying umzug migrations');
  await umzug.up();
}
