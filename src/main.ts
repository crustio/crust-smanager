import Bluebird from 'bluebird';
import _ from 'lodash';
import CrustApi from './chain';
import { loadConfig } from './config/load-config';
import { loadDb } from './db';
import { createIndexingTasks } from './indexing';
import { AppContext } from './types/context';
import { NormalizedConfig } from './types/smanager-config';
import { Task } from './types/tasks';
import { logger } from './utils/logger';
import { timeout, timeoutOrError } from './utils/promise-utils';

const MaxTickTimout = 15 * 1000;

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
  const api = await timeoutOrError(startChain(config), 10 * 1000);

  const context: AppContext = {
    api,
    config,
  };
  await loadDb(config);
  const tasks = loadTasks(context);
  try {
    await waitChainSynced(context);
    _.forEach(tasks, (t) => t.start(context));
    await doEventLoop(context, tasks);
  } catch (e) {
    logger.error('unexpected error caught', e);
    throw e;
  } finally {
    logger.info('stopping all tasks');
    api.stop();
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

async function startChain(config: NormalizedConfig) {
  logger.info(
    'starting chain api with endpoint: %s, acocunt: %s',
    config.chain.endPoint,
    config.chain.account,
  );
  const chainApi = new CrustApi(config.chain.endPoint, config.chain.account);
  await chainApi.initApi();
  return chainApi;
}

async function waitChainSynced(context: AppContext): Promise<void> {
  const maxWait = 1000;
  let tick = 0;
  logger.info('waiting for chain synced');
  while (true) {
    tick++;
    await Bluebird.delay(3 * 1000);
    if (!(await context.api.isSyncing())) {
      break;
    }
    if (tick > maxWait) {
      throw new Error('time too long to wait for chain synced!');
    }
  }
}

async function doEventLoop(context: AppContext, tasks: Task[]): Promise<void> {
  const { api } = context;
  let lastBlock = api.latestFinalizedBlock();
  logger.info('running event loop');
  do {
    const curBlock = api.latestFinalizedBlock();
    if (lastBlock >= curBlock) {
      await Bluebird.delay(3 * 1000);
      continue;
    }
    for (let block = lastBlock + 1; block <= curBlock; block++) {
      logger.info('run tasks on block %d', block);
      lastBlock = block;
      await timeoutOrError(
        Bluebird.map(tasks, (t) => t.onTick(lastBlock)),
        MaxTickTimout,
      );
    }
    await Bluebird.delay(1 * 1000);
  } while (true);
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
