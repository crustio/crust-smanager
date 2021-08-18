import _ from 'lodash';
import { Logger } from 'winston';
import { createPinRecordOperator } from '../db/pin-record';
import SworkerApi from '../sworker';
import { AppContext } from '../types/context';
import { PinRecord, PinRecordOperator } from '../types/database';
import { SealInfoMap } from '../types/sworker';
import { SimpleTask } from '../types/tasks';
import { getTimestamp } from '../utils';
import { IsStopped, makeIntervalTask } from './task-utils';

const MinSworkerSealSpeed = 10 * 1024; // 10 KB/s
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
    logger.info(
      'file "%s" was sealed recently, skip checking sealing status',
      record.cid,
    );
    return;
  }
  if (
    record.last_check_time > 0 &&
    now - record.last_check_time < MinSealStartTime
  ) {
    logger.info('file "%s" was checked recently, skip checking', record.cid);
    return;
  }
  const lastCheckedTime =
    record.last_check_time > 0 ? record.last_check_time : record.pin_at;
  const duraitonSinceLastCheck = now - lastCheckedTime;
  const { sworkerApi } = context;
  // cid in seal info map, means it's being sealed
  // need to check the seal progress
  if (_.has(sealInfoMap, record.cid)) {
    const sealedSize = sealInfoMap[record.cid].sealed_size;
    const sealSpeed =
      (sealedSize - record.sealed_size) / 1024 / duraitonSinceLastCheck;
    if (sealSpeed < MinSworkerSealSpeed) {
      logger.warn(
        'sealing is too slow for file "%s", cancel sealing',
        record.cid,
      );
      await markRecordAsFailed(record, pinRecordOps, context, logger, true);
    } else {
      await pinRecordOps.updatePinRecordSealStatus(
        record.id,
        sealedSize,
        'sealing',
      );
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

async function isSealDone(
  cid: string,
  sworkerApi: SworkerApi,
  logger: Logger,
): Promise<boolean> {
  try {
    // ipfs pin returns quickly if the sealing is done, otherwise it will timeout
    const ret = await sworkerApi.getSealInfo(cid);
    return ret && (ret.type === 'valid' || ret.type === 'lost');
  } catch (ex) {
    logger.error('unexpected error while calling sworker api');
    throw ex;
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
