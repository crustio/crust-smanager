import * as cron from 'node-cron';
import * as _ from 'lodash';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';
import TaskQueue, {Task, IPFSQueue} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {FileInfo, UsedInfo} from '../chain';
import {logger} from '../log';
import {rdm, getRandSec, gigaBytesToBytes, consts, lettersToNum} from '../util';
import SworkerApi, {SealRes} from '../sworker';
import BigNumber from 'bignumber.js';
import {MaxQueueLength, PullQueueDealLength} from '../util/consts';

export default class DecisionEngine {
  private readonly crustApi: CrustApi;
  private readonly ipfsApi: IpfsApi;
  private readonly sworkerApi: SworkerApi;
  private readonly nodeId: string;
  private groupOwner: string | null;
  private chainAccount: string;
  private allNodeCount: number;
  private members: Array<string>;
  private readonly locker: Map<string, boolean>; // The task lock
  private pullingQueue: TaskQueue;
  private sealingQueue: TaskQueue;
  private ipfsQueue: IPFSQueue;
  private currentBn: number;
  private pullCount: number;

  constructor(
    chainAddr: string,
    ipfsAddr: string,
    sworkerAddr: string,
    nodeId: string,
    chainAccount: string,
    ito: number,
    sto: number
  ) {
    this.crustApi = new CrustApi(chainAddr, chainAccount);
    this.ipfsApi = new IpfsApi(ipfsAddr, ito);
    this.sworkerApi = new SworkerApi(sworkerAddr, sto);
    this.nodeId = nodeId;
    this.chainAccount = chainAccount;
    this.allNodeCount = -1;
    this.pullCount = 0;

    this.pullingQueue = new TaskQueue(
      consts.MaxQueueLength,
      consts.ExpiredQueueBlocks
    );
    this.sealingQueue = new TaskQueue(
      consts.MaxQueueLength,
      consts.ExpiredQueueBlocks
    );
    this.ipfsQueue = new IPFSQueue(
      consts.IPFSFilesMaxSize,
      consts.IPFSQueueLimits
    );

    // Init the current block number
    this.currentBn = 0;

    // Task locker to make sure there's only 1 task
    this.locker = new Map<string, boolean>();

    // Groups
    this.groupOwner = null;
    this.members = new Array<string>();
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

      // 3. Update current block number and information
      this.currentBn = bn;

      // 4. If the node identity is member, wait for it to join group
      if (this.nodeId === consts.MEMBER) {
        const sworkIdentity = await this.crustApi.sworkIdentity();
        if (!sworkIdentity) {
          logger.warn(
            "⚠️  Can't get swork identity, please wait your sworker to report the frist work report"
          );
          return;
        } else {
          const groupOwner = sworkIdentity.group;
          if (!groupOwner) {
            logger.warn('⚠️  Wait for the member to join group');
            return;
          } else if (this.crustApi.getChainAccount() === groupOwner) {
            logger.error("💥  Can't use owner account to configure member");
            return;
          }

          // Assign this member node's owner
          this.groupOwner = groupOwner;

          // Get group members
          this.members = await this.crustApi.groupMembers(groupOwner);
          // and sort by alphabetic
          this.members.sort();
        }
      }

      // 5. Try to get new files
      const [newFiles, closedFiles]: [
        FileInfo[],
        string[]
      ] = await this.crustApi.parseNewFilesAndClosedFilesByBlock(bh);

      // 6. If got new files, parse and push into pulling queue
      for (const newFile of newFiles) {
        const nt: Task = {
          cid: newFile.cid,
          bn: bn,
          size: newFile.size,
          tips: newFile.tips,
          passPf: false,
        };

        if (nt.cid.length !== 46 || nt.cid.substr(0, 2) !== 'Qm') {
          logger.info(
            `  ↪ ✨  Found illegal file, ignore it ${JSON.stringify(nt)}`
          );
          continue;
        }

        logger.info(
          `  ↪ ✨  Found new file, adding it to pulling queue ${JSON.stringify(
            nt
          )}`
        );
        // Always push into pulling queue
        this.pullingQueue.push(nt);
      }

      // 7. If got closed files, try to delete it by calling sWorker
      for (const closedFileCid of closedFiles) {
        logger.info(`  ↪ 🗑  Try to delete file ${closedFileCid} from sWorker`);
        this.sworkerApi.delete(closedFileCid).then(deleted => {
          if (deleted) {
            logger.info(`  ↪ 🗑  Delete file(${closedFileCid}) successfully`);
          }
        });
      }

      // 8. Check and clean outdated tasks
      this.pullingQueue.clear(bn);
      this.sealingQueue.clear(bn);
    };

    return await this.crustApi.subscribeNewHeads(addPullings);
  }

  /**
   * Subscribe new ipfs pin add task, scheduling by cron.ScheduledTask
   * Take pulling task from pull queue, (maybe) adding into sealing queue
   * @returns stop `ipfs pinning add`
   * @throws ipfsApi error
   */
  async subscribePullings(): Promise<cron.ScheduledTask> {
    const randSec = getRandSec(20);
    // Call IPFS pulling every ${randSec}
    return cron.schedule(`${randSec} * * * * *`, async () => {
      try {
        logger.info('⏳  Checking pulling queue ...');
        this.pullCount++;
        if (this.allNodeCount === -1 || this.pullCount % 360 === 0) {
          this.allNodeCount = await this.crustApi.getAllNodeCount();
        }
        const dealLen = this.pullingQueue.tasks.length;

        logger.info(
          `  ↪ 📨  Pulling queue length: ${dealLen}/${MaxQueueLength}`
        );
        logger.info(
          `  ↪ 📨  Ipfs small task count: ${this.ipfsQueue.currentFilesQueueLen[0]}/${this.ipfsQueue.filesQueueLimit[0]}`
        );
        logger.info(
          `  ↪ 📨  Ipfs big task count: ${this.ipfsQueue.currentFilesQueueLen[1]}/${this.ipfsQueue.filesQueueLimit[1]}`
        );

        const free = await this.freeSpace();
        this.pullingQueue.sort();
        for (
          let index = 0;
          index < Math.min(dealLen, PullQueueDealLength);
          index++
        ) {
          const pt = this.pullingQueue.pop();
          if (pt === undefined) {
            break;
          }

          if (!pt.passPf && !(await this.probabilityFilter())) {
            logger.info('  ↪  🙅  Probability filter works, just passed.');
            continue;
          }
          pt.passPf = true;

          if (await this.shouldPull(pt, free)) {
            // Q length >= 10 drop it to failed pts
            if (!this.ipfsQueue.push(pt.size)) {
              this.pullingQueue.push(pt);
              continue;
            }

            logger.info(
              `  ↪ 🗳  Pick pulling task ${JSON.stringify(
                pt
              )}, pulling from ipfs`
            );

            // Dynamic timeout = baseTo + (size(byte) / 1024(kB) / 200(kB/s) * 1000(ms))
            // (baseSpeedReference: 200kB/s)
            const to = consts.BasePinTimeout + (pt.size / 1024 / 200) * 1000;

            // Async pulling
            this.ipfsApi
              .pin(pt.cid, to)
              .then(pinRst => {
                if (!pinRst) {
                  // a. Pin error with
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
              })
              .finally(() => {
                this.ipfsQueue.pop(pt.size);
              });
          }
        }

        logger.info('⏳  Checking pulling queue end');
      } catch (err) {
        logger.error(
          `  ↪ 💥  Checking pulling queue error, detail with ${err}`
        );
      }
    });
  }

  /**
   * Subscribe new sWorker seal task, scheduling by cron.ScheduledTask
   * Take sealing task from sealing queue, notify sWorker do the sealing job
   * @returns stop `sWorker sealing`
   * @throws sWorkerApi error
   */
  async subscribeSealings(): Promise<cron.ScheduledTask> {
    const randSec = getRandSec(50);
    // Call sWorker sealing every ${randSec}
    return cron.schedule(`${randSec} * * * * *`, async () => {
      const oldSts: Task[] = this.sealingQueue.tasks;

      logger.info('⏳  Checking sealing queue...');
      logger.info(
        `  ↪ 💌  Sealing queue length: ${oldSts.length}/${MaxQueueLength}`
      );

      // 0. If sWorker locked
      if (this.locker.get('sworker')) {
        logger.warn('  ↪ 💌  Already has sealing task in sWorker');
        return;
      }

      // 1. Clear sealing queue
      this.sealingQueue.tasks = [];

      // 2. Lock sWorker
      this.locker.set('sworker', true);

      // 3. Loop all old sealing tasks
      for (const st of oldSts) {
        // 4. Judge if sealing successful, otherwise push back to sealing tasks
        if (await this.pickUpSealing(st)) {
          logger.info(
            `  ↪ 🗳  Pick sealing task ${JSON.stringify(st)}, sending to sWorker`
          );

          const sealRes: SealRes = await this.sworkerApi.seal(st.cid);
          this.ipfsQueue.popSize(st.size);

          if (sealRes === SealRes.SealSuccess) {
            logger.info(`  ↪ 💖  Seal ${st.cid} successfully`);
          } else if (sealRes === SealRes.SealUnavailable) {
            logger.info(`  ↪ 💖  Seal ${st.cid} unavailable`);
          } else {
            logger.error(`  ↪ 💥  Seal ${st.cid} failed`);
          }
        } else {
          this.ipfsQueue.popSize(st.size);
        }
      }

      // 5. Unlock sWorker
      this.locker.set('sworker', false);
    });
  }

  /**
   * Pick or drop sealing queue by a given cid
   * @param t Task
   */
  private async pickUpSealing(t: Task): Promise<boolean> {
    const free = await this.freeSpace();

    // If free < file size
    if (free.lt(t.size)) {
      logger.warn(`  ↪ ⚠️  Free space not enough ${free} < ${t.size}`);
      return false;
    }

    return true;
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
  private async shouldPull(t: Task, free: BigNumber): Promise<boolean> {
    // Whether is my turn to pickup file
    if (!(await this.isMyTurn(t.cid))) {
      logger.info('  ↪  🙅  Not my turn, just passed.');
      return false;
    }

    // If replicas already reach the limit or file not exist
    if (await this.isReplicaFullOrFileNotExist(t.cid)) {
      return false;
    }

    // Get and judge repo can take it, make sure the free can take double file
    // If free < t.size * 2.2, 0.2 for the extra sealed size
    if (free.lte(t.size * 2.2 - this.ipfsQueue.allFileSize * 2.2)) {
      logger.warn(
        `  ↪ ⚠️  Free space not enough ${free} < ${t.size}*2.2 - ${this.ipfsQueue.allFileSize}*2.2`
      );
      return false;
    }

    return true;
  }

  /**
   * Judge if replica on chain is full or file on chain is exist
   * @param cid ipfs cid value
   * @returns wether file not exist or replica is full
   * @throws crustApi error
   */
  private async isReplicaFullOrFileNotExist(cid: string): Promise<boolean> {
    const usedInfo: UsedInfo | null = await this.crustApi.maybeGetFileUsedInfo(
      cid
    );

    if (usedInfo && _.size(usedInfo.groups) > consts.MaxFileReplicas) {
      logger.warn(
        `  ↪ ⚠️  File replica already full with ${usedInfo.groups.length}`
      );

      return true;
    } else if (!usedInfo) {
      logger.warn(`  ↪ ⚠️  File ${cid} not exist`);
      return true;
    }

    return false;
  }

  /**
   * Probability filtering
   * @returns Whether is to pickup file
   */
  private async probabilityFilter(): Promise<boolean> {
    // Base probability
    let pTake = 0.0;
    if (this.allNodeCount === 0) {
      pTake = 0.0;
    } else if (this.allNodeCount === -1) {
      pTake = 0.0;
    } else if (this.allNodeCount > 0 && this.allNodeCount <= 2000) {
      pTake = 100.0 / this.allNodeCount;
    } else if (this.allNodeCount > 2000 && this.allNodeCount <= 5000) {
      pTake = 0.05;
    } else {
      pTake = 250 / this.allNodeCount;
    }

    if (
      this.nodeId === consts.MEMBER &&
      this.groupOwner &&
      this.members.length > 0
    ) {
      pTake = pTake * this.members.length;
    }

    return pTake > rdm(this.chainAccount);
  }

  /**
   * Judge if is node can pick the file
   * @param cid File hash
   * @returns Whether is my turn to pickup file
   */
  private async isMyTurn(cid: string): Promise<boolean> {
    // Member but without groupOwner is freaking strange, but anyway pass with true
    if (
      this.nodeId === consts.MEMBER &&
      this.groupOwner &&
      this.members.length > 0
    ) {
      // 1. Get group length
      const len = this.members.length;
      // 2. Get my index
      const myIdx = this.members.indexOf(this.crustApi.getChainAccount());
      // 3. Judge if should pick storage order
      if (myIdx !== -1) {
        const cidNum = lettersToNum(cid);
        logger.info(
          `  ↪  🙋  Group length: ${len}, member index: ${myIdx}, file cid: ${cid}(${cidNum})`
        );
        return cidNum % len === myIdx;
      }
    }

    return true;
  }

  /**
   * Got free space size from sWorker
   * @returns free space size
   */
  private async freeSpace(): Promise<BigNumber> {
    const freeGBSize = await this.sworkerApi.free();
    return gigaBytesToBytes(freeGBSize);
  }
}
