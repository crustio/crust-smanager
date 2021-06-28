import * as _ from 'lodash';
import {logger} from '../log';

export interface BT {
  // Block number
  bn: number;
}

export interface Task extends BT {
  // The ipfs cid value
  cid: string;
  // Object size
  size: number;
  // Price
  price: number;
  // Pass probability filter
  passPf: boolean;
}

/**
 * Queue interact with cache
 * Provides the management of pending tasks
 */
export default class TaskQueue {
  private _tasks: Task[];
  private readonly maxLength: number; // queue length
  private readonly maxDuration: number; // task outdated time

  constructor(ml: number, md: number) {
    this._tasks = new Array<Task>();
    this.maxLength = ml;
    this.maxDuration = md;
  }

  set tasks(ts: Task[]) {
    this._tasks = ts;
  }

  get tasks(): Task[] {
    return this._tasks;
  }

  /**
   * Sort tasks
   */
  sort() {
    this.tasks.sort((a: Task, b: Task) => b.price - a.price);
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

export class IPFSQueue {
  readonly filesMaxSize: number[]; // The max size of different files
  readonly filesQueueLimit: number[]; // The queue limit of different files
  currentFilesQueueLen: number[]; // The current queue length of different files
  allFileSize: number; // The total size of files

  constructor(fms: number[], fql: number[]) {
    this.filesMaxSize = fms;
    this.filesQueueLimit = fql;
    this.currentFilesQueueLen = [];
    for (let index = 0; index < this.filesQueueLimit.length; index++) {
      this.currentFilesQueueLen.push(0);
    }
    this.allFileSize = 0;
  }

  private findIndex(size: number): number {
    let index = 0;
    for (; index < this.filesMaxSize.length; index++) {
      if (size <= this.filesMaxSize[index]) {
        break;
      }
    }
    return index;
  }

  push(size: number): boolean {
    const index = this.findIndex(size);
    if (this.currentFilesQueueLen[index] < this.filesQueueLimit[index]) {
      this.currentFilesQueueLen[index]++;
      this.allFileSize += size;
      return true;
    }
    return false;
  }

  pop(size: number) {
    const index = this.findIndex(size);
    if (this.currentFilesQueueLen[index] > 0) {
      this.currentFilesQueueLen[index]--;
    } else if (this.currentFilesQueueLen[index] === 0) {
      return;
    } else {
      this.currentFilesQueueLen[index] = 0;
    }
  }

  popSize(size: number) {
    this.allFileSize -= size;
    if (this.allFileSize < 0) {
      this.allFileSize = 0;
    }
  }
}
