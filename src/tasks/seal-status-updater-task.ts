import _ from 'lodash';
import { Logger } from 'winston';
import { createPinRecordOperator } from '../db/pin-record';
import IpfsApi from '../ipfs';
import SworkerApi from '../sworker';
import { AppContext } from '../types/context';
import { PinRecord, PinRecordOperator } from '../types/database';
import { SealInfoMap } from '../types/sworker';
import { SimpleTask } from '../types/tasks';
import { getTimestamp } from '../utils';
import { IsStopped, makeIntervalTask } from './task-utils';

const MinSworkerSealSpeed = 10 * 1024; // 10 KB/s
const MinSealStartTime = 2 * 60; // 2 minutes for a sealing job to start

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
  const { ipfsApi, sworkerApi } = context;
  // cid in seal info map, means it's being sealed
  // need to check the seal progress
  if (_.has(sealInfoMap, record.cid)) {
    const sealSpeed =
      sealInfoMap[record.cid].sealed_size / 1024 / totalTimeUsed;
    if (sealSpeed < MinSworkerSealSpeed) {
      logger.warn(
        'sealing is too slow for file "%s", cancel sealing',
        record.cid,
      );
      await makeRecordAsFailed(record, pinRecordOps, sworkerApi);
    }
  } else {
    // cid not in seal info map, ether means sealing is done or sealing is not started
    const done = await isSealDone(record.cid, ipfsApi, logger);
    if (!done) {
      logger.info('sealing blocked for file "%s", cancel sealing', record.cid);
      await makeRecordAsFailed(record, pinRecordOps, sworkerApi);
    } else {
      logger.info('file "%s" is sealed, update the seal status', record.cid);
      await pinRecordOps.updatePinRecordStatus(record.id, 'sealed');
    }
  }
}

async function makeRecordAsFailed(
  record: PinRecord,
  pinRecordOps: PinRecordOperator,
  sworkerApi: SworkerApi,
) {
  await pinRecordOps.updatePinRecordStatus(record.id, 'failed');
  await sworkerApi.sealEnd(record.cid);
}

async function isSealDone(
  cid: string,
  ipfsApi: IpfsApi,
  logger: Logger,
): Promise<boolean> {
  try {
    // ipfs pin returns quickly if the sealing is done, otherwise it will timeout
    const ret = await ipfsApi.pin(cid, 10 * 1000);
    return !!ret;
  } catch (ex) {
    const errStr = `${ex}`;
    if (errStr.includes('TimeoutError')) {
      return false;
    } else {
      logger.error('unexpected error while calling ipfs apis');
      throw ex;
    }
  }
}

export async function createSealStatuUpdater(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const sealStatusUpdateInterval = 5 * 1000; // update seal status every 2 minutes
  return makeIntervalTask(
    sealStatusUpdateInterval,
    'seal-updater',
    context,
    loggerParent,
    handleUpdate,
  );
}
