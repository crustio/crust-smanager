import { Database } from 'sqlite';
import CrustApi from '../chain';
import IpfsApi from '../ipfs';
import SworkerApi from '../sworker';
import { NormalizedConfig } from './smanager-config';

export interface AppContext {
  config: NormalizedConfig;
  api: CrustApi;
  database: Database;
  ipfsApi: IpfsApi;
  sworkerApi: SworkerApi;
}
