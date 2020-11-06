// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';
import * as _ from 'lodash';
import TaskQueue, {BT} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {StorageOrder} from '../chain';
import * as cron from 'node-cron';

export interface Task extends BT {
  // The ipfs cid value
  cid: string;
  // Object size
  size: number;
}

export class DecisionEngine {
  private readonly crustApi: CrustApi;
  private readonly ipfsApi: IpfsApi;
  private pendingQueue: TaskQueue<Task>;
  private pullingQueue: TaskQueue<Task>;

  constructor(chainAddr: string, ipfsAddr: string, mto: number) {
    this.crustApi = new CrustApi(chainAddr);
    this.ipfsApi = new IpfsApi(ipfsAddr, mto);

    // MaxQueueLength is 50 and Overdue is 600 blocks(1h)
    this.pendingQueue = new TaskQueue<Task>(50, 600);
    this.pullingQueue = new TaskQueue<Task>(30, 600);
  }

  /**
   * @returns stop adding to pending queue signal
   * @throws crust api error
   */
  async subscribePendings() {
    const addPendings = async (b: Header) => {
      const bn = b.number.toNumber();
      const newSorder: StorageOrder | null = await this.crustApi.maybeGetNewSorder(
        bn
      );
      if (newSorder) {
        const nt: Task = {
          cid: newSorder.file_identifier,
          bn: bn,
          size: _.parseInt(newSorder.file_size, 10),
        };

        // Always push into pending queue
        this.pendingQueue.push(nt);
      }
    };

    const unsubscribe = await this.crustApi.subscribeNewHeads(addPendings);

    return unsubscribe;
  }

  async subscribePullings(): Promise<cron.ScheduledTask> {
    return cron.schedule('* * * * *', async () => {
      // 1. Loop and pop all pendings
      const oldPts: Task[] = this.pendingQueue.tasks;
      const newPts = new Array<Task>();
      for (const pt of oldPts) {
        // 2. If join pullings and start puling in ipfs, otherwise push back to pending tasks
        if (await this.pickOrDropPending(pt.cid, pt.size)) {
          this.pullingQueue.push(pt);
        } else {
          newPts.push(pt);
        }
      }
      // 3. Set back to pending queue
      this.pendingQueue.tasks = newPts;
    });
  }

  async subscribeSealings(): Promise<cron.ScheduledTask> {
    return cron.schedule('* * * * *', async () => {
      // 1. Loop pulling tasks
      const oldPts: Task[] = this.pullingQueue.tasks;
      const newPts = new Array<Task>();
      for (const pt of oldPts) {
        // 2. Judge if pulling successful, otherwise push back to pulling tasks
        if (await this.pickOrDropPulling(pt.cid, pt.size)) {
          // TODO: Call `sWorker.seal(pt.cid)` here
          console.log('Send to sWorker to seal');
        } else {
          newPts.push(pt);
        }
      }
      // 3. Set back to pulling queue
      this.pullingQueue.tasks = newPts;
    });
  }

  /// CUSTOMIZE STRATEGY
  /// we only give the default pickup strategies here, including:
  /// 1. random add storage orders;
  /// 2. judge file size and free space from local ipfs repo;
  /**
   * Add or ignore to pending queue by a given cid
   * @param cid ipfs cid value
   * @param f_size truly file size
   */
  // TODO: add pending pick up strategy here, basically random with pks?
  private async pickOrDropPending(
    _cid: string,
    _f_size: number
  ): Promise<boolean> {
    return true;
  }

  /**
   * Pick or drop pulling queue by a given cid
   * @param cid ipfs cid value
   * @param f_size truly file size
   */
  private async pickOrDropPulling(
    _cid: string,
    _f_size: number
  ): Promise<boolean> {
    return true;
  }
}
