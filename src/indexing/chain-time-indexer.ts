import dayjs from 'dayjs';
import _ from 'lodash';
import { Database } from 'sqlite';
import { Logger } from 'winston';
import { createConfigOps } from '../db/configs';
import { AppContext } from '../types/context';
import { LatestBlockTime } from '../types/database';
import { Task } from '../types/tasks';
import { BlockAndTime } from '../utils/chain-math';

const KeyLatestBlockTime = 'chain-time-indexer:latest-block-time';

/**
 * A simple indexer which saves the latest block time the database
 */
export async function createChainTimeIndexer(
  context: AppContext,
  loggerParent: Logger,
): Promise<Task> {
  const name = 'chain-time-indexer';
  const { api, database } = context;
  const logger = loggerParent.child({
    moduleId: name,
  });
  const configOps = createConfigOps(database);
  return {
    name,
    start: () => {}, // eslint-disable-line
    stop: async () => {
      return true;
    },
    onTick: async (block: number) => {
      const hash = await api.getBlockHash(block);
      const timestamp = await api.chainApi().query.timestamp.now.at(hash);
      const latestData = {
        block,
        time: timestamp.toNumber(),
      } as LatestBlockTime;
      logger.debug('write latest block time to config: %o', latestData);
      await configOps.saveJson(KeyLatestBlockTime, latestData);
    },
  };
}

export async function getLatestBlockTime(
  db: Database,
): Promise<BlockAndTime | null> {
  const configOps = createConfigOps(db);
  const time = (await configOps.readJson(
    KeyLatestBlockTime,
  )) as LatestBlockTime | null;
  if (!time || !_.isNumber(time.block) || !_.isNumber(time.time)) {
    return null;
  }
  const day = dayjs(time.time);
  return day.isValid()
    ? {
        block: time.block,
        time: day,
      }
    : null;
}
