import BigNumber from 'bignumber.js';
import { FileRecord } from '../types/database';
import {
  NodeConfig,
  NormalizedSchedulerConfig,
  PullingStrategy,
} from '../types/smanager-config';
import IpfsHttpClient from 'ipfs-http-client';
import { bytesToMb } from '../utils';
import { Dayjs } from '../utils/datetime';
import { BlockAndTime, estimateTimeAtBlock } from '../utils/chain-math';

const CID = (IpfsHttpClient as any).CID; // eslint-disable-line
export const SysMinFreeSpace = 10 * 1024; // 10 * 1024 MB

type FilterFileResult =
  | 'good'
  | 'invalidCID'
  | 'invalidNoReplica'
  | 'nodeSkipped'
  | 'lifeTimeTooShort'
  | 'expired'
  | 'sizeTooSmall'
  | 'sizeTooLarge'
  | 'replicasNotEnough'
  | 'tooManyReplicas'
  | 'pendingForReplica';

// treat file as invalid if no replicas for at most 10 days
const MaxNoReplicaDuration = Dayjs.duration({
  days: 10,
});
const MinLifeTime = Dayjs.duration({
  months: 4,
});

// TODO: add some tests
export function filterFile(
  record: FileRecord,
  strategey: PullingStrategy,
  lastBlockTime: BlockAndTime,
  nodeConfig: NodeConfig,
  config: NormalizedSchedulerConfig,
): FilterFileResult {
  try {
    const bn = cidToBigNumber(record.cid);
    if (nodeConfig.nodeId > 0 && !bn.mod(nodeConfig.nodeId).eq(0)) {
      return 'nodeSkipped';
    }
  } catch (ex) {
    return 'invalidCID';
  }
  const fileSizeInMb = bytesToMb(record.size);
  // check min file size limit
  if (config.minFileSize > 0 && fileSizeInMb < config.minFileSize) {
    return 'sizeTooSmall';
  }
  if (config.maxFileSize > 0 && fileSizeInMb > config.minFileSize) {
    return 'sizeTooLarge';
  }
  if (
    strategey === 'srdFirst' &&
    config.minReplicas > 0 &&
    record.replicas < config.minReplicas
  ) {
    return 'replicasNotEnough';
  }
  if (config.maxReplicas > 0 && record.replicas >= config.maxFileSize) {
    return 'tooManyReplicas';
  }
  if (record.indexer === 'dbScan') {
    // file record has no valid expire_at information
    if (record.expire_at === 0) {
      // check how long the file was indexed
      const createAt = Dayjs.unix(record.create_at);
      if (
        Dayjs.duration(Dayjs().diff(createAt)).asSeconds() >
        MaxNoReplicaDuration.asSeconds()
      ) {
        return 'invalidNoReplica';
      }
      return 'pendingForReplica';
    }
    const expireAt = estimateTimeAtBlock(record.expire_at, lastBlockTime);
    if (
      Dayjs.duration(expireAt.diff(Dayjs())).asSeconds() <
      MinLifeTime.asSeconds()
    ) {
      return 'lifeTimeTooShort';
    }
  }
  return 'good';
}

export function cidToBigNumber(cid: string): BigNumber {
  const c = new CID(cid);
  const hex = c.toV1().toString('base16');
  return new BigNumber('0x' + hex);
}

export function isDiskEnoughForFile(
  fileSize: number,
  pendingSize: number,
  sworkerFree: number,
  sysFree: number,
): boolean {
  if (sysFree < SysMinFreeSpace) {
    return false;
  }

  return sworkerFree >= (fileSize + pendingSize) * 2.2;
}