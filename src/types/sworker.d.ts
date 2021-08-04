export interface SealInfo {
  sealed_size: number;
  used_time: string;
}

export type SealInfoMap = { [cid: string]: SealInfo };

export interface SrdInfo {
  srd_complete: number;
  disk_available: number;
  sys_disk_available: number;
}

export interface WorkloadInfo {
  srd: SrdInfo;
}
