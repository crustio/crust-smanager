import Bluebird from 'bluebird';
import _ from 'lodash';
import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { formatError } from '../utils';
import { SLOT_LENGTH } from '../utils/consts';
import { makeIntervalTask } from './task-utils';

// the storage key for 'swork->workReport'
const WorkReportKey =
  '0x2e3b7ab5757e6bbf28d3df3b5e01d6b9b7e949778e4650a54fcc65ad1f1ba39f';

export const ValidNodeAnchors = new Set();

async function handleUpdate(context: AppContext, logger: Logger) {
  const { api } = context;
  try {
    let lastKey = null;
    let totalCount = 0;
    const tempValidNodeAnchors = new Set();
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

      // Get work reports from chain in multi mode
      const queries = [];
      for (const anchor of validKeys) {
        const query = [api.chainApi().query.swork.workReports, anchor];
        queries.push(query);
      }
      const workReports = await api.chainApi().queryMulti(queries);

      // Filter out valid reports
      const validReports = [];
      for (let i = 0; i < validKeys.length; i++) {
        const anchor = validKeys[i];
        const reportCodec = workReports[i];
        if (!_.isNil(reportCodec) && !reportCodec.isEmpty) {
          const report = reportCodec.toJSON() as any;
          if (!_.isNil(report)) {
            if (report.report_slot >= currentSlot - SLOT_LENGTH) {
              validReports.push(report);
              tempValidNodeAnchors.add(anchor);
            }
          } else {
            logger.error('invalid workreport loaded');
          }
        }
      }

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
    // Update the global ValidNodeAnchors data which will be used by group-info-updater-task
    ValidNodeAnchors.clear();
    tempValidNodeAnchors.forEach(anchor => ValidNodeAnchors.add(anchor));
  } catch (e) {
    logger.error('failed updating node info: %s', formatError(e));
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
  // After we change to use batch mode, the time cost to retrieve all work reports from chain 
  // has been reduced from ~100 minutes to ~5 minutes, so we can shorten the updateInterval 
  // update group info every 30 minutes
  const updateInterval = 30 * 60 * 1000; 

  return makeIntervalTask(
    5 * 1000,
    updateInterval,
    'node-info',
    context,
    loggerParent,
    handleUpdate,
  );
}
