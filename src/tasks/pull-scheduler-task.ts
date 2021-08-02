import Bluebird from 'bluebird';
import _ from 'lodash';
import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { makeRandomSelection } from '../utils/weighted-selection';
import { IsStopped, makeIntervalTask } from './task-utils';

async function handlePulling(
  context: AppContext,
  logger: Logger,
  isStopped: IsStopped,
): Promise<void> {
  const strategySelection = makeStrategySelection(context);
  logger.info('files pulling started');
  do {
    const strategy = strategySelection();
    logger.info('pull file using strategy: %s', strategy);
    await Bluebird.delay(2 * 1000);
  } while (!isStopped());
  logger.info('files pulling completed');
}

function makeStrategySelection(context: AppContext) {
  const strategey = context.config.scheduler.strategy;
  const weights = _.map(strategey, (weight, key) => {
    return {
      weight,
      value: key,
    };
  });
  return makeRandomSelection(weights);
}
export async function createPullSchedulerTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const pullingInterval = 60 * 1000; // trival, period run it if there is file in the db

  return makeIntervalTask(
    pullingInterval,
    'files-pulling',
    context,
    loggerParent,
    handlePulling,
  );
}
