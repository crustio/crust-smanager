/**
 * module for a list for order indexers
 * an indexer collects some data(e.g. storage orders, chain state information)
 * from some data sources
 * data sources could be the on chain event, historical data or an open api
 */

import { AppContext } from '../types/context';
import { Task } from '../types/tasks';
import { createChildLogger } from '../utils/logger';
import { createDbIndexer } from './chain-db-indexer';
import { createChainTimeIndexer } from './chain-time-indexer';
import { createLatestIndexer } from './latest-indexer';

export async function createIndexingTasks(
  context: AppContext,
): Promise<Task[]> {
  const logger = createChildLogger({
    moduleId: 'indexing',
    modulePrefix: '✏️',
  });

  logger.info('creating indexing tasks');
  const timestampIndexer = await createChainTimeIndexer(context, logger);
  const dbIndexer = await createDbIndexer(context, logger);
  const latestIndexer = await createLatestIndexer(context, logger);
  return [timestampIndexer, dbIndexer, latestIndexer];
}
