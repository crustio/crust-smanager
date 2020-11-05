import * as _ from 'lodash';

export interface BT {
  // Block number
  bn: number;
}

/**
 * Queue interact with cache
 * Provides the management of pending tasks
 */
export default class TaskQueue<T extends BT> {
  private tasks: T[];
  private readonly maxLength: number;
  private readonly maxDuration: number;

  constructor(ml: number, md: number) {
    this.tasks = new Array<T>();
    this.maxLength = ml;
    this.maxDuration = md;
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
   * Clear tasks by `f` condition
   * @param f: filter handler
   */
  clear(cbn: number) {
    this.tasks = this.tasks.filter(t => cbn - t.bn <= this.maxDuration);
  }
}
