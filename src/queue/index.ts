import * as _ from 'lodash';
import {logger} from '../log';

export interface BT {
  // Block number
  bn: number;
}

/**
 * Queue interact with cache
 * Provides the management of pending tasks
 */
export default class TaskQueue<T extends BT> {
  private _tasks: T[];
  private readonly maxLength: number; // queue length
  private readonly maxDuration: number; // task outdated time

  constructor(ml: number, md: number) {
    this._tasks = new Array<T>();
    this.maxLength = ml;
    this.maxDuration = md;
  }

  set tasks(ts: T[]) {
    this._tasks = ts;
  }

  get tasks(): T[] {
    return this._tasks;
  }

  /**
   * Push an new task
   * @param nt: new task
   */
  push(nt: T): boolean {
    if (this.tasks.length >= this.maxLength) return false;
    this.tasks.push(nt);
    return true;
  }

  /**
   * Pop the first task
   */
  pop(): T | undefined {
    if (_.isEmpty(this.tasks)) return undefined;
    return this.tasks.shift();
  }

  /**
   * Clear queue
   * @param cbn Current block number
   */
  clear(cbn: number) {
    this.tasks = this.tasks.filter(t => {
      if (cbn - t.bn > this.maxDuration) {
        logger.info(`🗑  Clear outdated task: ${JSON.stringify(t)}`);
        return false;
      }
      return true;
    });
  }
}
