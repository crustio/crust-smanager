/**
 * indexer to load storage orderers from the chain database
 */

import Bluebird from 'bluebird';
import { Function0 } from 'lodash';
import { Logger } from 'winston';
import { createConfigOps } from '../db/configs';
import { AppContext } from '../types/context';
import { Task } from '../types/tasks';

// the storage key for 'market->files'
const MarketFilesKey =
  '0x5ebf094108ead4fefa73f7a3b13cb4a7b3b78f30e9b952d60249b22fcdaaa76d';

const KeyLastIndexedKey = 'db-indexer:LastIndexedKey';

export async function createDbIndexer(
  context: AppContext,
  loggerParent: Logger,
): Promise<Task> {
  const name = 'db-indexer';
  const logger = loggerParent.child({
    moduleId: name,
  });
  let started = false;

  return {
    name,
    start: async () => {
      started = true;
      logger.info('db indexer started, key: %s', started, MarketFilesKey);
      dbIndexer(context, logger, () => !started);
    },
    stop: async () => {
      started = false;
      logger.info('db indexer stopped');
      return true;
    },
    onTick: async (_block) => {}, // eslint-disable-line
  };
}

async function dbIndexer(
  context: AppContext,
  logger: Logger,
  isStopped: Function0<boolean>,
) {
  logger.info('db indexer thread started');
  const { database: db } = context;
  const config = createConfigOps(db);
  const lastIndexedKey = await config.readString(KeyLastIndexedKey);
  if (lastIndexedKey) {
    logger.info('restart indexing from key: %s', lastIndexedKey);
  }

  while (!isStopped()) {
    try {
      await Bluebird.delay(1 * 1000); // TODO: should be configurable
    } catch (e) {
      logger.error('caught exception', e);
    }
  }
  logger.info('db indexer thread stopped');
}
