import * as cron from 'node-cron';
import * as _ from 'lodash';
import BigNumber from 'bignumber.js';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';
import TaskQueue, {BT} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {StorageOrder} from '../chain';
import {logger} from '../log';

// The initial probability is 5‰
const initialProbability = 0.005;

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
  private currentBn: number;

  constructor(chainAddr: string, ipfsAddr: string, mto: number) {
    this.crustApi = new CrustApi(chainAddr);
    this.ipfsApi = new IpfsApi(ipfsAddr, mto);

    // MaxQueueLength is 50 and Overdue is 600 blocks(1h)
    this.pendingQueue = new TaskQueue<Task>(50, 600);
    this.pullingQueue = new TaskQueue<Task>(30, 600);

    // Init the current block number
    this.currentBn = 0;
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
      logger.info(`⛓  Got new block ${bn} from chain`);
      // 2. Update current block number
      this.currentBn = bn;
      // 3. Try to get new storage order
      const newSorder: StorageOrder | null = await this.crustApi.maybeGetNewSorder(
        bn
      );
      // 4. If got new storage order, put it into pendingQueue
      if (newSorder) {
        const nt: Task = {
          cid: newSorder.file_identifier,
          bn: bn,
          size: _.parseInt(newSorder.file_size.replace(/,/g, '')),
        };
        logger.info(
          `  ↪ 🎁  Found new storage order, adding to pending queue ${JSON.stringify(
            nt
          )}`
        );
        // Always push into pending queue
        this.pendingQueue.push(nt);
      }
      // 5. Check and clean outdated tasks
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
      // 1. Loop and pop all pending tasks
      const oldPts: Task[] = this.pendingQueue.tasks;
      const newPts = new Array<Task>();
      logger.info('⏳  Checking pending queue...');

      for (const pt of oldPts) {
        // 2. If join pullings and start puling in ipfs, otherwise push back to pending tasks
        if (await this.pickOrDropPending(pt)) {
          logger.info(
            `  ↪ 🎁  Pick pending task ${JSON.stringify(pt)}, pulling from ipfs`
          );
          // Async pulling
          this.ipfsApi.pin(pt.cid).then(pinRst => {
            if (!pinRst) {
              // TODO: Maybe push back to pending queue?
              logger.error(`  ↪ 💥  Pin ${pt.cid} failed`);
            } else {
              // Pin successfully
              logger.info(`  ↪ ✨  Pin ${pt.cid} successfully`);
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
      logger.info('⏳  Checking pulling queue...');

      for (const pt of oldPts) {
        // 2. Judge if pulling successful, otherwise push back to pulling tasks
        if (await this.pickOrDropPulling(pt.cid, pt.size)) {
          // TODO: Call `sWorker.seal(pt.cid)` here
          logger.info(`  ↪ ⚙️  Send sWorker to seal: ${JSON.stringify(pt)}`);
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
  private async pickOrDropPending(t: Task): Promise<boolean> {
    // 1. Get and judge file size is match
    const size = await this.ipfsApi.size(t.cid);
    logger.info(`  ↪ 📂  Got ipfs file size ${t.cid}, size is: ${size}`);
    if (size !== t.size) {
      logger.warn(`  ↪ ⚠️  Size not match: ${size} != ${t.size}`);
      return false;
    }

    // 2. Get and judge repo can take it, make sure the free can take double file
    // TODO: Remove this, cause this is no fucking use
    const free = await this.ipfsApi.free();
    const bn_f_size = new BigNumber(t.size);
    if (free <= bn_f_size.multipliedBy(2)) {
      logger.warn(`  ↪ ⚠️  Free space not enought ${free} < ${size}*2`);
      return false;
    }

    return this.isFileOnChain(t.cid, t.bn);
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

  /**
   * Query the given cid is already been picked plus a certain
   * probability
   * @param cid ipfs cid value
   * @param bn task block number
   * @throws crustApi error
   */
  private async isFileOnChain(_cid: string, bn: number): Promise<boolean> {
    // TODO: const fileInfo = await this.crustApi.maybeGetFile(cid);
    // TODO: judge if fileInfo.expected_payouts < len(fileInfo.payouts), if true, return false
    // TODO: if false, calculate probability with `expired_date`

    // 1. Generate a number between 0 and 1
    const randNum = Math.random();
    // 2. Calculate probability
    const multiple = (this.currentBn - bn) / 10 + 1; // 10 unit means 1min
    const probability = initialProbability * multiple; // probability will turns into 100% after 200 * 10 unit = 2000min
    logger.info(
      `💓  Current randNum is ${randNum}, New target is ${probability}, ${this.currentBn}, ${bn}, ${multiple}`
    );
    // 3. Judge if we hit the spot
    return randNum < probability;
  }
}
