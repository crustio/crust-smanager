import Bluebird from 'bluebird';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { createChildLogger } from '../utils/logger';
import { createFileCleanupTask } from './file-cleanup-task';
import { createFileRetryTask } from './file-retry-task';
import { createGroupInfoUpdateTask } from './group-info-updater-task';
import { createIpfsGcTask } from './ipfs-gc-task';
import { createPullSchedulerTask } from './pull-scheduler-task';
import { createSealStatuUpdater } from './seal-status-updater-task';
import { createTelemetryReportTask } from './telemetry-task';

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
    createFileRetryTask,
    createTelemetryReportTask,
    createGroupInfoUpdateTask,
  ];
  return Bluebird.mapSeries(tasks, (t) => {
    return t(context, logger);
  });
}
