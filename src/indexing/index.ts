/**
 * module for a list for storage order indexers
 * an indexer collects a list of storage orders from some data source
 * data sources could be the on chain event, historical data and an open rpc
 */

import { AppContext } from '../types/context';
import { Task } from '../types/tasks';
import { createChildLogger } from '../utils/logger';

export function createIndexingTasks(_context: AppContext): Task[] {
  const logger = createChildLogger({
    moduleId: 'indexing',
    modulePrefix: '✏️',
  });

  logger.info('creating indexing tasks');
  return [];
}
