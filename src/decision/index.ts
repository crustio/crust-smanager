import * as cron from 'node-cron';
import * as _ from 'lodash';
import BigNumber from 'bignumber.js';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';
import TaskQueue, {BT} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {DetailFileInfo, FileInfo} from '../chain';
import {logger} from '../log';
import {gigaBytesToBytes, hexToString} from '../util';
import SworkerApi from '../sworker';

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
  private readonly sworkerApi: SworkerApi;
  private pullingQueue: TaskQueue<Task>;
  private sealingQueue: TaskQueue<Task>;
  private currentBn: number;

  constructor(
    chainAddr: string,
    ipfsAddr: string,
    sworkerAddr: string,
    ito: number,
    sto: number
  ) {
    this.crustApi = new CrustApi(chainAddr);
    this.ipfsApi = new IpfsApi(ipfsAddr, ito);
    this.sworkerApi = new SworkerApi(sworkerAddr, sto);

    // MaxQueueLength is 50 and Expired with 600 blocks(1h)
    this.pullingQueue = new TaskQueue<Task>(50, 600);
    this.sealingQueue = new TaskQueue<Task>(30, 600);

    // Init the current block number
    // TODO: Do the restart mechanism
    this.currentBn = 0;
  }

  /**
   * Subscribe new files, scheduling by `subscribeNewHeads`, put it into pulling queue
   * It will also check the outdated tasks
   * @returns stop `taking new storage order`
   * @throws crustApi error
   */
  async subscribeNewFiles() {
    const addPullings = async (b: Header) => {
      // 1. Get block number
      const bn = b.number.toNumber();
      const bh = b.hash.toString();

      // 2. Judge if already got the same block
      if (bn === this.currentBn) {
        logger.warn('⚠️  Found duplicated block');
        return;
      }

      logger.info(`⛓  Got new block ${bn}(${bh})`);

      // 3. Update current block number
      this.currentBn = bn;

      // 4. Try to get new files
      const newFiles: FileInfo[] = await this.crustApi.parseNewFilesByBlock(bh);

      // 5. If got new files, parse and push into pulling queue
      for (const newFile of newFiles) {
        const nt: Task = {
          cid: hexToString(newFile.cid),
          bn: bn,
          size: newFile.size,
        };
        logger.info(
          `  ↪ ✨  Found new file, adding it to pulling queue ${JSON.stringify(
            nt
          )}`
        );
        // Always push into pulling queue
        this.pullingQueue.push(nt);
      }

      // 6. Check and clean outdated tasks
      this.pullingQueue.clear(bn);
      this.sealingQueue.clear(bn);
    };

    const unsubscribe = await this.crustApi.subscribeNewHeads(addPullings);

    return unsubscribe;
  }

  /**
   * Subscribe new ipfs pin add task, scheduling by cron.ScheduledTask
   * Take pulling task from pull queue, (maybe) adding into sealing queue
   * @returns stop `ipfs pinning add`
   * @throws ipfsApi error
   */
  async subscribePullings(): Promise<cron.ScheduledTask> {
    return cron.schedule('* * * * *', async () => {
      // 1. Loop and pop all pulling tasks
      const oldPts: Task[] = this.pullingQueue.tasks;
      const newPts = new Array<Task>();
      logger.info('⏳  Checking pulling queue ...');
      logger.info(`  ↪ 📨  Pulling queue length: ${oldPts.length}`);

      for (const pt of oldPts) {
        // 2. If join pullings and start puling in ipfs, otherwise push back to pulling tasks
        if (await this.pickUpPulling(pt)) {
          logger.info(
            `  ↪ 🗳  Pick pulling task ${JSON.stringify(pt)}, pulling from ipfs`
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
   * Take sealing task from sealing queue, notify sWorker do the sealing job
   * @returns stop `sWorker sealing`
   * @throws sWorkerApi error
   */
  async subscribeSealings(): Promise<cron.ScheduledTask> {
    return cron.schedule('* * * * *', async () => {
      const oldSts: Task[] = this.sealingQueue.tasks;
      const newSts = new Array<Task>();
      logger.info('⏳  Checking sealing queue...');
      logger.info(`  ↪ 💌  Sealing queue length: ${oldSts.length}`);

      // 1. Loop sealing tasks
      for (const st of oldSts) {
        // 2. Judge if sealing successful, otherwise push back to sealing tasks
        if (await this.pickUpSealing(st.cid, st.size)) {
          logger.info(
            `  ↪ 🗳  Pick sealing task ${JSON.stringify(st)}, sending to sWorker`
          );
          if (await this.sworkerApi.seal(st.cid)) {
            logger.info(`  ↪ 💖  Seal ${st.cid} successfully`);
            continue; // Continue with next sealing task
          } else {
            logger.error(`  ↪ 💥  Seal ${st.cid} failed`);
          }
        }

        // Otherwise, push back to sealing queue
        newSts.push(st);
      }

      // 3. Push back to sealing queue
      this.sealingQueue.tasks = newSts;
    });
  }

  /// CUSTOMIZE STRATEGY
  /// we only give the default pickup strategies here, including:
  /// 1. random add storage orders;
  /// 2. judge file size and free space from local ipfs repo;
  /**
   * Add or ignore to pulling queue by a given cid
   * @param t Task
   * @returns if can pick
   */
  // TODO: add pulling pick up strategy here, basically random with pks?
  private async pickUpPulling(t: Task): Promise<boolean> {
    try {
      // 1. Get and judge file size is match
      const size = await this.ipfsApi.size(t.cid);
      logger.info(`  ↪ 📂  Got ipfs file size ${t.cid}, size is: ${size}`);
      if (size !== t.size) {
        logger.warn(`  ↪ ⚠️  Size not match: ${size} != ${t.size}`);
        return true;
      }

      // 2. Get and judge repo can take it, make sure the free can take double file
      const free = await this.freeSpace();
      if (free <= t.size * 2) {
        logger.warn(`  ↪ ⚠️  Free space not enought ${free} < ${size}*2`);
        return false;
      }

      // 3. Judge if it already been taked on chain or shoot it by chance
      return this.shouldPull(t.cid, t.bn);
    } catch (err) {
      logger.error(`  ↪ 💥  Access ipfs error, detail with ${err}`);
      return false;
    }
  }

  /**
   * Pick or drop sealing queue by a given cid
   * @param t Task
   */
  private async pickUpSealing(t: Task): Promise<boolean> {
    const free = await this.freeSpace();

    if (free <= t.size) {
      logger.warn(`  ↪ ⚠️  Free space not enought ${free} < ${t.size}`);
      return false;
    }

    return !(await this.isReplicaFull(t.cid));
  }

  /**
   * Judge if replica on chain is full
   * @param cid ipfs cid value
   * @returns boolean
   * @throws crustApi error
   */
  private async isReplicaFull(cid: string): Promise<boolean> {
    // TODO: Set flag to let user choose enable the `only take order file`
    const fileInfo: DetailFileInfo | null = await this.crustApi.maybeGetNewFile(
      cid
    );

    if (
      fileInfo &&
      fileInfo.replicas.length > Number(fileInfo.expected_replica_count)
    ) {
      logger.warn(
        `  ↪ ⚠️  File replica already full with ${fileInfo.replicas.length}`
      );
      return true;
    }

    return false;
  }

  /**
   * Query the given cid is already been picked plus a certain
   * probability
   * @param cid ipfs cid value
   * @param bn task block number
   * @returns should pull from ipfs
   * @throws crustApi error
   */
  private async shouldPull(cid: string, bn: number): Promise<boolean> {
    // If replicas already reach the limit
    if (await this.isReplicaFull(cid)) {
      return false;
    }
    // Else, calculate the probability with `expired_date`

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

  /**
   * Got free space size from sWorker
   * @returns free space size
   */
  private async freeSpace(): Promise<number> {
    const freeGBSize = await this.sworkerApi.free();
    return gigaBytesToBytes(freeGBSize);
  }
}
