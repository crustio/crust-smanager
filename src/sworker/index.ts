import axios, {AxiosInstance} from 'axios';
import {logger} from '../log';
import {parseObj} from '../util';
import {inspect} from 'util';

export enum SealRes {
  SealSuccess,
  SealUnavailable,
  SealFailed,
}

export default class SworkerApi {
  private readonly sworker: AxiosInstance;

  constructor(sworkerAddr: string, to: number) {
    this.sworker = axios.create({
      baseURL: sworkerAddr + '/api/v0',
      timeout: to,
      headers: {'Content-Type': 'application/json'},
    });
  }

  /// WRITE methods
  /**
   * Seal cid
   * @param cid ipfs cid
   * @returns seal success or failed
   * @throws sWorker api error | timeout
   */
  async seal(cid: string): Promise<SealRes> {
    try {
      const res = await this.sworker.post(
        '/storage/seal',
        JSON.stringify({cid: cid})
      );

      const sealRes = parseObj(res.data);

      logger.info(
        `  ↪ 💖  Call sWorker seal, response: ${JSON.stringify(sealRes)}`
      );

      if (res.status === 200) {
        return SealRes.SealSuccess;
      } else {
        if (sealRes['status_code'] === 8012) {
          return SealRes.SealUnavailable;
        }
        return SealRes.SealFailed;
      }
    } catch (e) {
      logger.error(`Sealing file ${cid} timeout or error: ${e.toString()}`);
      return SealRes.SealFailed;
    }
  }

  /**
   * Delete both origin and sealed file by cid
   * @param cid ipfs cid
   * @returns delete success or failed
   * @throws sWorker api error | timeout
   */
  async delete(cid: string): Promise<boolean> {
    try {
      const res = await this.sworker.post(
        '/storage/delete',
        JSON.stringify({cid: cid})
      );

      logger.info(
        `  ↪ 💖  Call sWorker delete, response: ${inspect(res.data)}`
      );

      return res.status === 200;
    } catch (e) {
      logger.error(`Deleting file ${cid} timeout or error: ${e.toString()}`);
      return false;
    }
  }

  /// READ methods
  /**
   * Query local free storage size
   * @returns free space size(GB)
   * @throws sWorker api error | timeout
   */
  async free(): Promise<number> {
    try {
      const res = await this.sworker.get('/workload');

      if (res && res.status === 200) {
        const body = parseObj(res.data);
        return (
          Number(body.srd['srd_complete']) + Number(body.srd['disk_available'])
        );
      }

      return 0;
    } catch (e) {
      logger.error(`Get free space from sWorker failed: ${e}`);
      return 0;
    }
  }
}
