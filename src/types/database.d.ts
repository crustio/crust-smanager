import { Dayjs } from 'dayjs';
import { FileInfo } from '../chain';
import { Indexer } from './indexing';

export interface SDatabase {
  getConfig: (name: string) => Promise<string | null>;
}

type FileStatus = 'pending' | 'failed' | 'handled' | 'expired';
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
  createCleanupRecord: (cid: string) => Promise<void>;
  deleteCleanupRecords: (cids: string[]) => Promise<void>;
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
}
