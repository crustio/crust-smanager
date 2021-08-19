import { LogFn } from 'umzug';
import { Logger } from 'winston';
import _ from 'lodash';
import { Sequelize } from 'sequelize';
import { Umzug, SequelizeStorage } from 'umzug';

export function makeUmzugLogger(
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

export async function applyMigration(
  sequelize: Sequelize,
  logger: Logger,
): Promise<boolean> {
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
  return true;
}
