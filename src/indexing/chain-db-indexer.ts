/**
 * indexer to load storage orderers from the chain database
 */

import BigNumber from 'bignumber.js';
import Bluebird from 'bluebird';
import dayjs from 'dayjs';
import _ from 'lodash';
import { Function0 } from 'lodash';
import { Logger } from 'winston';
import { FileInfo } from '../chain';
import { createConfigOps } from '../db/configs';
import { createFileOrderOperator } from '../db/file-record';
import { ChainFileInfo } from '../types/chain';
import { AppContext } from '../types/context';
import { Task } from '../types/tasks';
import { bytesToMb, formatError } from '../utils';
import { BlockAndTime, estimateTimeAtBlock } from '../utils/chain-math';
import { Dayjs } from '../utils/datetime';
import { getLatestBlockTime } from './chain-time-indexer';

// the storage key for 'market->files'
const MarketFilesKey =
  '0x5ebf094108ead4fefa73f7a3b13cb4a7b3b78f30e9b952d60249b22fcdaaa76d';

const KeyLastIndexedKey = 'db-indexer:LastIndexedKey';
const KeyLastDoneTime = 'db-indexer:LastDoneTime';

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
  const { api, database: db } = context;
  const config = createConfigOps(db);
  const fileOrderOp = createFileOrderOperator(context.database);
  let lastIndexedKey = await config.readString(KeyLastIndexedKey);
  if (!_.isEmpty(lastIndexedKey)) {
    logger.info('restart indexing from key: %s', lastIndexedKey);
  }

  const isInCooldownPeriod = async () => {
    const CooldownTime = dayjs.duration({
      minutes: 10,
    });
    const lastCompeleted = await config.readTime(KeyLastDoneTime);
    if (!lastCompeleted) {
      return false;
    }
    return (
      dayjs.duration(dayjs().diff(lastCompeleted)).asSeconds() <
      CooldownTime.asSeconds()
    );
  };

  while (!isStopped()) {
    try {
      await Bluebird.delay(3 * 1000); // TODO: should be configurable
      const lastBlockTime = await getLatestBlockTime(db);
      if (!lastBlockTime) {
        logger.warn(
          'can not get block time from db, wait for a short period to check agin',
        );
        await Bluebird.delay(5 * 1000);
        continue;
      }
      if (await isInCooldownPeriod()) {
        // full db scan completed recently, not to need to run the indexer too often
        logger.info('in cool down period, wait for a short while to recheck');
        await Bluebird.delay(5 * 60 * 1000);
        continue;
      }
      const keys = await (_.isEmpty(lastIndexedKey)
        ? api.chainApi().rpc.state.getKeysPaged(MarketFilesKey, 10) // TODO: batch size should be configurable
        : api
            .chainApi()
            .rpc.state.getKeysPaged(MarketFilesKey, 10, lastIndexedKey));
      const keyStrs = keys.map((k) => k.toString());
      const cids = _.chain(keyStrs)
        .filter((k) => k !== lastIndexedKey)
        .map((key) => {
          const cid = cidFromStorageKey(key);
          if (!cid) {
            return null;
          }
          return {
            cid,
            key,
          };
        })
        .filter()
        .value();
      if (_.isEmpty(cids)) {
        logger.info('no pending cids to index from db, mark indexing as done');
        await config.saveTime(KeyLastDoneTime, dayjs());
        await config.saveString(KeyLastIndexedKey, '');
        continue;
      }
      logger.info('got %d cids to process', cids.length);

      const fileInfos = await Bluebird.mapSeries(cids, (f) =>
        indexOneFile(f.cid, context, logger, lastBlockTime),
      );
      const validInfos = _.filter(fileInfos);
      await fileOrderOp.addFiles(validInfos, 'dbScan');
      lastIndexedKey = _.last(cids).key;
      await config.saveString(KeyLastIndexedKey, lastIndexedKey);
    } catch (e) {
      logger.error('caught exception: %s', formatError(e));
    }
  }
  logger.info('db indexer thread stopped');
}

async function indexOneFile(
  cid: string,
  context: AppContext,
  logger: Logger,
  lastBlock: BlockAndTime,
): Promise<FileInfo | null> {
  const { api } = context;
  logger.info('indexing "%s"', cid);
  const file: any = await api.chainApi().query.market.files(cid); // eslint-disable-line
  if (file.isEmpty) {
    logger.warn('file %s not exist on chain', cid);
    return null;
  }
  const fi = file.toJSON() as any; // eslint-disable-line
  const fileInfo = {
    ...fi,
    amount: new BigNumber(fi.amount.toString()),
  } as ChainFileInfo;
  const MinLifeTime = Dayjs.duration({
    months: 4,
  });
  const now = dayjs();
  const expireTime = estimateTimeAtBlock(fileInfo.expired_at, lastBlock);
  const life = dayjs.duration(expireTime.diff(now));
  if (life.asSeconds() < MinLifeTime.asSeconds()) {
    logger.info(
      'skip file %s, life(%s) is shorter than configured min life period: %s',
      cid,
      life.humanize(),
      MinLifeTime.humanize(),
    );
    return null;
  }

  const fileRecord: FileInfo = {
    cid,
    size: bytesToMb(fileInfo.file_size),
    tips: fileInfo.amount.toNumber(),
    owner: null,
    replicas: fileInfo.reported_replica_count,
    expiredAt: fileInfo.expired_at,
  };
  return fileRecord;
}

export function isValidMarketSubKey(key: string): boolean {
  return key.startsWith(MarketFilesKey);
}

export function cidFromStorageKey(key: string): string | null {
  if (!isValidMarketSubKey(key)) {
    return null;
  }
  const cidInHex = key.substr(MarketFilesKey.length + 18);
  const cid = Buffer.from(cidInHex, 'hex')
    .toString()
    .replace(/[^\x00-\x7F]/g, ''); // eslint-disable-line
  return cid;
}
