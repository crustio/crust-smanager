import Bluebird from 'bluebird';
import _ from 'lodash';
import { Database } from 'sqlite';
import { FileInfo } from '../chain';
import {
  CleanupStatus,
  DbOrderOperator,
  DbResult,
  DbWriteResult,
  FileCleanupRecord,
  FileOwnerRecord,
  FileRecord,
  FileStatus,
} from '../types/database';
import { Indexer } from '../types/indexing';
import { getTimestamp } from '../utils';
import { logger } from '../utils/logger';

export function createFileOrderOperator(db: Database): DbOrderOperator {
  const getFileInfos = async (
    cids: string[],
    indexer: string,
  ): Promise<FileRecord[]> => {
    const records = await db.all(
      'select id, cid, expire_at, size, amount, replicas, indexer, status, last_updated, create_at from file_record where cid in (?) and indexer = ? limit 1',
      [cids, indexer],
    );
    return records;
  };

  const addFileRecord = async (info: FileInfo, indexer: Indexer) => {
    await db.run(
      'insert into file_record ' +
        '(`cid`, `expire_at`, `size`, `amount`, `replicas`, `indexer`, `status`, `last_updated`, `create_at`)' +
        ' values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        info.cid,
        info.expiredAt,
        info.size,
        info.tips,
        info.replicas,
        indexer,
        'new',
        getTimestamp(),
        getTimestamp(),
      ],
    );
  };

  const updateFileInfoStatus = async (
    id: number,
    status: FileStatus,
  ): Promise<DbWriteResult> => {
    await db.run(
      `update file_record set status = ?, last_updated = ?
          where id = ? `,
      [status, getTimestamp(), id],
    );
  };

  const updateFileTips = async (id: number, info: FileInfo) => {
    await db.run(
      'update file_record set amount = ?, last_updated = ? where id = ?',
      [info.tips, getTimestamp(), id],
    );
  };

  const deleteCleanupRecords = async (cids: string[]): Promise<void> => {
    await db.run(`delete from cleanup_record where cid in (?)`, [cids]);
  };

  const createCleanupRecord = async (cid: string): Promise<void> => {
    await db.run(
      'insert into cleanup_record (`cid`, `status`, `last_updated`, `create_at`) values (?, ?, ?, ?)',
      [cid, 'pending', getTimestamp(), getTimestamp()],
    );
  };

  const getOwnerRecordByCid = async (
    cid: string,
    owner: string,
  ): Promise<FileOwnerRecord> => {
    return db.get(
      'select * from file_owner where owner = ? and cid  = ? limit 1',
      [owner, cid],
    );
  };

  const insertOwnerRecord = async (
    cid: string,
    owner: string,
  ): Promise<void> => {
    await db.run(
      'insert into file_owner (`cid`, `owner`, `create_at`) values (?, ?, ?)',
      [cid, owner, getTimestamp()],
    );
  };

  const addFiles = async (
    files: FileInfo[],
    indexer: Indexer,
  ): Promise<{ newFiles: number; updated: number }> => {
    const existingInfos = await getFileInfos(
      _.map(files, (f) => f.cid),
      indexer,
    );
    const existingMap = _.keyBy(existingInfos, (i) => i.cid);
    const [existingFiles, newFiles] = _.partition(files, (f) => {
      return _.has(existingMap, f.cid);
    });
    logger.info(
      'adding %d new files, updating %d existing files',
      newFiles.length,
      existingFiles.length,
    );
    await Bluebird.mapSeries(newFiles, (f) => addFileRecord(f, indexer));

    await Bluebird.mapSeries(existingFiles, (f) =>
      updateFileTips(existingMap[f.cid].id, f),
    );
    // delete cleanup records for new files
    const cids = _.map(files, (f) => f.cid);
    await deleteCleanupRecords(cids);
    const allFiles = _.concat(newFiles, existingFiles);
    await Bluebird.mapSeries(allFiles, async (f) => {
      if (!f.owner) {
        return;
      }
      const record = await getOwnerRecordByCid(f.cid, f.owner);
      if (record) {
        // already have the file/owner record
        return;
      }
      logger.debug(
        'creating owner relationships with owner: %s, cid: %s',
        f.owner,
        f.cid,
      );
      await insertOwnerRecord(f.cid, f.owner);
    });
    return {
      newFiles: newFiles.length,
      updated: existingFiles.length,
    };
  };

  const getPendingCleanupRecords = async (
    count: number,
  ): Promise<FileCleanupRecord[]> => {
    return db.all(
      `select id, cid, status, last_updated, create_at from cleanup_record where status = "pending" order by id desc limit ${count}`,
    );
  };

  const updateCleanupRecordStatus = async (
    id: number,
    status: CleanupStatus,
  ) => {
    await db.run(
      'update cleanup_record set status = ?, last_updated = ? where id = ?',
      [status, getTimestamp(), id],
    );
  };

  const getPendingFileRecord = async (
    indexer: Indexer | null,
  ): DbResult<FileRecord> => {
    if (indexer === null) {
      return db.get(
        `select id, cid, expire_at, size, amount, replicas,
         indexer, status, last_updated, create_at
         from file_record where status = "new" order by id desc limit 1`,
      );
    }
    return db.get(
      `select id, cid, expire_at, size, amount, replicas,
      indexer, status, last_updated, create_at
      from file_record  where indexer = ?  and status = "new" order by id desc limit 1`,
      [indexer],
    );
  };

  return {
    addFiles,
    getFileInfo: async (cid, indexer) => {
      const record = await db.get(
        'select id, cid, expired_at, size, amount, replicas, indexer, status, last_updated, create_at from file_record where cid = ? and indexer = ? limit 1',
        [cid, indexer],
      );
      return record || null;
    },
    getFileInfos,
    updateFileInfoStatus,
    createCleanupRecord,
    deleteCleanupRecords,
    getPendingCleanupRecords,
    updateCleanupRecordStatus,
    getPendingFileRecord,
  };
}
