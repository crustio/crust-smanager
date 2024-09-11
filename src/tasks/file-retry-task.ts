import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { getTimestamp, toQuotedList } from '../utils';
import { makeIntervalTask } from './task-utils';
import { Dayjs } from '../utils/datetime';
import { PendingStatus, RetryableStatus } from './pull-utils';

const MaxFilePendingTime = Dayjs.duration({
  months: 1,
}).asSeconds();

const MinFileRetryInterval = Dayjs.duration({
  minutes: 30,
}).asSeconds();

async function handleRetry(
  context: AppContext,
  logger: Logger,
  ) {
  const { database } = context;

  const now = getTimestamp();
  const maxCreateTime = now - MaxFilePendingTime;
  const maxRetryTime = now - MinFileRetryInterval;

  const failedResult = await database.run(
    `update file_record set status = "failed"
    where status in (${toQuotedList(PendingStatus)})
    and last_updated < ?`, // Should use last_updated instead of create_at, since replay old order will only update last_updated
    [maxCreateTime],
  );

  const retryableResult = await database.run(
    `update file_record set status = "new"
    where status in (${toQuotedList(RetryableStatus)})
    and last_updated < ?`,
    [maxRetryTime],
  );

  // Retry seal failed records
  const sealFailedRetryInterval = Dayjs.duration({
    hours: context.config.scheduler.sealFailedRetryInterval,
  }).asSeconds();
  const maxPinFailedRetryTime = now - sealFailedRetryInterval;
  
  const sealFailedRetryResult = await database.run(
    `update file_record 
     set status = "new",
         retry_count = COALESCE(retry_count, 0) + 1
    where status = 'sealFailedRetry' 
          and last_updated < ?`,
    [maxPinFailedRetryTime],
  );

  logger.info(`Handle Retry: Mark failed - ${failedResult.changes}; Normal Retry - ${retryableResult.changes}; Seal Failed Retry - ${sealFailedRetryResult.changes}`);
}

export async function createFileRetryTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const fileRetryInterval = 30 * 60 * 1000; // 30 minutes
  return makeIntervalTask(
    10 * 60 * 1000,
    fileRetryInterval,
    'files-retry',
    context,
    loggerParent,
    handleRetry,
  );
}
