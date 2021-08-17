import Bluebird from 'bluebird';
import _ from 'lodash';
import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { SLOT_LENGTH } from '../utils/consts';
import { Dayjs } from '../utils/datetime';
import { IsStopped, makeIntervalTask } from './task-utils';

// the storage key for 'swork->workReport'
const WorkReportKey =
  '0x2e3b7ab5757e6bbf28d3df3b5e01d6b9b7e949778e4650a54fcc65ad1f1ba39f';

async function handleUpdate(
  context: AppContext,
  logger: Logger,
  _isStopped: IsStopped,
) {
  const { api } = context;
  try {
    let lastKey = null;
    let totalCount = 0;
    // eslint-disable-next-line
    while (true) {
      const keys = await (lastKey
        ? api.chainApi().rpc.state.getKeysPaged(WorkReportKey, 100, lastKey)
        : api.chainApi().rpc.state.getKeysPaged(WorkReportKey, 100));

      const currentSlot = await api.currentReportSlot();

      const validKeys = _.chain(keys)
        .map((k) => k.toString())
        .map(extractReportAnchorFromKey)
        .filter()
        .value();
      const workReports = await Bluebird.mapSeries(validKeys, async (k) => {
        // logger.info('loading workreport for key: %s', k);
        return api.chainApi().query.swork.workReports(k);
      });
      const validReports = _.filter(workReports, (r) => {
        if (!r) {
          return false;
        }
        const report = r.toJSON() as any; // eslint-disable-line
        if (!report) {
          logger.error('invalid workreport loaded');
          return false;
        }
        return report.report_slot >= currentSlot - SLOT_LENGTH;
      });
      logger.info('load %d valid work reports', _.size(validReports));
      totalCount += _.size(validReports);
      // wait for a short while to reduce system load
      await Bluebird.delay(100);
      if (_.isEmpty(keys)) {
        break;
      }
      lastKey = _.last(keys);
    }

    logger.info('node count updated to: %d', totalCount);
    context.nodeInfo = {
      nodeCount: totalCount,
    };
  } catch (e) {
    logger.error(
      'failed updating node info: %s',
      (e as Error).stack || JSON.stringify(e),
    );
  }
}

function extractReportAnchorFromKey(k: string): string | null {
  if (!k.startsWith(WorkReportKey)) {
    return null;
  }
  return '0x' + k.substr(WorkReportKey.length + 20);
}

export async function createNodeInfoUpdateTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  // update node count every 5 hours
  // note: it's slow
  const updateInterval = Dayjs.duration({
    hours: 5,
  }).asMilliseconds();

  return makeIntervalTask(
    5 * 1000,
    updateInterval,
    'node-info',
    context,
    loggerParent,
    handleUpdate,
  );
}
