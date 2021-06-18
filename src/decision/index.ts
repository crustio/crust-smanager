import * as cron from 'node-cron';
import * as _ from 'lodash';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';
import TaskQueue, {BT} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {FileInfo, UsedInfo} from '../chain';
import {logger} from '../log';
import {rdm, gigaBytesToBytes, getRandSec, consts, lettersToNum} from '../util';
import SworkerApi from '../sworker';
import BigNumber from 'bignumber.js';
import {MaxQueueLength, IPFSQueueLength} from '../util/consts';

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
  private readonly nodeId: string;
  private groupOwner: string | null;
  private chainAccount: string;
  private allNodeCount: number;
  private ipfsTaskCount: number;
  private members: Array<string>;
  private readonly locker: Map<string, boolean>; // The task lock
  private pullingQueue: TaskQueue<Task>;
  private currentBn: number;

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
    this.allNodeCount = 0;
    this.ipfsTaskCount = 0;

    // MaxQueueLength is 50 and Expired with 1200 blocks(1h)
    this.pullingQueue = new TaskQueue<Task>(
      consts.MaxQueueLength,
      consts.ExpiredQueueBlocks
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
      this.allNodeCount = await this.crustApi.getAllNodeCount();

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
        const deleted = await this.sworkerApi.delete(closedFileCid);
        if (deleted) {
          logger.info(`  ↪ 🗑  Delete file(${closedFileCid}) successfully`);
        }
      }

      // 8. Check and clean outdated tasks
      this.pullingQueue.clear(bn);
    };

    return await this.crustApi.subscribeNewHeads(addPullings);
  }

  /**
   * Subscribe new ipfs pin add task, scheduling by cron.ScheduledTask
   * Take pulling task from pull queue
   * @returns stop `ipfs pinning add`
   * @throws ipfsApi error
   */
  async subscribePullings(): Promise<cron.ScheduledTask> {
    const randSec = getRandSec(20);
    // Call IPFS pulling every ${randSec}
    return cron.schedule(`${randSec} * * * * *`, async () => {
      try {
        logger.info('⏳  Checking pulling queue ...');
        const oldPts: Task[] = this.pullingQueue.tasks;
        const failedPts: Task[] = [];

        // 0. Pop all pulling queue
        this.pullingQueue.tasks = [];

        logger.info(
          `  ↪ 📨  Pulling queue length: ${oldPts.length}/${MaxQueueLength}`
        );
        logger.info(
          `  ↪ 📨  Ipfs task count: ${this.ipfsTaskCount}/${IPFSQueueLength}`
        );

        // 1. Loop pulling tasks
        for (const pt of oldPts) {
          // 2. If join pullings and start puling in ipfs
          if (await this.shouldPull(pt)) {
            // Q length > 10 drop it to failed pts
            if (this.ipfsTaskCount > IPFSQueueLength) {
              failedPts.push(pt);
            } else {
              this.ipfsTaskCount++;
            }

            logger.info(
              `  ↪ 🗳  Pick pulling task ${JSON.stringify(
                pt
              )}, pulling from ipfs`
            );

            // Dynamic timeout = baseTo + (size(byte) / 1024(kB) / 100(kB/s) * 1000(ms))
            // (baseSpeedReference: 100kB/s)
            const to = consts.BasePinTimeout + (pt.size / 1024 / 100) * 1000;

            // Async pulling
            this.ipfsApi
              .pin(pt.cid, to)
              .then(pinRst => {
                if (!pinRst) {
                  // a. Pin error with
                  logger.error(`  ↪ 💥  Pin ${pt.cid} failed`);
                } else {
                  // b. Pin successfully
                  logger.info(`  ↪ ✨  Pin ${pt.cid} successfully`);
                }
              })
              .catch(err => {
                // c. Just drop it as 💩
                logger.error(`  ↪ 💥  Pin ${pt.cid} failed with ${err}`);
              })
              .finally(() => {
                this.ipfsTaskCount--;
                if (this.ipfsTaskCount < 0) {
                  this.ipfsTaskCount = 0;
                }
              });
          }
        }

        // Push back failed tasks
        this.pullingQueue.tasks.concat(failedPts);
        logger.info('⏳  Checking pulling queue end');
      } catch (err) {
        logger.error(
          `  ↪ 💥  Checking pulling queue error, detail with ${err}`
        );
      }
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
  private async shouldPull(t: Task): Promise<boolean> {
    try {
      // 1. Get and judge file size is match
      // TODO: Ideally, we should compare the REAL file size(from ipfs) and
      // on-chain storage order size, but this is a COST operation which will cause timeout from ipfs,
      // so we choose to use on-chain size in the default strategy

      // Ideally code:
      // const size = await this.ipfsApi.size(t.cid);
      // logger.info(`  ↪ 📂  Got ipfs file size ${t.cid}, size is: ${size}`);
      // if (size !== t.size) {
      //   logger.warn(`  ↪ ⚠️  Size not match: ${size} != ${t.size}`);
      //   // CUSTOMER STRATEGY, can pick or not
      // }
      const size = t.size;

      // 2. Get and judge repo can take it, make sure the free can take double file
      const [free, sysFree] = await this.freeSpace();
      // If free < t.size * 2.2, 0.2 for the extra sealed size
      if (free.lte(t.size * 2.2)) {
        logger.warn(`  ↪ ⚠️  Free space not enough ${free} < ${size}*2.2`);
        return false;
      } else if (sysFree < consts.SysMinFreeSpace) {
        logger.warn(
          `  ↪ ⚠️  System free space not enough ${sysFree} < ${consts.SysMinFreeSpace}`
        );
        return false;
      }

      // 3. Judge if it should pull from chain-side based on:
      // * 1. Replica is full
      // * 2. Group duplication
      // If replicas already reach the limit or file not exist
      if (await this.isReplicaFullOrFileNotExist(t.cid)) {
        return false;
      }

      // Probability filtering
      if (!(await this.probabilityFilter())) {
        logger.info('  ↪  🙅  Probability filter works, just passed.');
        return false;
      }

      // Whether is my turn to pickup file
      if (!(await this.isMyTurn(t.cid))) {
        logger.info('  ↪  🙅  Not my turn, just passed.');
        return false;
      }
    } catch (err) {
      logger.error(`  ↪ 💥  Access ipfs or sWorker error, detail with ${err}`);
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

    logger.info(`  ↪ ⛓  Got file info from chain ${JSON.stringify(usedInfo)}`);

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
    } else if (this.allNodeCount > 0 && this.allNodeCount <= 2400) {
      pTake = 60.0 / this.allNodeCount;
    } else if (this.allNodeCount > 2400 && this.allNodeCount <= 8000) {
      pTake = 0.025;
    } else {
      pTake = 200 / this.allNodeCount;
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
   * @returns [free space size(Byte), system free space size(GB)]
   */
  private async freeSpace(): Promise<[BigNumber, number]> {
    const [freeGBSize, sysFreeGBSize] = await this.sworkerApi.free();
    return [gigaBytesToBytes(freeGBSize), sysFreeGBSize];
  }
}
