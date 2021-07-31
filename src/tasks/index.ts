import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { createChildLogger } from '../utils/logger';
import { createFileCleanupTask } from './file-cleanup-task';
import { createIpfsGcTask } from './ipfs-gc-task';

/**
 * create simpile tasks which only handle start/stop
 */
export async function createSimpleTasks(
  context: AppContext,
): Promise<SimpleTask[]> {
  const logger = createChildLogger({ moduleId: 'simple-tasks' });
  const ipfsGcTask = await createIpfsGcTask(context, logger);
  const filesCleanupTask = await createFileCleanupTask(context, logger);
  return [ipfsGcTask, filesCleanupTask];
}
