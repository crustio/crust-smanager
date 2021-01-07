import axios, {AxiosInstance} from 'axios';
import { parseObj } from '../util';

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
  async seal(cid: string): Promise<boolean> {
    const res = await this.sworker.post(
      '/storage/seal',
      JSON.stringify({cid: cid})
    );

    return res.status === 200;
  }

  /**
   * Delete both origin and sealed file by cid
   * @param cid ipfs cid
   * @returns delete success or failed
   * @throws sWorker api error | timeout
   */
  async delete(cid: string): Promise<boolean> {
    const res = await this.sworker.post(
      '/storage/delete',
      JSON.stringify({cid: cid})
    );

    return res.status === 200;
  }

  /// READ methods
  /**
   * Query local free storage size
   * @returns free space size(GB)
   * @throws sWorker api error | timeout
   */
  async free(): Promise<number> {
    const res = await this.sworker.get('/workload');

    if (res && res.status === 200) {
      const body = parseObj(res.data);
      return (
        Number(body.srd['srd_complete']) + Number(body.srd['disk_available'])
      );
    }

    return 0;
  }
}
