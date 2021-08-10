import { NormalizedSchedulerConfig } from './smanager-config';
import { SrdInfo, WorkloadInfo } from './sworker';

export interface TelemetryData {
  chainAccount: string;
  smangerInfo: SMangerInfo;
  pinStats: PinStats;
  sworker: SrdStats;
  queueStats: QueueInfo;
  cleanupStats: CleanupStats;
}

export interface SManagerInfo {
  version: string;
  uptime: number; // uptime in seconds
  schedulerConfig: NormalizedSchedulerConfig;
}

export interface QueueInfo {
  pendingCount: number;
  pendingSizeTotal: number; // in MB
}

export interface PinStats {
  sealingCount: number;
  failedCount: number;
  sealedCount: number;
  sealedSize: number; // in MB
}

export interface SrdStats {
  workload: WorkloadInfo | null;
}

export interface CleanupStats {
  deletedCount: number;
}
