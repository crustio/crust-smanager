import Bluebird from 'bluebird';
import _ from 'lodash';
import { loadConfig } from './config/load-config';
import { createIndexingTasks } from './indexing';
import { AppContext } from './types/context';
import { Task } from './types/tasks';
import { logger } from './utils/logger';
import { timeout } from './utils/promise-utils';

/**
 * SManager tasks:
 * 1. Indexing tasks - collect file orders and put them in orders db
 * 2. Sealing scheduler - schedule sealing tasks based on sealing strategey
 * 3. db cleanup tasks - cleanup expired file orders in orders db
 *
 * helper modules:
 * 1. bandwidth measuring for files owner
 * 2. whitelist/banlist auto learning
 */
async function main() {
  logger.info('starting smanager');
  const config = await loadConfig('smanager-config.json');
  logger.debug('smanager config loaded: %o', config);
  const context: AppContext = {
    config,
  };
  const tasks = loadTasks(context);
  try {
    _.forEach(tasks, (t) => t.start(context));
  } catch (e) {
    logger.error('unexpected error caught', e);
    throw e;
  } finally {
    logger.info('stopping all tasks');
    await timeout(
      Bluebird.map(tasks, (t) => t.stop()),
      5 * 1000,
      [],
    );
  }
}

function loadTasks(context: AppContext): Task[] {
  const indexingTasks = createIndexingTasks(context);
  return indexingTasks;
}

main()
  .then(async () => {
    logger.info('application exited normally');
    process.exit(0);
  })
  .catch(async (e) => {
    logger.error(`Uncaught exception`, e);
    // wait for a short period to gracefully shutdown
    await Bluebird.delay(5 * 1000);
    process.exit(1);
  });
