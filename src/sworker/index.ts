import axios, { AxiosInstance } from 'axios';
import { parseObj } from '../utils';

export interface SealInfo {
  sealed_size: number;
  used_time: string;
}

export type SealInfoMap = { [cid: string]: SealInfo };

export default class SworkerApi {
  private readonly sworker: AxiosInstance;

  constructor(sworkerAddr: string, to: number) {
    this.sworker = axios.create({
      baseURL: sworkerAddr + '/api/v0',
      timeout: to,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /// WRITE methods
  /**
   * End file by cid
   * @param cid ipfs cid
   * @returns End success or failed
   * @throws sWorker api error | timeout
   */
  async sealEnd(cid: string): Promise<boolean> {
    try {
      const res = await this.sworker.post(
        '/storage/seal_end',
        JSON.stringify({ cid: cid }),
      );

      return res.status === 200;
    } catch (e) {
      return false;
    }
  }

  /**
   * Delete file by cid
   * @param cid ipfs cid
   * @returns delete success or failed
   * @throws sWorker api error | timeout
   */
  async delete(cid: string): Promise<boolean> {
    try {
      const res = await this.sworker.post(
        '/storage/delete',
        JSON.stringify({ cid: cid }),
      );

      return res.status === 200;
    } catch (e) {
      return false;
    }
  }

  /// READ methods
  /**
   * Query local free storage size
   * @returns (free space size(GB), system free space(GB))
   * @throws sWorker api error | timeout
   */
  async free(): Promise<[number, number]> {
    const res = await this.sworker.get('/workload');

    if (res && res.status === 200) {
      const body = parseObj(res.data) as any; // eslint-disable-line
      return [
        Number(body.srd['srd_complete']) + Number(body.srd['disk_available']),
        Number(body.srd['sys_disk_available']),
      ];
    }

    return [0, 0];
  }

  /// READ methods
  /**
   * Query pendings information
   * @returns pendings json
   */
  // eslint-disable-next-line
  async pendings(): Promise<SealInfoMap> {
    const res = await this.sworker.get('/file/info_by_type?type=pending');
    if (res && res.status === 200) {
      return parseObj(res.data);
    }
    throw new Error(`sworker request failed with status: ${res.status}`);
  }
}
