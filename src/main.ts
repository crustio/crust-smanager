import Bluebird from 'bluebird';
import _ from 'lodash';
import CrustApi from './chain';
import { loadConfig } from './config/load-config';
import { loadDb } from './db';
import { createIndexingTasks } from './indexing';
import IpfsApi from './ipfs';
import { makeSealCoordinatorApiFromConfig } from './services/seal-coordinator';
import SworkerApi from './sworker';
import { createSimpleTasks } from './tasks';
import { createChainHeightLogger } from './tasks/chain-height-logger-task';
import { AppContext } from './types/context';
import { NormalizedConfig } from './types/smanager-config';
import { SimpleTask, Task } from './types/tasks';
import { Dayjs } from './utils/datetime';
import { logger } from './utils/logger';
import { timeout, timeoutOrError } from './utils/promise-utils';
import { startHttp } from './http/http-interface';

const MaxTickTimout = 15 * 1000;
const IpfsTimeout = 8000 * 1000; // 8000s
const SworkerTimeout = 8000 * 1000; //8000s
const ConfigFile = process.env['SMANAGER_CONFIG'] || 'smanager-config.json';
const MaxNoNewBlockDuration = Dayjs.duration({
  minutes: 30,
});

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
  const config = await loadConfig(ConfigFile);
  logger.debug('smanager config loaded: %o', config);
  const api = await timeoutOrError(
    'connect to chain',
    startChain(config),
    240 * 1000,
  );

  const database = await loadDb(config);
  const ipfsApi = new IpfsApi(config.ipfs.endPoint, IpfsTimeout);
  const sworkerApi = new SworkerApi(config.sworker.endPoint, SworkerTimeout);
  const sealCoordinator = await makeSealCoordinatorApiFromConfig(
    config,
    logger,
  );

  const context: AppContext = {
    api,
    cancelationTokens: {},
    config,
    database,
    nodeInfo: null,
    groupInfo: null,
    ipfsApi,
    sworkerApi,
    sealCoordinator,
    startTime: Dayjs(),
  };
  const simpleTasks = await loadSimpleTasks(context);
  const tasks = await loadTasks(context);
  try {
    const logTask = await createChainHeightLogger(context, logger);
    logTask.start(context);
    await waitChainSynced(context);
    await logTask.stop();

    logger.info('reload chain api, waiting.....');
    await api.reconnect();

    // start tasks
    _.forEach(simpleTasks, (t) => t.start(context));
    _.forEach(tasks, (t) => t.start(context));

    // start http
    startHttp(context, logger);
    
    // start event loop after chain is synced
    await doEventLoop(context, tasks);
  } catch (e) {
    logger.error('unexpected error caught', e);
    throw e;
  } finally {
    logger.info('stopping simple tasks');
    await timeout(
      Bluebird.map(simpleTasks, (t) => t.stop()),
      5 * 1000,
      [],
    );
    logger.info('stopping indexing tasks');
    await timeout(
      Bluebird.map(tasks, (t) => t.stop()),
      5 * 1000,
      [],
    );
    logger.info('closing database and api');
    await timeout(database.close(), 5 * 1000, null);
    api.stop();
  }
}

async function loadSimpleTasks(context): Promise<SimpleTask[]> {
  const tasks = await createSimpleTasks(context);
  return tasks;
}

async function loadTasks(context: AppContext): Promise<Task[]> {
  const indexingTasks = await createIndexingTasks(context);
  return indexingTasks;
}

async function startChain(config: NormalizedConfig) {
  logger.info(
    'starting chain api with endpoint: %s, account: %s',
    config.chain.endPoint,
    config.chain.account,
  );
  const chainApi = new CrustApi(config.chain.endPoint, config.chain.account);
  await chainApi.initApi();
  return chainApi;
}

async function waitChainSynced(context: AppContext): Promise<void> {
  // 2 days
  const maxWait = 57600;
  let tick = 0;
  let successCount = 0;
  logger.info('waiting for chain synced');
  while (tick < maxWait) {
    tick++;
    await Bluebird.delay(3 * 1000);
    if (!(await context.api.isSyncing())) {
      successCount++;
      if (successCount > 1) {
        return;
      }
    }
  }
  throw new Error('time too long to wait for chain synced!');
}

async function doEventLoop(context: AppContext, tasks: Task[]): Promise<void> {
  const { api } = context;
  let lastBlock = api.latestFinalizedBlock();
  let lastBlockTime = Dayjs();
  logger.info('running event loop');
  do {
    await api.ensureConnection();
    const curBlock = api.latestFinalizedBlock();
    if (lastBlock >= curBlock) {
      const now = Dayjs();
      const diff = Dayjs.duration(now.diff(lastBlockTime));
      if (diff.asSeconds() > MaxNoNewBlockDuration.asSeconds()) {
        logger.error(
          'no new block for %d seconds, quiting smanager!',
          diff.asSeconds(),
        );
        throw new Error('block not updating');
      }
      await Bluebird.delay(3 * 1000);
      continue;
    }
    lastBlockTime = Dayjs();
    for (let block = lastBlock + 1; block <= curBlock; block++) {
      logger.info('run tasks on block %d', block);
      lastBlock = block;
      await timeoutOrError(
        `run tasks`,
        Bluebird.map(tasks, (t) => t.onTick(lastBlock)),
        MaxTickTimout,
      );
    }
    await Bluebird.delay(1 * 1000);
  } while (true); // eslint-disable-line
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
