import * as _ from 'lodash';

export interface Task {
  // The ipfs cid value
  cid: string;
  // Current block number
  bn: number;
}

/**
 * Queue interact with cache
 * Provides the management of pending tasks
 */
export class TaskQueue {
  private tasks: Task[];
  private readonly maxLength: number;
  private readonly maxDuration: number;

  constructor(ml: number, md: number) {
    this.tasks = new Array<Task>();
    this.maxLength = ml;
    this.maxDuration = md;
  }

  /**
   * Push an new task
   * @param nt: new task
   */
  push(nt: Task): boolean {
    if (this.tasks.length >= this.maxLength) return false;
    this.tasks.push(nt);
    return true;
  }

  /**
   * Pop the first task
   */
  pop(): Task | undefined {
    if (_.isEmpty(this.tasks)) return undefined;
    return this.tasks.shift();
  }

  /**
   * Clear the outdated tasks
   * @param cbn: current block number
   */
  clear(cbn: number) {
    this.tasks = this.tasks.filter(t => cbn - t.bn <= this.maxDuration);
  }
}
