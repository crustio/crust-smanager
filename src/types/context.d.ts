import { Dayjs } from 'dayjs';
import { Database } from 'sqlite';
import CrustApi from '../chain';
import IpfsApi from '../ipfs';
import SworkerApi from '../sworker';
import { NormalizedConfig } from './smanager-config';

export interface NodeInfo {
  nodeCount: number;
}
export interface GroupInfo {
  groupAccount: string;
  totalMembers: number;
  nodeIndex: number;
}

export interface AppContext {
  startTime: Dayjs;
  config: NormalizedConfig;
  api: CrustApi;
  database: Database;
  ipfsApi: IpfsApi;
  sworkerApi: SworkerApi;
  nodeInfo: NodeInfo | null;
  groupInfo: GroupInfo | null;
  cancelationTokens: { [cid: string]: AbortController };
}
