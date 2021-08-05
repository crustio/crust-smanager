/**
 * a simple task to delete files from sworker
 */

import Bluebird from 'bluebird';
import { Logger } from 'winston';
import { createFileOrderOperator } from '../db/file-record';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { IsStopped, makeIntervalTask } from './task-utils';

/**
 * task to delete files from ipfs in the cleanup records table
 */
async function handleCleanup(
  context: AppContext,
  logger: Logger,
  isStopped: IsStopped,
) {
  const { database, sworkerApi } = context;
  const fileOrderOp = createFileOrderOperator(database);

  let filesCleaned = 0;

  do {
    if (isStopped()) {
      return;
    }
    const files = await fileOrderOp.getPendingCleanupRecords(10);
    for (const f of files) {
      try {
        logger.info('deleting file: %s, record id: %s', f.cid, f.id);
        const deleted = await sworkerApi.delete(f.cid);
        const status = deleted ? 'done' : 'failed';
        await fileOrderOp.updateCleanupRecordStatus(f.id, status);
      } catch (e) {
        logger.error('delete file %s failed', f.cid, e);
        await fileOrderOp.updateCleanupRecordStatus(f.id, 'failed');
      }
    }
    await Bluebird.delay(10 * 1000); // wait for a while to do next round
    filesCleaned = files.length;
  } while (filesCleaned > 0);
}

export async function createFileCleanupTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const fileCleanupInterval = 30 * 60 * 1000; // TODO: make it configurable
  return makeIntervalTask(
    10 * 60 * 1000,
    fileCleanupInterval,
    'files-cleanup',
    context,
    loggerParent,
    handleCleanup,
  );
}
