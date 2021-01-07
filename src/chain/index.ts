/* eslint-disable node/no-extraneous-import */
import {ApiPromise, WsProvider} from '@polkadot/api';
import {Header, Extrinsic, EventRecord} from '@polkadot/types/interfaces';
import {logger} from '../log';
import {parseObj} from '../util';

const types = {
  Address: 'AccountId',
  AddressInfo: 'Vec<u8>',
  ETHAddress: 'Vec<u8>',
  FileAlias: 'Vec<u8>',
  FileInfo: {
    file_size: 'u64',
    expired_on: 'BlockNumber',
    claimed_at: 'BlockNumber',
    amount: 'Balance',
    expected_replica_count: 'u32',
    reported_replica_count: 'u32',
    replicas: 'Vec<Replica<AccountId>>',
  },
  Guarantee: {
    targets: 'Vec<IndividualExposure<AccountId, Balance>>',
    total: 'Compact<Balance>',
    submitted_in: 'EraIndex',
    suppressed: 'bool',
  },
  IASSig: 'Vec<u8>',
  Identity: {
    anchor: 'SworkerAnchor',
    group: 'Option<AccountId>',
  },
  ISVBody: 'Vec<u8>',
  LookupSource: 'AccountId',
  MerchantLedger: {
    reward: 'Balance',
    pledge: 'Balance',
  },
  MerkleRoot: 'Vec<u8>',
  ReportSlot: 'u64',
  Replica: {
    who: 'AccountId',
    valid_at: 'BlockNumber',
    anchor: 'SworkerAnchor',
  },
  Releases: {
    _enum: ['V1_0_0', 'V2_0_0'],
  },
  PKInfo: {
    code: 'SworkerCode',
    anchor: 'Option<SworkerAnchor>',
  },
  Status: {
    _enum: ['Free', 'Reserved'],
  },
  SworkerAnchor: 'Vec<u8>',
  SworkerCert: 'Vec<u8>',
  SworkerCode: 'Vec<u8>',
  SworkerPubKey: 'Vec<u8>',
  SworkerSignature: 'Vec<u8>',
  UsedInfo: {
    used_size: 'u64',
    groups: 'BTreeSet<SworkerAnchor>',
  },
  WorkReport: {
    report_slot: 'u64',
    used: 'u64',
    free: 'u64',
    reported_files_size: 'u64',
    reported_srd_root: 'MerkleRoot',
    reported_files_root: 'MerkleRoot',
  },
};

export interface FileInfo {
  cid: string;
  size: number;
}

export type DetailFileInfo = typeof types.FileInfo;

export default class CrustApi {
  private readonly api: ApiPromise;

  constructor(addr: string) {
    this.api = new ApiPromise({
      provider: new WsProvider(addr),
      types,
    });
  }

  /**
   * Register a pubsub event, dealing with new block
   * @param handler handling with new block
   * @returns unsubscribe signal
   * @throws ApiPromise error
   */
  // FIXME: Restart chain will stop this subscriber
  async subscribeNewHeads(handler: (b: Header) => void) {
    await this.withApiReady();
    return await this.api.rpc.chain.subscribeFinalizedHeads((head: Header) =>
      handler(head)
    );
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
    }

    return files;
  }

  /**
   * Get file info from chain by cid
   * @param cid Ipfs file cid
   * @returns Option<DetailFileInfo>
   * @throws ApiPromise error or type conversing error
   */
  async maybeGetNewFile(cid: string): Promise<DetailFileInfo | null> {
    await this.withApiReady();

    return parseObj(await this.api.query.market.files(cid));
  }

  // TODO: add more error handling here
  private async withApiReady(): Promise<void> {
    await this.api.isReadyOrError;
  }

  private parseFileInfo(ex: Extrinsic): FileInfo {
    const exData = parseObj(ex.method).args;
    return {
      cid: exData.cid,
      size: exData.file_size,
    };
  }
}
