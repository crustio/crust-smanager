export interface ChainConfig {
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
  account: string;
  role: NodeRole;
}

export interface StrategyWeights {
  srdFirst: number;
  newFileFirst: number;
  random: number;
}

type StrategyConfig = 'default' | 'srdFirst' | 'newFileFirst' | StrategyWeights;

export interface SManagerConfig {
  chain: ChainConfig;
  sworker: SworkerConfig;
  ipfs: IpfsConfig;
  node: NodeConfig;
  telemetry: TelemetryConfig;
  dataDir: string;
  strategy: StrategyConfig;
}
