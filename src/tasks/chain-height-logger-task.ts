import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { IsStopped, makeIntervalTask } from './task-utils';

/**
 * Simple task to log latest chain height
 */
async function handleLog(
  context: AppContext,
  logger: Logger,
  isStopped: IsStopped,
) {
  const latest = context.api.latestFinalizedBlock();
  if (isStopped()) {
    return;
  }
  logger.info('latest chain height is %d', latest);
}

export async function createChainHeightLogger(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const logInterval = 30 * 1000;
  return makeIntervalTask(
    10 * 1000,
    logInterval,
    'chain-height',
    context,
    loggerParent,
    handleLog,
  );
}
