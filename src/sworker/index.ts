import axios, {AxiosInstance} from 'axios';
import {logger} from '../log';
import {parseObj} from '../util';
import {inspect} from 'util';

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
   * End file by cid
   * @param cid ipfs cid
   * @returns End success or failed
   * @throws sWorker api error | timeout
   */
  async sealEnd(cid: string): Promise<boolean> {
    try {
      const res = await this.sworker.post(
        '/storage/seal_end',
        JSON.stringify({cid: cid})
      );

      logger.info(
        `  ↪ 💖  Call sWorker seal end, response: ${inspect(res.data)}`
      );

      return res.status === 200;
    } catch (e) {
      logger.warn(`Ending file ${cid} timeout or error: ${e.toString()}`);
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
        JSON.stringify({cid: cid})
      );

      logger.info(
        `  ↪ 💖  Call sWorker delete, response: ${inspect(res.data)}`
      );

      return res.status === 200;
    } catch (e) {
      logger.warn(`Deleting file ${cid} timeout or error: ${e.toString()}`);
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
    try {
      const res = await this.sworker.get('/workload');

      if (res && res.status === 200) {
        const body = parseObj(res.data);
        return [
          Number(body.srd['srd_complete']) + Number(body.srd['disk_available']),
          Number(body.srd['sys_disk_available']),
        ];
      }

      return [0, 0];
    } catch (e) {
      logger.warn(`Get free space from sWorker failed: ${e}`);
      return [0, 0];
    }
  }

  /// READ methods
  /**
   * Query pendings information
   * @returns pendings json
   */
  async pendings(): Promise<any | undefined> {
    try {
      const res = await this.sworker.get('file/info_by_type', {
        params: {type: 'pending'},
      });
      if (res && res.status === 200) {
        return parseObj(res.data);
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  }
}
