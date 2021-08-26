export interface ChainConfig {
  account: string;
  endPoint: string;
}

export interface SworkerConfig {
  endPoint: string;
}

export interface IpfsConfig {
  endPoint: string;
}

export interface TelemetryConfig {
  endPoint: string;
}

type NodeRole = 'member' | 'isolation';

export interface NodeConfig {
  role: NodeRole;
}

type PullingStrategy = 'dbFilesWeight' | 'newFilesWeight';

export type StrategyWeights = { [key in PullingStrategy]: number };

type StrategyConfig = 'default' | 'srdFirst' | 'newFileFirst' | StrategyWeights;

export interface SchedulerConfig {
  strategy: StrategyConfig;
  maxPendingTasks: number;
  minSrdRatio: number; // percent
  minFileSize: number; // in MB
  maxFileSize: number; // in MB
  minReplicas: number; // min replicas for chainDb indexer
  maxReplicas: number; // max replicas limit for all indexer
}

export interface SealCoordinatorConfig {
  endPoint: string; // endpoint for seal coordinator, e.g. http://192.168.1.254:3000/
  nodeUUID: string; // unique id to identify this node
  autoToken: string; // the auth token to use which would be used as the Bear Token http header
}

export interface SManagerConfig {
  chain: ChainConfig;
  sworker: SworkerConfig;
  ipfs: IpfsConfig;
  node: NodeConfig;
  telemetry: TelemetryConfig;
  dataDir: string;
  scheduler: SchedulerConfig;
  sealCoordinator?: SealCoordinatorConfig;
}

export interface NormalizedSchedulerConfig extends SchedulerConfig {
  strategy: StrategyWeights;
  maxPendingTasks: number;
}

export interface NormalizedConfig extends SManagerConfig {
  scheduler: NormalizedSchedulerConfig;
}
