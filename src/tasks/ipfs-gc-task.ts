import Bluebird from 'bluebird';
import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { makeIntervalTask } from './task-utils';

async function handleGc(_context: AppContext, logger: Logger): Promise<void> {
  logger.info('ipfs gc started');
  await Bluebird.delay(10 * 1000);
  logger.info('ipfs gc completed');
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
