/* eslint-disable node/no-extraneous-import */
import {ApiPromise, WsProvider} from '@polkadot/api';
import {Header, Extrinsic, EventRecord} from '@polkadot/types/interfaces';
import {logger} from '../log';
import {parseObj, sleep} from '../util';
import {typesBundleForPolkadot, crustTypes} from '@crustio/type-definitions';
export interface FileInfo {
  cid: string;
  size: number;
}

export type UsedInfo = typeof crustTypes.market.types.UsedInfo;
export type Identity = typeof crustTypes.swork.types.Identity;

export default class CrustApi {
  private readonly addr: string;
  private api!: ApiPromise;
  private readonly chainAccount: string;

  constructor(addr: string, chainAccount: string) {
    this.addr = addr;
    this.chainAccount = chainAccount;
    this.initApi();
  }

  initApi() {
    if (this.api && this.api.disconnect) {
      this.api
        .disconnect()
        .then(() => {})
        .catch(() => {});
    }

    this.api = new ApiPromise({
      provider: new WsProvider(this.addr),
      typesBundle: typesBundleForPolkadot,
    });
  }

  /// READ methods
  /**
   * Register a pubsub event, dealing with new block
   * @param handler handling with new block
   * @returns unsubscribe signal
   * @throws ApiPromise error
   */
  async subscribeNewHeads(handler: (b: Header) => void) {
    // Waiting for API
    while (!(await this.withApiReady())) {
      logger.info('⛓  Connection broken, waiting for chain running.');
      await sleep(6000); // IMPORTANT: Sequential matters(need give time for create ApiPromise)
      this.initApi(); // Try to recreate api to connect running chain
    }

    // Waiting for chain synchronization
    while (await this.isSyncing()) {
      logger.info(
        `⛓  Chain is synchronizing, current block number ${(
          await this.header()
        ).number.toNumber()}`
      );
      await sleep(6000);
    }

    // Subscribe finalized event
    return await this.api.rpc.chain.subscribeFinalizedHeads((head: Header) =>
      handler(head)
    );
  }

  /**
   * Used to determine whether the chain is synchronizing
   * @returns true/false
   */
  async isSyncing() {
    const health = await this.api.rpc.system.health();
    let res = health.isSyncing.isTrue;

    if (!res) {
      const h_before = await this.header();
      await sleep(3000);
      const h_after = await this.header();
      if (h_before.number.toNumber() + 1 < h_after.number.toNumber()) {
        res = true;
      }
    }

    return res;
  }

  /**
   * Get best block's header
   * @returns header
   */
  async header() {
    return this.api.rpc.chain.getHeader();
  }

  /**
   * Get chain account
   * @returns string
   */
  getChainAccount() {
    return this.chainAccount;
  }

  /**
   * Get sworker identity
   * @returns Identity or Null
   */
  async sworkIdentity(): Promise<Identity> {
    return parseObj(await this.api.query.swork.identities(this.chainAccount));
  }

  /**
   * Get group members
   * @param groupOwner owner's account id
   * @returns members(or empty vec)
   */
  async groupMembers(groupOwner: string): Promise<Array<string>> {
    return parseObj(await this.api.query.swork.groups(groupOwner));
  }

  /**
   * Trying to get new file orders by parsing block event
   * @param bh block hash
   * @returns Vec<FileInfo>
   * @throws ApiPromise error or type conversing error
   */
  async parseNewFilesByBlock(bh: string): Promise<FileInfo[]> {
    await this.withApiReady();
    const block = await this.api.rpc.chain.getBlock(bh);
    const exs: Extrinsic[] = block.block.extrinsics;
    const ers: EventRecord[] = await this.api.query.system.events.at(bh);
    const files: FileInfo[] = [];

    for (const {
      event: {data, method},
      phase,
    } of ers) {
      if (method === 'FileSuccess') {
        if (data.length < 2) continue; // data should be like [AccountId, FileInfo]

        // Find new successful file order from extrinsincs
        // a. Get reportWorks extrinsics
        const exIdx = phase.asApplyExtrinsic.toNumber();
        const ex = exs[exIdx];

        // b. Parse new file, continue with parsing error
        try {
          files.push(this.parseFileInfo(ex));
        } catch (err) {
          logger.error(`  ↪ 💥 Parse file error at block(${bh})`);
        }
      }
      // Listen file status when `CalculateSuccess` and `IllegalFileClosed`
    }

    return files;
  }

  /**
   * Get file info from chain by cid
   * @param cid Ipfs file cid
   * @returns Option<UsedInfo>
   * @throws ApiPromise error or type conversing error
   */
  async maybeGetFileUsedInfo(cid: string): Promise<UsedInfo | null> {
    await this.withApiReady();

    const [_fileInfo, usedInfo] = parseObj(
      await this.api.query.market.files(cid)
    );
    return usedInfo;
  }

  // TODO: add more error handling here
  private async withApiReady(): Promise<boolean> {
    try {
      await this.api.isReadyOrError;
      return true;
    } catch (e) {
      logger.error(`💥  Error connecting with Chain: ${e.toString()}`);
      return false;
    }
  }

  private parseFileInfo(ex: Extrinsic): FileInfo {
    const exData = parseObj(ex.method).args;
    return {
      cid: exData.cid,
      size: exData.reported_file_size,
    };
  }
}
