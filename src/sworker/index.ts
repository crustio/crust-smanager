import axios, { AxiosInstance } from 'axios';
import { parseObj } from '../utils';

export interface SealInfo {
  sealed_size: number;
  used_time: string;
}

export type SealInfoMap = { [cid: string]: SealInfo };

export interface SrdInfo {
  srd_complete: number;
  disk_available: number;
  sys_disk_available: number;
}
export interface WorkloadInfo {
  srd: SrdInfo;
}

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

  async workload(): Promise<WorkloadInfo> {
    const res = await this.sworker.get('/workload');
    if (!res || res.status !== 200) {
      throw new Error(`invalid sworker response: ${res}`);
    }
    return parseObj(res.data);
  }

  /// READ methods
  /**
   * Query local free storage size
   * @returns (free space size(GB), system free space(GB))
   * @throws sWorker api error | timeout
   */
  async free(): Promise<[number, number]> {
    const workload = await this.workload();
    return [
      Number(workload.srd.srd_complete) + Number(workload.srd.disk_available),
      Number(workload.srd.sys_disk_available),
    ];
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
