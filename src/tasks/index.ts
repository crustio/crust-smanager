import Bluebird from 'bluebird';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { createChildLogger } from '../utils/logger';
import { createFileCleanupTask } from './file-cleanup-task';
import { createIpfsGcTask } from './ipfs-gc-task';
import { createPullSchedulerTask } from './pull-scheduler-task';
import { createSealStatuUpdater } from './seal-status-updater-task';

/**
 * create simpile tasks which only handle start/stop
 */
export async function createSimpleTasks(
  context: AppContext,
): Promise<SimpleTask[]> {
  const logger = createChildLogger({ moduleId: 'simple-tasks' });
  const tasks = [
    createIpfsGcTask,
    createFileCleanupTask,
    createPullSchedulerTask,
    createSealStatuUpdater,
  ];
  return Bluebird.mapSeries(tasks, (t) => {
    return t(context, logger);
  });
}
