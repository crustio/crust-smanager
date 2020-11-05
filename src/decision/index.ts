import TaskQueue, {BT} from '../queue';
import IpfsApi from '../ipfs';
import CrustApi, {StorageOrder} from '../chain';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';

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
          size: parseInt(newSorder.file_size),
        };

        if (this.pickOrDropPending(nt.cid, nt.size)) {
          this.pendingQueue.push(nt);
        }
      }
    };

    const unsubscribe = await this.crustApi.subscribeNewHeads(addPendings);

    return unsubscribe;
  }

  async subscribePullings() {
    // 1. Take pending tasks
    // 2. Judge if join pullings
  }

  async subscribeSealings() {
    // 1. Loop pulling tasks
    // 2. Look through ipfs contains
    // 3. Send sWorker to seal
    // 4. Delete completed pulling tasks
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
