import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { getTimestamp, toQuotedList } from '../utils';
import { IsStopped, makeIntervalTask } from './task-utils';
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
  _logger: Logger,
  _isStopped: IsStopped,
) {
  const { database } = context;

  const now = getTimestamp();
  const maxCreateTime = now - MaxFilePendingTime;
  const maxRetryTime = now - MinFileRetryInterval;

  await database.run(
    `update file_record set status = "failed"
    where status in (${toQuotedList(PendingStatus)})
    and create_at < ?`,
    [maxCreateTime],
  );

  await database.run(
    `update file_record set status = "new"
    where status in (${toQuotedList(RetryableStatus)})
    and last_updated < ?`,
    [maxRetryTime],
  );
}

export async function createFileRetryTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const fileRetryInterval = 30 * 60 * 1000; // 30 minutes
  return makeIntervalTask(
    fileRetryInterval,
    'files-retry',
    context,
    loggerParent,
    handleRetry,
  );
}
