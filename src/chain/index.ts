import { ApiPromise, WsProvider } from '@polkadot/api';
import {
  BlockHash,
  Header,
  Extrinsic,
  EventRecord,
  SignedBlock,
} from '@polkadot/types/interfaces';
import { bytesToMb, formatError, hexToString, parseObj, sleep } from '../utils';
import { typesBundleForPolkadot, crustTypes } from '@crustio/type-definitions';
import _ from 'lodash';
import { SLOT_LENGTH } from '../utils/consts';
import BN from 'bn.js';
import { logger } from '../utils/logger';
import { UnsubscribePromise, VoidFn } from '@polkadot/api/types';
import Bluebird from 'bluebird';

export interface FileInfo {
  cid: string;
  size: number;
  tips: number;
  expiredAt: number | null;
  replicas: number | null;
  owner: string | null;
}

export type MarketFileInfo = typeof crustTypes.market.types.FileInfo;
export type Identity = typeof crustTypes.swork.types.Identity;

export default class CrustApi {
  private readonly addr: string;
  private api!: ApiPromise;
  private readonly chainAccount: string;
  private latestBlock = 0;
  private subLatestHead: VoidFn = null;

  constructor(addr: string, chainAccount: string) {
    this.addr = addr;
    this.chainAccount = chainAccount;
  }

  async initApi(): Promise<void> {
    if (this.api && this.api.disconnect) {
      this.api.disconnect().then().catch();
    }
    if (this.subLatestHead) {
      this.subLatestHead();
    }

    this.api = new ApiPromise({
      provider: new WsProvider(this.addr),
      typesBundle: typesBundleForPolkadot,
    });

    await this.api.isReady;
    while (!this.api.isConnected) {
      logger.info('waiting for api to connect');
      await Bluebird.delay(1000);
    }

    this.subLatestHead = await this.api.rpc.chain.subscribeFinalizedHeads(
      (head: Header) => {
        this.latestBlock = head.number.toNumber();
      },
    );
  }

  // stop this api instance
  async stop(): Promise<void> {
    if (this.subLatestHead) {
      this.subLatestHead();
    }
    if (this.api) {
      const api = this.api;
      this.api = null;
      if (api.disconnect) {
        await api.disconnect();
      }
    }
  }

  // reconnect this api instance
  async reconnect(): Promise<void> {
    await this.stop();
    await Bluebird.delay(30 * 1000);
    await this.initApi();
    await Bluebird.delay(10 * 1000);
  }

  isConnected(): boolean {
    return this.api.isConnected;
  }

  latestFinalizedBlock(): number {
    return this.latestBlock;
  }

  async getBlockByNumber(blockNumber: number): Promise<SignedBlock> {
    const hash = await this.getBlockHash(blockNumber);
    const block = await this.api.rpc.chain.getBlock(hash);
    return block;
  }

  async getBlockHash(blockNumber: number): Promise<BlockHash> {
    return this.api.rpc.chain.getBlockHash(blockNumber);
  }

  chainApi(): ApiPromise {
    return this.api;
  }

  /// READ methods
  /**
   * Register a pubsub event, dealing with new block
   * @param handler handling with new block
   * @returns unsubscribe signal
   * @throws ApiPromise error
   */
  async subscribeNewHeads(handler: (b: Header) => void): UnsubscribePromise {
    // Waiting for API
    while (!(await this.withApiReady())) {
      logger.info('⛓ Connection broken, waiting for chain running.');
      await sleep(6000); // IMPORTANT: Sequential matters(need give time for create ApiPromise)
      this.initApi(); // Try to recreate api to connect running chain
    }

    // Waiting for chain synchronization
    while (await this.isSyncing()) {
      logger.info(
        `⛓ Chain is synchronizing, current block number ${(
          await this.header()
        ).number.toNumber()}`,
      );
      await sleep(6000);
    }

    // Subscribe finalized event
    return await this.api.rpc.chain.subscribeFinalizedHeads((head: Header) =>
      handler(head),
    );
  }

  /**
   * Used to determine whether the chain is synchronizing
   * @returns true/false
   */
  async isSyncing(): Promise<boolean> {
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
  async header(): Promise<Header> {
    return this.api.rpc.chain.getHeader();
  }

  /**
   * Get chain account
   * @returns string
   */
  getChainAccount(): string {
    return this.chainAccount;
  }

  /**
   * Get sworker identity
   * @returns Identity or Null
   */
  async sworkIdentity(): Promise<Identity | null> {
    const identity = await this.api.query.swork.identities(this.chainAccount);
    if (identity.isEmpty) {
      return null;
    }
    return identity.toJSON() as Identity;
  }

  /**
   * Get all validators count
   * @returns Count
   */
  async validatorsCount(): Promise<number> {
    const vs = await this.api.query.staking.validators.entries();
    return vs.length;
  }

  /**
   * Get all work reports
   * @returns The array of work report
   */
  async workReportsAll(): Promise<unknown> {
    return parseObj(await this.api.query.swork.workReports.entries());
  }

  /**
   * Get current report slot
   * @returns Current report slot
   */
  async currentReportSlot(): Promise<number> {
    return parseObj(await this.api.query.swork.currentReportSlot());
  }

  /**
   * Get all node count
   * @returns All node count
   */
  async getAllNodeCount(): Promise<number> {
    const currentSlot = await this.currentReportSlot();
    const workReports = await this.workReportsAll();
    let validReports = [];
    if (_.isArray(workReports)) {
      const realReports = _.map(workReports, (e) => {
        return e[1];
      });
      validReports = _.filter(realReports, (e) => {
        return e.report_slot >= currentSlot - SLOT_LENGTH;
      });
    }
    return validReports.length;
  }

  /**
   * Get group members
   * @param groupOwner owner's account id
   * @returns members(or empty vec)
   */
  async groupMembers(groupOwner: string): Promise<string[]> {
    try {
      const data = await this.api.query.swork.groups(groupOwner);
      if (data.isEmpty) {
        return [];
      }
      return (data.toJSON() as any).members as string[]; // eslint-disable-line
    } catch (e) {
      logger.error(`💥 Get group member error: ${e}`);
      return [];
    }
  }

  /**
   * Trying to get new files/closed files by parsing block event
   * @param bh block hash
   * @returns Vec<FileInfo>
   * @throws ApiPromise error or type conversing error
   */
  async parseNewFilesAndClosedFilesByBlock(
    bh: string,
  ): Promise<[FileInfo[], string[]]> {
    await this.withApiReady();
    try {
      const block = await this.api.rpc.chain.getBlock(bh);
      const exs: Extrinsic[] = block.block.extrinsics;
      const ers: EventRecord[] = await this.api.query.system.events.at(bh);
      const newFiles: FileInfo[] = [];
      const closedFiles: string[] = [];

      for (const {
        event: { data, method },
        phase,
      } of ers) {
        if (method === 'FileSuccess') {
          if (data.length < 2) continue; // data should be like [AccountId, MerkleRoot]

          // Find new successful file order from extrinsincs
          // a. Get reportWorks extrinsics
          const exIdx = phase.asApplyExtrinsic.toNumber();
          const ex = exs[exIdx];

          // b. Parse new file, continue with parsing error
          newFiles.push(
            this.parseFileInfo(ex, hexToString(data[1].toString())),
          );
        } else if (method === 'CalculateSuccess') {
          if (data.length !== 1) continue; // data should be like [MerkleRoot]

          const cid = hexToString(data[0].toString());
          const isClosed = (await this.maybeGetFileUsedInfo(cid)) === null;
          if (isClosed) {
            closedFiles.push(cid);
          }
        } else if (method === 'IllegalFileClosed') {
          if (data.length !== 1) continue; // data should be like [MerkleRoot]

          // Add into closed files
          const cid = hexToString(data[0].toString());
          closedFiles.push(cid);
        }
      }

      return [newFiles, closedFiles];
    } catch (err) {
      logger.error(`💥 Parse files error at block(${bh}): ${err}`);
      return [[], []];
    }
  }

  /**
   * Get file info from chain by cid
   * @param cid Ipfs file cid
   * @returns Option<MarketFileInfo>
   * @throws ApiPromise error or type conversing error
   */
  async maybeGetFileUsedInfo(cid: string): Promise<MarketFileInfo | null> {
    await this.withApiReady();

    try {
      // Should be like MarketFileInfo or null
      const fileUsedInfo = parseObj(await this.api.query.market.files(cid));
      return fileUsedInfo ? fileUsedInfo as MarketFileInfo: null;
    } catch (e) {
      logger.error(`💥 Get file/used info error: ${e}`);
      return null;
    }
  }

  public async ensureConnection(): Promise<void> {
    if (!(await this.withApiReady())) {
      logger.info('⛓ Connection broken, waiting for chain running.');
      await Bluebird.delay(6000); // IMPORTANT: Sequential matters(need give time for create ApiPromise)
      await this.initApi(); // Try to recreate api to connect running chain
    }
  }

  // TODO: add more error handling here
  private async withApiReady(): Promise<boolean> {
    try {
      await this.api.isReadyOrError;
      return true;
    } catch (e) {
      logger.error(`💥 Error connecting with Chain: %s`, formatError(e));
      return false;
    }
  }

  private parseFileInfo(ex: Extrinsic, cid: string): FileInfo {
    const exData = ex.method.args as any; // eslint-disable-line
    return {
      cid,
      size: bytesToMb(exData[1].toNumber()),
      // tips < 0.000001 will be zero
      tips: new BN(Number(exData.tips).toString()).div(new BN(1e6)).toNumber(),
      owner: ex.signer.toString(),
      expiredAt: 0,
      replicas: 0,
    };
  }
}
