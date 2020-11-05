import {BigNumber} from 'bignumber.js';
const IpfsHttpClient = require('ipfs-http-client');
const {CID} = require('ipfs-http-client');

export default class IpfsApi {
  private ipfs: any;

  constructor(ipfsAddr: string, mto: number) {
    // TODO: Check connection and ipfsAddr is legal
    this.ipfs = IpfsHttpClient({
      address: ipfsAddr,
      timeout: mto,
    });
  }

  /// WRITE methods
  /**
   * Pin add file by a given cid asyncly
   * @param c ipfs cid value
   * @throws illegal cid | timeout
   */
  async pin(c: string): Promise<boolean> {
    const cid = new CID(c);
    const pin = await this.ipfs.pin.add(new CID(cid));
    return cid.equals(pin);
  }

  /**
   * Pin remove file by a given cid
   * @param c ipfs cid value
   * @throws illegal cid | unpinned `c` | timeout
   */
  async unpin(c: string): Promise<boolean> {
    const cid = new CID(c);
    const pin = await this.ipfs.pin.rm(cid);
    return cid.equals(pin);
  }

  /// READONLY methods
  /**
   * Get file size by a given cid
   * @param cid ipfs cid value
   * @returns file size (bytes)
   * @throws illegal cid | timeout
   */
  async size(cid: string): Promise<number> {
    const objInfo = await this.ipfs.object.stat(new CID(cid));
    return objInfo.CumulativeSize;
  }

  /**
   * Query if a given cid(recursive type) exist
   * @param c ipfs cid value
   * @throws illegal cid | timeout
   */
  async exist(c: string): Promise<boolean> {
    const cid = new CID(c);
    for await (const pin of this.ipfs.pin.ls({
      paths: cid,
      type: 'recursive',
    })) {
      if (cid.equals(pin.cid)) return true;
    }
    return false;
  }

  /**
   * @returns ipfs remaining storage
   * @throws timeout
   */
  async free(): Promise<BigNumber> {
    const repoStat = await this.ipfs.repo.stat();
    return repoStat.storageMax.minus(repoStat.repoSize);
  }
}
