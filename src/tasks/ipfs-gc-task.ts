import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { createChildLoggerWith } from '../utils/logger';

export async function createIpfsGcTask(
  _context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  // one hour
  const gcInterval = 60 * 60 * 1000; // TODO: make it configurable
  const logger = createChildLoggerWith({ moduleId: 'ipfs-gc' }, loggerParent);
  let timer: NodeJS.Timeout;
  let stopped = false;

  const handleGc = async () => {
    if (stopped) {
      return;
    }
    try {
      // TODO: add gc call
    } finally {
      if (!stopped) {
        timer = setTimeout(handleGc, gcInterval);
      }
    }
  };
  return {
    name: 'ipfs-gc',
    start: () => {
      logger.info('ipfs gc task started');
      timer = setTimeout(handleGc, gcInterval);
      stopped = false;
    },
    stop: async () => {
      logger.info('ipfs gc task stopped');
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      return true;
    },
  };
}
