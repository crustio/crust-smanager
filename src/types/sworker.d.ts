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

export type SealedType = 'valid' | 'lost' | 'pending';

export interface SealInfoData {
  type: SealedType;
}
export interface SealedInfo extends SealInfoData {
  type: 'valid';
  c_block_num: number;
  s_size: number;
  size: number;
}

export interface SealingInfo extends SealInfoData {
  type: 'pending';
  used_type: string;
  sealed_size: number;
}
export interface LostSealInfo extends SealInfoData {
  type: 'lost';
  c_block_num: number;
  s_size: number;
}

export type SealInfoResp = SealedInfo | SealingInfo | LostSealInfo;

export type QuerySealInfoResult = { [cid: string]: SealInfoResp };