import axios from 'axios';
import _ from 'lodash';
import { Logger } from 'winston';
import SworkerApi from '../sworker';
import { AppContext } from '../types/context';
import { PinStatus } from '../types/database';
import { NormalizedConfig } from '../types/smanager-config';
import { EnclaveIdInfo, WorkloadInfo } from '../types/sworker';
import { SimpleTask } from '../types/tasks';
import {
  PinStats,
  QueueInfo,
  SManagerInfo,
  TelemetryData,
  SWorkerStats,
  OSInfo,
  FileStats,
} from '../types/telemetry';
import { formatError, getTimestamp, toQuotedList } from '../utils';
import { Dayjs } from '../utils/datetime';
import { PendingStatus } from './pull-utils';
import { makeIntervalTask } from './task-utils';
import os from 'os';
import osu from 'node-os-utils';

const ReportSlotDuration = Dayjs.duration({
  hours: 24,
}).asSeconds();

async function handleReport(context: AppContext, logger: Logger) {
  const telemetryUrl = context.config.telemetry.endPoint;
  if (_.isEmpty(telemetryUrl)) {
    logger.warn('telemetry endpoint not configured, skip report');
    return;
  }
  const stats = await collectStats(context, logger);
  if (stats.sworker) {
    logger.info('reporting stats to telemtry: %o', stats);
    try {
      const resp = await axios.post(telemetryUrl, stats, {
        timeout: 120 * 1000,
      });
      logger.info('telemetry response: %s', JSON.stringify(resp.data));
    } catch (ex) {
      logger.warn('telemetry report failed');
    }
  } else {
    logger.info('not report to telemetry, sworker is offline');
  }
}

async function collectStats(
  context: AppContext,
  logger: Logger,
): Promise<TelemetryData> {
  const { api, config, database, sworkerApi } = context;
  const account = api.getChainAccount();
  const smangerInfo = collectSManagerInfo(config, context);

  const timeStart = getTimestamp() - ReportSlotDuration;
  const queueStats = await collectQueueInfo(database);
  const fileStats = await collectFileStats(database);
  const pinStats = await getPinStats(database, timeStart);

  const { deletedCount } = await database.get(
    `select count(*) as deletedCount from cleanup_record
      where status = "done" and last_updated > ? `,
    [timeStart],
  );
  const workload = await getSworkerWorkload(sworkerApi, logger);
  const enclaveIdInfo = await getSworkerEnclaveIdInfo(sworkerApi, logger);
  let reportWL: SWorkerStats;
  if (workload) {
    reportWL = {
      id_info: enclaveIdInfo,
      srd: {
        srd_complete: workload.srd.srd_complete,
        srd_remaining_task: workload.srd.srd_remaining_task,
        disk_available_for_srd: workload.srd.disk_available_for_srd,
        disk_available: workload.srd.disk_available,
        disk_volume: workload.srd.disk_volume,
        sys_disk_available: workload.srd.sys_disk_available,
        srd_volumn_count: Object.keys(workload.srd.srd_detail).length,
      },
      files: workload.files,
    };
  } else {
    reportWL = null;
  }

  const osInfo = await collectOSInfo(logger);

  return {
    chainAccount: account,
    smangerInfo,
    pinStats,
    sworker: reportWL,
    groupInfo: context.groupInfo || {
      groupAccount: '',
      totalMembers: 0,
      nodeIndex: 0,
    },
    queueStats,
    fileStats,
    cleanupStats: {
      deletedCount,
    },
    hasSealCoordinator: !!context.sealCoordinator,
    osInfo
  };
}

async function getSworkerWorkload(
  sworkerApi: SworkerApi,
  logger: Logger,
): Promise<WorkloadInfo | null> {
  try {
    return await sworkerApi.workload();
  } catch (e) {
    logger.error('failed to load sworker workload: %s', formatError(e));
    return null;
  }
}

async function getSworkerEnclaveIdInfo(
  sworkerApi: SworkerApi,
  logger: Logger,
): Promise<EnclaveIdInfo | null> {
  try {
    return await sworkerApi.getEnclaveIdInfo();
  } catch (e) {
    logger.error('failed to get sworker enclave id_info: %s', formatError(e));
    return null;
  }
}

async function collectQueueInfo(database): Promise<QueueInfo> {
  const { pendingCount } = await database.get(
    `select count(*) as pendingCount from file_record
      where status in (${toQuotedList(PendingStatus)}) `,
  );
  const { pendingSize } = await database.get(
    `select sum(size) as pendingSize from file_record
      where status in (${toQuotedList(PendingStatus)}) `,
  );

  return {
    pendingCount,
    pendingSizeTotal: pendingSize || 0,
  };
}

async function collectFileStats(database): Promise<FileStats> {
  const { totalCount } = await database.get(
    `select count(*) as totalCount from file_record`,
  );
  const countByStatusResults = await database.get(
    `select status, count(1) from file_record group by status`,
  );

  const fileStats = {
    totalCount
  };

  for (const { status, count } of countByStatusResults) {
    fileStats[status] = count;
  }

  return fileStats;
}

function collectSManagerInfo(
  config: NormalizedConfig,
  context: AppContext,
): SManagerInfo {
  const schedulerConfig = config.scheduler;
  const version = process.env.npm_package_version || 'unknown';
  const uptime = Dayjs.duration(Dayjs().diff(context.startTime)).asSeconds();
  return {
    version,
    uptime,
    schedulerConfig,
  };
}

async function getPinStats(database, timeStart: number): Promise<PinStats> {
  const getPinRecordCountByStatus = async (status: PinStatus) => {
    return database.get(
      `select count(*) as count from pin_record where status = ? and last_updated > ?`,
      [status, timeStart],
    );
  };
  const { count: sealedCount } = await getPinRecordCountByStatus('sealed');
  const { count: failedCount } = await getPinRecordCountByStatus('failed');
  const { count: sealingCount } = await getPinRecordCountByStatus('sealing');
  const { sizeTotal } = await database.get(
    `select sum(size) as sizeTotal from pin_record
      where status = ? and last_updated > ?`,
    ['sealed', timeStart],
  );
  return {
    sealingCount,
    sealedCount,
    failedCount,
    sealedSize: sizeTotal || 0,
  };
}


async function collectOSInfo(logger: Logger): Promise<OSInfo> {
  
  try {
    const kernel = os.release();
    const uptime = os.uptime();
    const cpuModel = osu.cpu.model();
    const cpuCount = osu.cpu.count();
    const memInfo = await osu.mem.info();

    return {
      kernel,
      uptime,
      cpuInfo: {
        cpuModel,
        cpuCount,
      },
      memInfo
    }
  }catch(err){
    logger.error(`failed to collect os info: ${err}`);
  }

  return null;
}

export async function createTelemetryReportTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const reportInterval = Dayjs.duration({
    hours: 1,
  }).asMilliseconds();
  return makeIntervalTask(
    300 * 1000,
    reportInterval,
    'telemetry-report',
    context,
    loggerParent,
    handleReport,
  );
}
