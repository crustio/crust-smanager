import dayjs, { Dayjs } from 'dayjs';
import _ from 'lodash';
import { Database } from 'sqlite';
import { ConfigOperator, DbResult, DbWriteResult } from '../types/database';
import { logger } from '../utils/logger';

export function createConfigOps(db: Database): ConfigOperator {
  const readString = async (name: string): DbResult<string> => {
    const v = await db.get(
      'select content from config where name = ? limit 1',
      [name],
    );

    if (v === null || v === undefined) {
      return null;
    }
    return v.content;
  };

  const saveString = async (name: string, v: string): DbWriteResult => {
    await db.run(
      'insert or replace into config (name, content) values (?, ?)',
      [name, v],
    );
  };

  const readInt = async (name: string): DbResult<number> => {
    const n = await readString(name);
    if (n !== null) {
      return _.parseInt(n);
    }
    return null;
  };
  const saveInt = async (name: string, v: number): DbWriteResult => {
    await saveString(name, `${v}`);
  };

  const readTime = async (name: string): DbResult<Dayjs> => {
    const v = await readInt(name);
    if (v != null) {
      const d = dayjs.unix(v);
      if (d.isValid()) {
        return d;
      }
      return null;
    }
    return null;
  };
  const saveTime = async (name: string, d: Dayjs): DbWriteResult => {
    if (!d.isValid()) {
      throw new Error('invalid date!');
    }
    const v = d.unix();
    await saveInt(name, v);
  };
  const readJson = async (name: string): DbResult<unknown> => {
    const v = await readString(name);
    if (v) {
      try {
        return JSON.parse(v);
      } catch (e) {
        logger.warn('read invalid json from config by name: %s', name);
      }
    }
    return null;
  };
  const saveJson = async (name: string, v: unknown): DbWriteResult => {
    await saveString(name, JSON.stringify(v));
  };
  return {
    readString,
    saveString,
    readInt,
    saveInt,
    readTime,
    saveTime,
    readJson,
    saveJson,
  };
}
