import * as cron from 'node-cron';
import * as _ from 'lodash';
import BigNumber from 'bignumber.js';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';
import TaskQueue, {BT} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {DetailFileInfo, FileInfo} from '../chain';
import {logger} from '../log';
import {hexToString} from '../util';

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
  private pullingQueue: TaskQueue<Task>;
  private sealingQueue: TaskQueue<Task>;
  private currentBn: number;

  constructor(chainAddr: string, ipfsAddr: string, mto: number) {
    this.crustApi = new CrustApi(chainAddr);
    this.ipfsApi = new IpfsApi(ipfsAddr, mto);

    // MaxQueueLength is 50 and Overdue is 600 blocks(1h)
    this.pullingQueue = new TaskQueue<Task>(50, 600);
    this.sealingQueue = new TaskQueue<Task>(30, 600);

    // Init the current block number
    // TODO: Do the restart mechanism
    this.currentBn = 0;
  }

  /**
   * Subscribe new file order extrinsic, scheduling by `subscribeNewHeads`
   * It will also check the outdated tasks
   * @returns stop `taking new storage order`
   * @throws crustApi error
   */
  async subscribePendings() {
    const addPullings = async (b: Header) => {
      // 1. Get block number
      const bn = b.number.toNumber();
      const bh = b.hash.toString();
      logger.info(`⛓  Got new block ${bn}(${bh})`);
      // 2. Update current block number
      this.currentBn = bn;
      // 3. Try to get new storage order
      const newFile: FileInfo | null = await this.crustApi.parseNewFileByBlock(
        bh
      );
      // 4. If got new storage order, put it into pullingQueue
      if (newFile) {
        const nt: Task = {
          cid: hexToString(newFile.cid),
          bn: bn,
          size: newFile.size,
        };
        logger.info(
          `  ↪ 🎁  Found new file, adding it to pulling queue ${JSON.stringify(
            nt
          )}`
        );
        // Always push into pulling queue
        this.pullingQueue.push(nt);
      }
      // 5. Check and clean outdated tasks
      this.pullingQueue.clear(bn);
      this.sealingQueue.clear(bn);
    };

    const unsubscribe = await this.crustApi.subscribeNewHeads(addPullings);

    return unsubscribe;
  }

  /**
   * Subscribe new ipfs pin add task, scheduling by cron.ScheduledTask
   * @returns stop `ipfs pinning add`
   * @throws ipfsApi error
   */
  async subscribePullings(): Promise<cron.ScheduledTask> {
    return cron.schedule('* * * * *', async () => {
      // 1. Loop and pop all pulling tasks
      const oldPts: Task[] = this.pullingQueue.tasks;
      const newPts = new Array<Task>();
      logger.info('⏳  Checking pulling queue ...');
      logger.info(`  ↪ 🏃🏼‍♂️  Pulling queue length: ${oldPts.length}`);

      for (const pt of oldPts) {
        // 2. If join pullings and start puling in ipfs, otherwise push back to pulling tasks
        if (await this.pickOrDropPulling(pt)) {
          logger.info(
            `  ↪ 🎁  Pick pulling task ${JSON.stringify(pt)}, pulling from ipfs`
          );
          // Async pulling
          this.ipfsApi
            .pin(pt.cid)
            .then(pinRst => {
              if (!pinRst) {
                // a. TODO: Maybe push back to pulling queue?
                logger.error(`  ↪ 💥  Pin ${pt.cid} failed`);
              } else {
                // b. Pin successfully, add into sealing queue
                logger.info(`  ↪ ✨  Pin ${pt.cid} successfully`);
                this.sealingQueue.push(pt);
              }
            })
            .catch(err => {
              // c. Just drop it as 💩
              logger.error(`  ↪ 💥  Pin ${pt.cid} failed with ${err}`);
            });
        } else {
          // d. Push back to pulling queue
          newPts.push(pt);
        }
      }

      // 3. Send errors back to pulling queue
      this.pullingQueue.tasks = newPts;
    });
  }

  /**
   * Subscribe new sWorker seal task, scheduling by cron.ScheduledTask
   * @returns stop `sWorker sealing`
   * @throws sWorkerApi error
   */
  async subscribeSealings(): Promise<cron.ScheduledTask> {
    return cron.schedule('* * * * *', async () => {
      // 1. Loop sealing tasks
      const oldPts: Task[] = this.sealingQueue.tasks;
      const newPts = new Array<Task>();
      logger.info('⏳  Checking sealing queue...');
      logger.info(`  ↪ 🕺🏼  Sealing queue length: ${oldPts.length}`);

      for (const pt of oldPts) {
        // 2. Judge if sealing successful, otherwise push back to sealing tasks
        if (await this.pickOrDropSealing(pt.cid, pt.size)) {
          // TODO: Call `sWorker.seal(pt.cid)` here
          logger.info(`  ↪ ⚙️  Send sWorker to seal: ${JSON.stringify(pt)}`);
        } else {
          newPts.push(pt);
        }
      }
      // 3. Set back to sealing queue
      this.sealingQueue.tasks = newPts;
    });
  }

  /// CUSTOMIZE STRATEGY
  /// we only give the default pickup strategies here, including:
  /// 1. random add storage orders;
  /// 2. judge file size and free space from local ipfs repo;
  /**
   * Add or ignore to pulling queue by a given cid
   * @param cid ipfs cid value
   * @param f_size truly file size
   * @returns if can pick
   */
  // TODO: add pulling pick up strategy here, basically random with pks?
  private async pickOrDropPulling(t: Task): Promise<boolean> {
    try {
      // 1. Get and judge file size is match
      const size = await this.ipfsApi.size(t.cid);
      logger.info(`  ↪ 📂  Got ipfs file size ${t.cid}, size is: ${size}`);
      if (size !== t.size) {
        logger.warn(`  ↪ ⚠️  Size not match: ${size} != ${t.size}`);
        return true;
      }

      // 2. Get and judge repo can take it, make sure the free can take double file
      // TODO: Remove this, cause this is no fucking use
      const free = await this.ipfsApi.free();
      const bn_f_size = new BigNumber(t.size);
      if (free <= bn_f_size.multipliedBy(2)) {
        logger.warn(`  ↪ ⚠️  Free space not enought ${free} < ${size}*2`);
        return false;
      }

      // 3. Judge if it already been taked on chain or shoot it by chance
      return this.isPulled(t.cid, t.bn);
    } catch (err) {
      logger.error(`  ↪ 💥  Access ipfs error, detail with ${err}`);
      return false;
    }
  }

  /**
   * Pick or drop sealing queue by a given cid
   * @param cid ipfs cid value
   * @param f_size truly file size
   */
  private async pickOrDropSealing(
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
  private async isPulled(cid: string, bn: number): Promise<boolean> {
    // TODO: Set flag to let user choose enable the `only take order file`
    const fileInfo: DetailFileInfo | null = await this.crustApi.maybeGetNewFile(
      cid
    );
    // If replicas already reach the limit
    if (
      fileInfo &&
      fileInfo?.replicas.length > Number(fileInfo.expected_replica_count)
    ) {
      return false;
    }

    // else, calculate the probability with `expired_date`

    // 1. Generate a number between 0 and 1
    const randNum = Math.random();

    // 2. Calculate probability
    const multiple = (this.currentBn - bn) / 1 + 1; // 1 unit means 1min
    const probability = initialProbability * multiple; // probability will turns into 100% after 200 * 1 unit = 200min
    logger.info(
      `💓  Current randNum is ${randNum}, New target is ${probability}, Current block is ${this.currentBn}, Task block is ${bn}`
    );

    // 3. Judge if we hit the spot
    return randNum < probability;
  }
}
