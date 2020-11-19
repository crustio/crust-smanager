import {ApiPromise, WsProvider} from '@polkadot/api';
// eslint-disable-next-line node/no-extraneous-import
import {Header} from '@polkadot/types/interfaces';

const types = {
  Address: 'AccountId',
  AddressInfo: 'Vec<u8>',
  FileAlias: 'Vec<u8>',
  Guarantee: {
    targets: 'Vec<IndividualExposure<AccountId, Balance>>',
    total: 'Compact<Balance>',
    submitted_in: 'EraIndex',
    suppressed: 'bool',
  },
  IASSig: 'Vec<u8>',
  Identity: {
    pub_key: 'Vec<u8>',
    code: 'Vec<u8>',
  },
  ISVBody: 'Vec<u8>',
  LookupSource: 'AccountId',
  MerchantInfo: {
    address: 'Vec<u8>',
    storage_price: 'Balance',
    file_map: 'Vec<(Vec<u8>, Vec<Hash>)>',
  },
  MerchantPunishment: {
    success: 'EraIndex',
    failed: 'EraIndex',
    value: 'Balance',
  },
  MerkleRoot: 'Vec<u8>',
  OrderStatus: {
    _enum: ['Success', 'Failed', 'Pending'],
  },
  PaymentLedger: {
    total: 'Balance',
    paid: 'Balance',
    unreserved: 'Balance',
  },
  Pledge: {
    total: 'Balance',
    used: 'Balance',
  },
  ReportSlot: 'u64',
  Releases: {
    _enum: ['V1_0_0', 'V2_0_0'],
  },
  SorderInfo: {
    file_identifier: 'MerkleRoot',
    file_size: 'u64',
    created_on: 'BlockNumber',
    merchant: 'AccountId',
    client: 'AccountId',
    amount: 'Balance',
    duration: 'BlockNumber',
  },
  SorderStatus: {
    completed_on: 'BlockNumber',
    expired_on: 'BlockNumber',
    status: 'OrderStatus',
    claimed_at: 'BlockNumber',
  },
  SorderPunishment: {
    success: 'BlockNumber',
    failed: 'BlockNumber',
    updated_at: 'BlockNumber',
  },
  Status: {
    _enum: ['Free', 'Reserved'],
  },
  StorageOrder: {
    file_identifier: 'Vec<u8>',
    file_size: 'u64',
    created_on: 'BlockNumber',
    completed_on: 'BlockNumber',
    expired_on: 'BlockNumber',
    provider: 'AccountId',
    client: 'AccountId',
    amount: 'Balance',
    order_status: 'OrderStatus',
  },
  SworkerCert: 'Vec<u8>',
  SworkerCode: 'Vec<u8>',
  SworkerPubKey: 'Vec<u8>',
  SworkerSignature: 'Vec<u8>',
  WorkReport: {
    report_slot: 'u64',
    used: 'u64',
    free: 'u64',
    files: 'BTreeMap<MerkleRoot, u64>',
    reported_files_size: 'u64',
    reported_srd_root: 'MerkleRoot',
    reported_files_root: 'MerkleRoot',
  },
};

export type StorageOrder = typeof types.StorageOrder;

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
  async subscribeNewHeads(handler: (b: Header) => void) {
    await this.withApiReady();
    return await this.api.rpc.chain.subscribeNewHeads((head: Header) =>
      handler(head)
    );
  }

  /**
   * Trying to get new storage order by parsing block event
   * @param bn block number
   * @returns StorageOrder or null(no storage order in this block)
   * @throws ApiPromise error or type conversing error
   */
  async maybeGetNewSorder(bn: number): Promise<StorageOrder | null> {
    await this.withApiReady();
    const bh = await this.api.rpc.chain.getBlockHash(bn);
    const events = await this.api.query.system.events.at(bh);
    for (const {
      event: {data, method},
    } of events) {
      if (method === 'StorageOrderSuccess') {
        if (data.length < 2) return null; // data should be like [AccountId, StorageOrder]

        // Find new successful storage order
        return data[1].toHuman() as StorageOrder;
      }
    }

    return null;
  }

  // async maybeGetFile(cid: string): Promise<File | null> {
  //   // TODO: query `Files`
  // }

  // TODO: add more error handling here
  private async withApiReady(): Promise<void> {
    await this.api.isReadyOrError;
  }
}
