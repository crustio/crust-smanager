import * as cron from 'node-cron';
import * as _ from 'lodash';
import BigNumber from 'bignumber.js';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';
import TaskQueue, {BT} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {StorageOrder} from '../chain';

interface Task extends BT {
  // The ipfs cid value
  cid: string;
  // Object size
  size: number;
}

export default class DecisionEngine {
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
   * Subscribe new storage order extrinsic, scheduling by `subscribeNewHeads`
   * It will also check the outdated tasks
   * @returns stop `taking new storage order`
   * @throws crustApi error
   */
  async subscribePendings() {
    const addPendings = async (b: Header) => {
      // 1. Get block number
      const bn = b.number.toNumber();
      console.log(`Got new block ${bn}`);

      // 2. Try to get new storage order
      const newSorder: StorageOrder | null = await this.crustApi.maybeGetNewSorder(
        bn
      );
      // 3. If got new storage order, put it into pendingQueue
      if (newSorder) {
        const nt: Task = {
          cid: newSorder.file_identifier,
          bn: bn,
          size: _.parseInt(newSorder.file_size, 10),
        };
        // Always push into pending queue
        this.pendingQueue.push(nt);
      }
      // 4. Check and clean outdated tasks
      this.pendingQueue.clear(bn);
      this.pullingQueue.clear(bn);
    };

    const unsubscribe = await this.crustApi.subscribeNewHeads(addPendings);

    return unsubscribe;
  }

  /**
   * Subscribe new ipfs pin add task, scheduling by cron.ScheduledTask
   * @returns stop `ipfs pinning add`
   * @throws ipfsApi error
   */
  async subscribePullings(): Promise<cron.ScheduledTask> {
    return cron.schedule('* * * * *', async () => {
      // 1. Loop and pop all pendings
      const oldPts: Task[] = this.pendingQueue.tasks;
      const newPts = new Array<Task>();
      console.log('Checking pendings...');

      for (const pt of oldPts) {
        // 2. If join pullings and start puling in ipfs, otherwise push back to pending tasks
        if (await this.pickOrDropPending(pt.cid, pt.size)) {
          // Async pulling
          this.ipfsApi.pin(pt.cid).then(pinRst => {
            if (!pinRst) {
              // TODO: Maybe push back to pending queue?
              console.log(`Pin ${pt.cid} failed`);
            } else {
              // Pin successfully
            }
          });
          this.pullingQueue.push(pt);
        } else {
          newPts.push(pt);
        }
      }
      // 3. Set back to pending queue
      this.pendingQueue.tasks = newPts;
    });
  }

  /**
   * Subscribe new sWorker seal task, scheduling by cron.ScheduledTask
   * @returns stop `sWorker sealing`
   * @throws sWorkerApi error
   */
  async subscribeSealings(): Promise<cron.ScheduledTask> {
    return cron.schedule('* * * * *', async () => {
      // 1. Loop pulling tasks
      const oldPts: Task[] = this.pullingQueue.tasks;
      const newPts = new Array<Task>();
      console.log('Checking pullings...');

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
   * @throws ipfsApi error
   */
  // TODO: add pending pick up strategy here, basically random with pks?
  private async pickOrDropPending(
    cid: string,
    f_size: number
  ): Promise<boolean> {
    // 1. Get and judge file size is match
    const size = await this.ipfsApi.size(cid);
    if (size !== f_size) return false;

    // 2. Get and judge repo can take it, make sure the free can take double file
    const free = await this.ipfsApi.free();
    const bn_f_size = new BigNumber(f_size);
    if (free <= bn_f_size.multipliedBy(2)) return false;

    // TODO: Add probabilistic take sorder strategy here
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
    // TODO: check free space or just send into sWorker?
    return true;
  }
}
