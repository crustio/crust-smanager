import { BigNumber } from 'bignumber.js';
import { addrToHostPort } from '../utils';
import IpfsHttpClient from 'ipfs-http-client';
import { AbortController } from 'native-abort-controller';
import { CrustGWPeers, DefaultCrustGWPeers } from '../tasks/ipfs-update-peers-list-task';
import { createChildLogger } from '../utils/logger';

const CID = (IpfsHttpClient as any).CID; // eslint-disable-line

const logger = createChildLogger({ moduleId: 'ipfs-api' });

export default class IpfsApi {
  private readonly ipfs: any; // eslint-disable-line

  constructor(ipfsAddr: string, mto: number) {
    const [host, port] = addrToHostPort(ipfsAddr);

    this.ipfs = IpfsHttpClient({
      host: host,
      port: port,
      timeout: mto,
    } as any); // eslint-disable-line
  }

  /// WRITE methods
  /**
   * Pin add file by a given cid asyncly
   * @param c ipfs cid value
   * @param to timeout for pin operation
   * @throws illegal cid | timeout | IPFS access error, handled outside(use it as async way)
   */
  pin(c: string, to: number): [AbortController, Promise<boolean>] {
    const controller = new AbortController();
    const signal = controller.signal;
    
    const result = async () => {
      await this.connectGatewayPeers();
      const cid = new CID(c);
      const pin = await this.ipfs.pin.add(cid, { timeout: to, signal });
      return cid.equals(pin) as boolean;
    };

    return [controller, result()];
  }

  async connectGatewayPeers(): Promise<void> {
    const peersToConnect = CrustGWPeers.size > 0 ? Array.from(CrustGWPeers): DefaultCrustGWPeers;
  
    let successCount = 0;
    for (const peer of peersToConnect) {
      try {
        await this.ipfs.swarm.connect(peer);
        successCount++;
      } catch (error) {
        logger.debug(`Failed to connect to peer: '${peer}'. Error: ${error}`);
      }
    }
    logger.debug(`Connect to ${successCount} dedicated crust gateway peers.`);
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

  /**
   * ipfs repo gc
   * @param to timeout for gc operation
   */
  async repoGC(to: number): Promise<void> {
    await this.ipfs.repo.gc({ timeout: to });
  }

  /**
   * ipfs swarm connect
   * @param peerAddress peer address
   */
  async connectPeer(peerAddress: string): Promise<void> {
    await this.ipfs.swarm.connect(peerAddress);
  }
}
