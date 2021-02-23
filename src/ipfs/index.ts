import {BigNumber} from 'bignumber.js';
import {addrToHostPort} from '../util';
const IpfsHttpClient = require('ipfs-http-client');
const {CID} = require('ipfs-http-client');

export default class IpfsApi {
  private readonly ipfs: any;

  constructor(ipfsAddr: string, mto: number) {
    const [host, port] = addrToHostPort(ipfsAddr);

    this.ipfs = IpfsHttpClient({
      host: host,
      port: port,
      timeout: mto,
    });
  }

  /// WRITE methods
  /**
   * Pin add file by a given cid asyncly
   * @param c ipfs cid value
   * @param to timeout for pin operation
   * @throws illegal cid | timeout | IPFS access error, handled outside(use it as async way)
   */
  async pin(c: string, to: number): Promise<boolean> {
    const cid = new CID(c);
    const pin = await this.ipfs.pin.add(new CID(cid), {timeout: to});
    return cid.equals(pin);
  }

  /**
   * NO USE
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
   * NO USE
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
   * NO USE
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
   * NO USE
   * @returns ipfs remaining storage
   * @throws timeout
   */
  async free(): Promise<BigNumber> {
    const repoStat = await this.ipfs.repo.stat();
    return repoStat.storageMax.minus(repoStat.repoSize);
  }
}
