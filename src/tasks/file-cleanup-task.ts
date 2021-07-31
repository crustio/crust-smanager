/**
 * a simple task to delete files from sworker
 */

import Bluebird from 'bluebird';
import { Logger } from 'winston';
import { createFileOrderOperator } from '../db/file-record';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { makeIntervalTask } from './task-utils';

async function handleCleanup(context: AppContext, logger: Logger) {
  const { database, sworkerApi } = context;
  const fileOrderOp = createFileOrderOperator(database);

  let filesCleaned = 0;

  do {
    const files = await fileOrderOp.getPendingCleanupRecords(10);
    for (const f of files) {
      try {
        logger.info('deleting file: %s, record id: %s', f.cid, f.id);
        await sworkerApi.delete(f.cid);
        await fileOrderOp.updateCleanupRecordStatus(f.id, 'done');
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
    fileCleanupInterval,
    'files-cleanup',
    context,
    loggerParent,
    handleCleanup,
  );
}
