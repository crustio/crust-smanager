import { Database } from 'sqlite';
import {
  DbResult,
  DbWriteResult,
  PinRecord,
  PinRecordOperator,
  PinStatus,
} from '../types/database';
import { PullingStrategy } from '../types/smanager-config';
import { getTimestamp } from '../utils';

export function createPinRecordOperator(db: Database): PinRecordOperator {
  const getSealingInfo = async (): DbResult<[number, number]> => {
    const { count } = await db.get(
      'select count(*) as count from pin_record where status = "sealing"',
    );
    const { totalSize } = await db.get(
      'select sum(`size`) as totalSize from pin_record where status = "sealing"',
    );
    return [count, totalSize || 0];
  };
  const getSealingRecords = async (): DbResult<PinRecord[]> => {
    // get all sealing one time
    return db.all(
      'select id, cid, size, status, pin_at, last_updated, pin_by, sealed_size, last_check_time from pin_record where status = "sealing"',
    );
  };
  const addPinRecord = async (
    cid: string,
    size: number,
    pinBy: PullingStrategy,
  ): DbWriteResult => {
    await db.run(
      'insert into pin_record ' +
        '(`cid`, `size`, `status`, `pin_at`, `last_updated`, `pin_by`) ' +
        ' values(?, ?, ?, ?, ?, ?)',
      [cid, size, 'sealing', getTimestamp(), getTimestamp(), pinBy],
    );
  };
  const getPinRecordsByCid = async (cid: string): DbResult<PinRecord[]> => {
    const result = await db.all(
      'select id, cid, size, status, pin_at, last_updated, pin_by, sealed_size, last_check_time from pin_record where cid = ? ',
      [cid],
    );
    return result;
  };
  const updatePinRecordStatus = async (
    id: number,
    status: PinStatus,
  ): DbWriteResult => {
    await db.run(
      'update pin_record set status = ?, last_updated = ? where id = ? ',
      [status, getTimestamp(), id],
    );
  };
  const updatePinRecordSealStatus = async (
    id: number,
    sealedSize,
    status: PinStatus,
  ): DbWriteResult => {
    await db.run(
      'update pin_record set status = ?, sealed_size = ?, last_updated = ?, last_check_time = ? where id = ? ',
      [status, sealedSize, getTimestamp(), getTimestamp(), id],
    );
  };

  return {
    getSealingInfo,
    getSealingRecords,
    addPinRecord,
    getPinRecordsByCid,
    updatePinRecordStatus,
    updatePinRecordSealStatus,
  };
}
