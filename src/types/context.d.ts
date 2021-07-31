import { Database } from 'sqlite';
import CrustApi from '../chain';
import IpfsApi from '../ipfs';
import { NormalizedConfig } from './smanager-config';

export interface AppContext {
  config: NormalizedConfig;
  api: CrustApi;
  ipfsApi: IpfsApi;
  database: Database;
}
