import * as cron from 'node-cron';
import * as _ from 'lodash';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';
import TaskQueue, {BT} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {FileInfo, UsedInfo} from '../chain';
import {logger} from '../log';
import {getRandSec, gigaBytesToBytes, consts, lettersToNum} from '../util';
import SworkerApi, {SealRes} from '../sworker';
import BigNumber from 'bignumber.js';
import {MaxQueueLength} from '../util/consts';

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
  private members: Array<string>;
  private readonly locker: Map<string, boolean>; // The task lock
  private pullingQueue: TaskQueue<Task>;
  private sealingQueue: TaskQueue<Task>;
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

    // MaxQueueLength is 50 and Expired with 600 blocks(1h)
    this.pullingQueue = new TaskQueue<Task>(
      consts.MaxQueueLength,
      consts.ExpiredQueueBlocks
    );
    this.sealingQueue = new TaskQueue<Task>(
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

      // 3. Update current block number
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
      const oldPts: Task[] = this.pullingQueue.tasks;
      const failedPts: Task[] = [];

      // 0. Pop all pulling queue
      this.pullingQueue.tasks = [];

      logger.info('⏳  Checking pulling queue ...');
      logger.info(
        `  ↪ 📨  Pulling queue length: ${oldPts.length}/${MaxQueueLength}`
      );

      // 1. Loop old pulling tasks
      for (const pt of oldPts) {
        // 2. If join pullings and start puling in ipfs
        if (await this.pickUpPulling(pt)) {
          logger.info(
            `  ↪ 🗳  Pick pulling task ${JSON.stringify(pt)}, pulling from ipfs`
          );

          // Dynamic timeout = baseTo + (size(byte) / 1024(kB) / 100(kB/s) * 1000(ms))
          // (baseSpeedReference: 100kB/s)
          const to = consts.BasePinTimeout + (pt.size / 1024 / 100) * 1000;

          // Async pulling
          await this.ipfsApi
            .pin(pt.cid, to)
            .then(pinRst => {
              if (!pinRst) {
                // a. Pin error with
                logger.error(`  ↪ 💥  Pin ${pt.cid} failed`);
                failedPts.push(pt);
              } else {
                // b. Pin successfully, add into sealing queue
                logger.info(`  ↪ ✨  Pin ${pt.cid} successfully`);
                this.sealingQueue.push(pt);
              }
            })
            .catch(err => {
              // c. Just drop it as 💩
              logger.error(`  ↪ 💥  Pin ${pt.cid} failed with ${err}`);
              failedPts.push(pt);
            });
        }

        // Push back failed tasks
        this.pullingQueue.tasks.concat(failedPts);
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

          if (sealRes === SealRes.SealSuccess) {
            logger.info(`  ↪ 💖  Seal ${st.cid} successfully`);
          } else if (sealRes === SealRes.SealUnavailable) {
            logger.info(`  ↪ 💖  Seal ${st.cid} unavailable`);
            this.sealingQueue.push(st); // Push back to sealing queue
          } else {
            logger.error(`  ↪ 💥  Seal ${st.cid} failed`);
          }
        }
      }

      // 5. Unlock sWorker
      this.locker.set('sworker', false);
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
      const free = await this.freeSpace();
      // If free < t.size * 2.2, 0.2 for the extra sealed size
      if (free.lte(t.size * 2.2)) {
        logger.warn(`  ↪ ⚠️  Free space not enough ${free} < ${size}*2.2`);
        return false;
      }

      // 3. Judge if it should pull from chain-side
      return await this.shouldPull(t.cid);
    } catch (err) {
      logger.error(`  ↪ 💥  Access ipfs or sWorker error, detail with ${err}`);
      return false;
    }
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

  /**
   * Should pull decided from chain-side:
   * 1. Replica is full
   * 2. Group duplication
   * @param cid File hash
   * @returns pull it or not
   */
  private async shouldPull(cid: string): Promise<boolean> {
    // If replicas already reach the limit or file not exist
    if (await this.isReplicaFullOrFileNotExist(cid)) {
      return false;
    }

    // Whether this guy is member and its his turn to pick file
    if (!(await this.isMyTurn(cid))) {
      logger.info('  ↪  🙅  Not my turn, just passed.');
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
   * Judge if is member can pick the file
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
