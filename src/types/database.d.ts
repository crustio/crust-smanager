import { Dayjs } from 'dayjs';
import { FileInfo } from '../chain';
import { Indexer } from './indexing';
import { PullingStrategy } from './smanager-config';

export interface SDatabase {
  getConfig: (name: string) => Promise<string | null>;
}

type FileStatus =
  | 'new'
  | 'pending_replica'
  | 'insufficient_space'
  | 'invalid'
  | 'failed'
  | 'skipped'
  | 'handled'
  | 'expired';
type CleanupStatus = 'pending' | 'failed' | 'done';

export interface FileRecord {
  id: number;
  cid: string;
  expire_at: number;
  size: number;
  amount: number;
  replicas: number;
  indexer: Indexer;
  status: FileStatus;
  last_updated: number;
  create_at: number;
}

export interface FileOwnerRecord {
  id: number;
  cid: string;
  owner: string;
  create_at: number;
}

export interface FileCleanupRecord {
  id: number;
  cid: string;
  status: CleanupStatus;
  last_udpated: number;
  create_at: number;
}

export interface DbOrderOperator {
  addFiles: (
    files: FileInfo[],
    indexer: Indexer,
  ) => Promise<{ newFiles: number; updated: number }>;
  getFileInfo: (cid: string, indexer: Indexer) => Promise<FileRecord | null>;
  getFileInfos: (cids: string[], indexer: Indexer) => Promise<FileRecord[]>;
  updateFileInfoStatus: (
    id: number,
    status: FileStatus,
  ) => Promise<DbWriteResult>;
  createCleanupRecord: (cid: string) => Promise<void>;
  getPendingCleanupRecords: (count: number) => Promise<FileCleanupRecord[]>;
  deleteCleanupRecords: (cids: string[]) => Promise<void>;
  updateCleanupRecordStatus: (
    id: number,
    status: CleanupStatus,
  ) => Promise<void>;
  getPendingFileRecord: (
    indexer: Indexer | null,
    smallFile: boolean,
  ) => DbResult<FileRecord>;
}

type DbResult<T> = Promise<T | null>;
type DbWriteResult = Promise<void>;
export interface ConfigOperator {
  readString: (name: string) => DbResult<string>;
  saveString: (name: string, v: string) => DbWriteResult;
  readInt: (name: string) => DbResult<number>;
  saveInt: (name: string, v: number) => DbWriteResult;
  readTime: (name: string) => DbResult<Dayjs>;
  saveTime: (name: string, v: Dayjs) => DbWriteResult;
  readJson: (name: string) => DbResult<unknown>;
  saveJson: (name: string, v: unknown) => DbWriteResult;
}

export interface LatestBlockTime {
  block: number;
  time: number;
}

type PinStatus = 'sealing' | 'failed' | 'sealed';
export interface PinRecord {
  id: number;
  cid: string;
  size: number;
  status: PinStatus;
  last_updated: number;
  pin_at: number;
  pin_by: PullingStrategy;
  sealed_size: number;
  last_check_time: number;
}

export interface PinRecordOperator {
  getSealingInfo: () => DbResult<[number, number]>;
  addPinRecord: (
    cid: string,
    size: number,
    pinBy: PullingStrategy,
  ) => DbWriteResult;
  getSealingRecords: () => DbResult<PinRecord[]>;
  getPinRecordsByCid: (cid: string) => DbResult<PinRecord[]>;
  updatePinRecordStatus: (id: number, statu: PinStatus) => DbWriteResult;
  updatePinRecordSealStatus: (
    id: number,
    sealedSize,
    status: PinStatus,
  ) => DbWriteResult;
}
