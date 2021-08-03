import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { IsStopped, makeIntervalTask } from './task-utils';

// Repo GC timeout
export const IPFSGCTimeout = 6 * 60 * 60 * 1000; // 6 hours

async function handleGc(
  context: AppContext,
  _logger: Logger,
  _isStopped: IsStopped,
): Promise<void> {
  await context.ipfsApi.repoGC(IPFSGCTimeout);
}

export async function createIpfsGcTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const ipfsInterval = 60 * 60 * 1000; // TODO: make it configurable
  return makeIntervalTask(
    ipfsInterval,
    'ipfs-gc',
    context,
    loggerParent,
    handleGc,
  );
}
