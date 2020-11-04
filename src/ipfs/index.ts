import {BigNumber} from 'bignumber.js';
const IpfsHttpClient = require('ipfs-http-client');
const {CID} = require('ipfs-http-client');

export default class Ipfs {
  private ipfs: any;
  private readonly maxTimeout: string;

  constructor(ipfsAddr: string, mto: string) {
    this.ipfs = IpfsHttpClient(ipfsAddr);
    this.maxTimeout = mto;
  }

  /// WRITE methods
  /**
   * Pin add file by a given cid asyncly
   * @param cid ipfs cid value
   */
  pin(cid: string): boolean {
    try {
      this.ipfs.pin.add(new CID(cid), {
        timeout: this.maxTimeout,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Pin remove file by a given cid
   * @param c ipfs cid value
   */
  async unpin(c: string): Promise<boolean> {
    try {
      const cid = new CID(c);
      const pin = await this.ipfs.pin.rm(cid, {
        timeout: this.maxTimeout,
      });
      return cid.equals(pin);
    } catch (e) {
      return false; // `cid` not pinned before
    }
  }

  /// READONLY methods
  /**
   * Get file size by a given cid
   * @param cid ipfs cid value
   * @returns file size (bytes)
   */
  async size(cid: string): Promise<number> {
    try {
      const objInfo = await this.ipfs.object.stat(new CID(cid), {
        timeout: this.maxTimeout,
      });
      return objInfo.CumulativeSize;
    } catch (e) {
      return -1; // illegal cid, not found or api http error
    }
  }

  /**
   * Query if a given cid(recursive type) exist
   * @param c ipfs cid value
   */
  async exist(c: string): Promise<boolean> {
    try {
      const cid = new CID(c);
      for await (const pin of this.ipfs.pin.ls({
        paths: cid,
        type: 'recursive',
        timeout: this.maxTimeout,
      })) {
        if (cid.equals(pin.cid)) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * @returns ipfs remaining storage
   */
  async free(): Promise<BigNumber> {
    try {
      const repoStat = await this.ipfs.repo.stat({
        timeout: this.maxTimeout,
      });
      return repoStat.storageMax.minus(repoStat.repoSize);
    } catch (e) {
      return new BigNumber(-1); // api http error
    }
  }
}
