import BigNumber from 'bignumber.js';

export interface BlockInfo {
  block: number;
  hash: string;
}

export interface ChainFileInfo {
  file_size: number;
  expired_at: number;
  amount: BigNumber;
  reported_replica_count: number;
}
