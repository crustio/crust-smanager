import { GroupInfo } from './context';
import { NormalizedSchedulerConfig } from './smanager-config';

export interface TelemetryData {
  chainAccount: string;
  smangerInfo: SMangerInfo;
  pinStats: PinStats;
  sworker: SWorkerStats | null;
  queueStats: QueueInfo;
  fileStats: FileStats;
  cleanupStats: CleanupStats;
  groupInfo: GroupInfo;
  hasSealCoordinator: boolean;
  osInfo: OSInfo | null;
}

export interface SWorkerStats {
  id_info: {
    account: string;
    attestation_mode: string | null;
    mrenclave: string;
    pub_key: string;
    sworker_version: string;
    version: string;
  };
  files: {
    lost: {
      num: number;
      size: number;
    };
    pending: {
      num: number;
      size: number;
    };
    valid: {
      num: number;
      size: number;
    };
  };
  srd: {
    srd_complete: number;
    srd_remaining_task: number;
    disk_available_for_srd: number;
    disk_available: number;
    disk_volume: number;
    sys_disk_available: number;
    srd_volumn_count: number;
  };
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

export interface FileStats {
  totalCount: number;
  [status: string]: number;
}

export interface PinStats {
  sealingCount: number;
  failedCount: number;
  sealedCount: number;
  sealedSize: number; // in MB
}

export interface CleanupStats {
  deletedCount: number;
}

export interface OSInfo {
  kernel: string;
  uptime: number;
  cpuInfo: {
    cpuModel: string;
    cpuCount: number;
  };
  memInfo: {
    totalMemMb: number;
    usedMemMb: number;
    freeMemMb: number;
    usedMemPercentage: number;
    freeMemPercentage: number;
  };
}