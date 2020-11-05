import * as _ from 'lodash';

/**
 * Queue interact with cache
 * Provides the management of pending tasks
 */
export class TaskQueue<T> {
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
  pop(): T | null {
    if (_.isEmpty(this.tasks)) return null;
    return this.tasks.shift();
  }

  /**
   * Clear the outdated tasks
   * @param f: filter handler
   */
  clear(f: (t: T) => boolean) {
    this.tasks = this.tasks.filter(t => f(t));
  }
}
