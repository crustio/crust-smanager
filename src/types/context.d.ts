import CrustApi from '../chain';
import { NormalizedConfig } from './smanager-config';

export interface AppContext {
  config: NormalizedConfig;
  api: CrustApi;
}
