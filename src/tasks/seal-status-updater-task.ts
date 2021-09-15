import _ from 'lodash';
import { Logger } from 'winston';
import { createPinRecordOperator } from '../db/pin-record';
import { AppContext } from '../types/context';
import { PinRecord, PinRecordOperator } from '../types/database';
import { SealInfoMap } from '../types/sworker';
import { SimpleTask } from '../types/tasks';
import { getTimestamp } from '../utils';
import { isSealDone } from './pull-utils';
import { IsStopped, makeIntervalTask } from './task-utils';

const MinSealStartTime = 10 * 60; // 10 minutes for a sealing job to start

/**
 * task to update the sealing status in the pin records table
 */
async function handleUpdate(
  context: AppContext,
  logger: Logger,
  isStopped: IsStopped,
) {
  const { database, sworkerApi } = context;
  const pinRecordOps = createPinRecordOperator(database);
  const pendingFiles = await sworkerApi.pendings();
  const sealingRecords = await pinRecordOps.getSealingRecords();
  logger.info('checking %d sealing records', sealingRecords.length);
  for (const r of sealingRecords) {
    if (isStopped()) {
      break;
    }
    await checkAndUpdateStatus(r, pendingFiles, context, logger, pinRecordOps);
  }
}

async function checkAndUpdateStatus(
  record: PinRecord,
  sealInfoMap: SealInfoMap,
  context: AppContext,
  logger: Logger,
  pinRecordOps: PinRecordOperator,
) {
  const now = getTimestamp();
  const totalTimeUsed = now - record.pin_at;
  if (totalTimeUsed < MinSealStartTime) {
    return;
  }
  if (
    record.last_check_time > 0 &&
    now - record.last_check_time < MinSealStartTime
  ) {
    return;
  }

  const { sworkerApi } = context;
  // cid in seal info map, means it's being sealed
  // need to check the seal progress
  if (_.has(sealInfoMap, record.cid)) {
    const sealedSize = sealInfoMap[record.cid].sealed_size;
    if (sealedSize > record.sealed_size) {
      logger.info(
        'file "%s" is sealing, update sealed size: %d',
        record.cid,
        sealedSize,
      );
      await pinRecordOps.updatePinRecordSealStatus(
        record.id,
        sealedSize,
        'sealing',
      );
    } else {
      logger.warn(
        'sealing is too slow for file "%s", cancel sealing',
        record.cid,
      );
      await markRecordAsFailed(record, pinRecordOps, context, logger, true);
    }
  } else {
    // cid not in seal info map, either means sealing is done or sealing is not started
    const done = await isSealDone(record.cid, sworkerApi, logger);
    if (!done) {
      logger.info('sealing blocked for file "%s", cancel sealing', record.cid);
      await markRecordAsFailed(record, pinRecordOps, context, logger, false);
    } else {
      logger.info('file "%s" is sealed, update the seal status', record.cid);
      await pinRecordOps.updatePinRecordStatus(record.id, 'sealed');
    }
  }
}

async function markRecordAsFailed(
  record: PinRecord,
  pinRecordOps: PinRecordOperator,
  context: AppContext,
  logger: Logger,
  endSworker: boolean,
) {
  const { sworkerApi } = context;
  if (_.has(context.cancelationTokens, record.cid)) {
    logger.info('aborting pin request for file: "%s"', record.cid);
    context.cancelationTokens[record.cid].abort();
    delete context.cancelationTokens[record.cid];
  }
  await pinRecordOps.updatePinRecordStatus(record.id, 'failed');
  if (endSworker) {
    await sworkerApi.sealEnd(record.cid);
  }
}

export async function createSealStatuUpdater(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const sealStatusUpdateInterval = 2 * 60 * 1000; // update seal status every 2 minutes
  return makeIntervalTask(
    1 * 60 * 1000,
    sealStatusUpdateInterval,
    'seal-updater',
    context,
    loggerParent,
    handleUpdate,
  );
}
