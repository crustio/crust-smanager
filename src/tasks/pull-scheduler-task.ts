import Bluebird from 'bluebird';
import _, { Function0 } from 'lodash';
import { Logger } from 'winston';
import { createFileOrderOperator } from '../db/file-record';
import { createPinRecordOperator } from '../db/pin-record';
import { getLatestBlockTime } from '../indexing/chain-time-indexer';
import { AppContext } from '../types/context';
import {
  DbOrderOperator,
  DbResult,
  FileRecord,
  PinRecordOperator,
} from '../types/database';
import { PullingStrategy } from '../types/smanager-config';
import { SimpleTask } from '../types/tasks';
import { formatError, gbToMb } from '../utils';
import { BlockAndTime } from '../utils/chain-math';
import { LargeFileSize } from '../utils/consts';
import { makeRandomSelection } from '../utils/weighted-selection';
import {
  estimateIpfsPinTimeout,
  filterFile,
  isDiskEnoughForFile,
  isSealDone,
} from './pull-utils';
import { IsStopped, makeIntervalTask } from './task-utils';

/**
 * task to schedule ipfs file pulling
 */
async function handlePulling(
  context: AppContext,
  logger: Logger,
  isStopped: IsStopped,
): Promise<void> {
  const pickStrategy = makeStrategySelection(context);
  const pinRecordOps = createPinRecordOperator(context.database);

  const { database } = context;
  if (!(await isReady(context, logger))) {
    logger.info('skip pulling as node not ready');
    return;
  }

  const [sworkerFree, sysFree] = await getFreeSpace(context);
  logger.info('files pulling started');
  const maxFilesPerRound = 100;
  const fileOrderOps = createFileOrderOperator(database);
  for (let i = 0; i < maxFilesPerRound && !isStopped(); i++) {
    await Bluebird.delay(2 * 1000);
    const lastBlockTime = await getLatestBlockTime(context.database);
    if (!lastBlockTime) {
      logger.warn('can not get block time from db, skip this round');
      await Bluebird.delay(5 * 1000);
      break;
    }
    const [sealingCount, totalSize] = await pinRecordOps.getSealingInfo();
    const [maxForSmall, maxForLarge] = getMaxSealTasks(context);
    if (sealingCount >= maxForSmall + maxForLarge) {
      logger.info('current sealing %d files, skip this round', sealingCount);
      break;
    }
    logger.info(
      'current sealing %d files, total size: %d',
      sealingCount,
      totalSize,
    );

    const sealingFiles = await pinRecordOps.getSealingRecords();
    const [smallFiles, largeFiles] = _.partition(
      sealingFiles,
      (f) => f.size < LargeFileSize,
    );
    const sealSmall = _.size(smallFiles) < maxForSmall;
    const sealLarge = _.size(largeFiles) < maxForLarge;

    const strategy = pickStrategy();
    logger.info('pull file using strategy: %s', strategy);
    const record = await getOneFileByStrategy(
      context,
      logger,
      fileOrderOps,
      lastBlockTime,
      { strategy, sealSmall, sealLarge },
    );
    if (!record) {
      logger.info('no pending file records for strategy: %s', strategy);
      continue;
    }

    if (!isDiskEnoughForFile(record.size, totalSize, sworkerFree, sysFree)) {
      logger.info(
        'disk space is not enough for file %s, total size: %s, sworker free %s, sysFree: %s',
        record.cid,
        totalSize,
        sworkerFree,
        sysFree,
      );
      await fileOrderOps.updateFileInfoStatus(record.id, 'insufficient_space');
      continue;
    }
    await sealFile(
      context,
      logger,
      record,
      fileOrderOps,
      pinRecordOps,
      strategy,
    );
  }
}

async function isReady(context: AppContext, logger: Logger): Promise<boolean> {
  const { config, sworkerApi } = context;
  if (!context.groupInfo) {
    logger.info('group info not loaded, skip this round');
    return false;
  }
  if (!context.nodeInfo) {
    logger.info('node info not loaded, skip this round');
    return false;
  }
  if (config.scheduler.minSrdRatio > 0) {
    const workload = await sworkerApi.workload();
    const total = workload.srd.srd_complete + workload.srd.disk_available;
    const srdRatio = total > 0 ? (workload.srd.srd_complete * 100) / total : 0;
    if (srdRatio < config.scheduler.minSrdRatio) {
      logger.info(
        'current srd ratio: "%d" less than min srd ratio, skip this round',
        srdRatio,
      );
      return false;
    }
  }
  return await isSWorkerReady(context, logger);
}

async function isSWorkerReady(
  context: AppContext,
  logger: Logger,
): Promise<boolean> {
  const { api } = context;
  const sworkIdentity = await api.sworkIdentity();
  if (!sworkIdentity) {
    logger.warn('⚠️ Please wait your sworker to report the first work report');
    return false;
  }

  const groupOwner = sworkIdentity.group;
  if (!groupOwner) {
    logger.warn('⚠️ Wait for the node to join group');
    return false;
  }
  if (api.getChainAccount() === groupOwner) {
    logger.error("💥 Can't use owner account to configure isolation/member");
    return false;
  }
  return true;
}

// returns: [maxTasksForSmallFile, maxTasksForLargeFile]
function getMaxSealTasks(context: AppContext): [number, number] {
  const maxPendingFiles = context.config.scheduler.maxPendingTasks;
  // large files: 40%, small files 60%
  // and minimum: 1
  const maxForLarge = _.max([1, _.floor(maxPendingFiles * 0.4)]);
  const maxForSmall = _.max([1, maxPendingFiles - maxForLarge]);
  return [maxForSmall, maxForLarge];
}

function makeStrategySelection(
  context: AppContext,
): Function0<PullingStrategy> {
  const strategey = context.config.scheduler.strategy;
  const weights = _.map(strategey, (weight, key: PullingStrategy) => {
    return {
      weight,
      value: key,
    };
  });
  return makeRandomSelection(weights);
}

interface SealOption {
  strategy: PullingStrategy;
  sealSmall: boolean;
  sealLarge: boolean;
}

async function getOneFileByStrategy(
  context: AppContext,
  logger: Logger,
  fileOrderOps: DbOrderOperator,
  blockAndTime: BlockAndTime,
  options: SealOption,
): Promise<FileRecord | null> {
  const { strategy } = options;
  do {
    const record = await getPendingFile(fileOrderOps, options, logger);
    if (!record) {
      logger.info(
        'no pending files for strategy: %s, options: %o',
        strategy,
        options,
      );
      return null;
    }
    const status = filterFile(record, strategy, blockAndTime, context);
    switch (status) {
      case 'good':
        if (await isSealDone(record.cid, context.sworkerApi, logger)) {
          await fileOrderOps.updateFileInfoStatus(record.id, 'handled');
          break;
        }
        return record;
      case 'invalidCID':
      case 'invalidNoReplica':
        // invalid file
        logger.info('file "%s" is invalid, flag: %s', record.cid, status);
        await fileOrderOps.updateFileInfoStatus(record.id, 'invalid');
        break;
      case 'expired':
      case 'lifeTimeTooShort':
        logger.info('file "%s" is skipped by lifetime constraint', record.cid);
        await fileOrderOps.updateFileInfoStatus(record.id, 'expired');
        break;
      case 'pfSkipped':
      case 'nodeSkipped':
        logger.info('file "%s" is skipped by rule: "%s"', record.cid, status);
        await fileOrderOps.updateFileInfoStatus(record.id, 'skipped');
        break;
      case 'sizeTooSmall':
      case 'sizeTooLarge':
        logger.info(
          'file "%s" is skipped by size constraint: %s',
          record.cid,
          status,
        );
        await fileOrderOps.updateFileInfoStatus(record.id, 'skipped');
        break;
      case 'replicasNotEnough':
      case 'tooManyReplicas':
        logger.info(
          'file "%s" is skipped by replica constraint: %s',
          record.cid,
          status,
        );
        await fileOrderOps.updateFileInfoStatus(record.id, 'skipped');
        break;
      case 'pendingForReplica':
        logger.info(
          'file "%s" replica count is not enough, pending recheck',
          record.cid,
          status,
        );
        await fileOrderOps.updateFileInfoStatus(record.id, 'pending_replica');
        break;
    }
  } while (true); // eslint-disable-line
}

//
// return free space in MB
// returns (sworker free, sys free)
async function getFreeSpace(context: AppContext): Promise<[number, number]> {
  const [freeGBSize, sysFreeGBSize] = await context.sworkerApi.free();
  return [gbToMb(freeGBSize), gbToMb(sysFreeGBSize)];
}

async function getPendingFile(
  fileOrderOps: DbOrderOperator,
  sealOptions: SealOption,
  logger: Logger,
): DbResult<FileRecord> {
  const { strategy, sealLarge, sealSmall } = sealOptions;
  if (sealLarge) {
    const record = await getPendingFileByStrategy(
      fileOrderOps,
      strategy,
      false,
    );
    if (record) {
      return record;
    }

    logger.info(
      'no pending large files for strategey: %s, checking small files',
      strategy,
    );
    return await getPendingFileByStrategy(fileOrderOps, strategy, true);
  }

  if (sealSmall) {
    return getPendingFileByStrategy(fileOrderOps, strategy, true);
  }
  return null;
}

async function getPendingFileByStrategy(
  fileOrderOps: DbOrderOperator,
  strategy: PullingStrategy,
  smallFile: boolean,
): DbResult<FileRecord> {
  switch (strategy) {
    case 'newFilesWeight':
      return fileOrderOps.getPendingFileRecord('chainEvent', smallFile);
    case 'existedFilesWeight':
      return fileOrderOps.getPendingFileRecord('dbScan', smallFile);
  }
}

async function sealFile(
  context: AppContext,
  logger: Logger,
  record: FileRecord,
  fileOrderOps: DbOrderOperator,
  pinRecordOps: PinRecordOperator,
  strategey: PullingStrategy,
) {
  logger.info('sealing for file "%s"', record.cid);
  await pinRecordOps.addPinRecord(record.cid, record.size, strategey);
  await fileOrderOps.updateFileInfoStatus(record.id, 'handled');
  const { ipfsApi } = context;
  // timeout is necessay
  const [abortCtrl, result] = ipfsApi.pin(
    record.cid,
    estimateIpfsPinTimeout(record.size),
  );
  context.cancelationTokens[record.cid] = abortCtrl;

  result
    .then((r) => {
      if (r) {
        logger.info('file "%s" sealed successfuly', record.cid);
      } else {
        logger.info(
          'ipfs pin for "%s" returned false,  ipfs might being puling or already pulled this file.',
          record.cid,
        );
      }
    })
    .catch((e) => {
      const errStr = `${e}`;
      if (errStr.includes('TimeoutError')) {
        // fine
        logger.warn('ipfs pin timeout: %s', formatError(e));
      } else {
        logger.warn(
          'got unexpected error while calling ipfs apis: %s',
          formatError(e),
        );
      }
    });
}

export async function createPullSchedulerTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const pullingInterval = 5 * 60 * 1000; // trival, period run it if there is no pending files in the db

  return makeIntervalTask(
    30 * 1000,
    pullingInterval,
    'files-pulling',
    context,
    loggerParent,
    handlePulling,
  );
}
