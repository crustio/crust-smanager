import BigNumber from 'bignumber.js';
import { FileRecord, FileStatus } from '../types/database';
import { PullingStrategy } from '../types/smanager-config';
import IpfsHttpClient from 'ipfs-http-client';
import { bytesToMb, formatError } from '../utils';
import { Dayjs } from '../utils/datetime';
import { BlockAndTime, estimateTimeAtBlock } from '../utils/chain-math';
import { AppContext } from '../types/context';
import seedrandom from 'seedrandom';
import _ from 'lodash';
import SworkerApi from '../sworker';
import { Logger } from 'winston';

const CID = (IpfsHttpClient as any).CID; // eslint-disable-line
export const SysMinFreeSpace = 50 * 1024; // 50 * 1024 MB
export const BasePinTimeout = 60 * 60 * 1000; // 60 minutes

export const RetryableStatus: FileStatus[] = [
  'pending_replica',
  'insufficient_space',
];
export const PendingStatus: FileStatus[] = ['new', ...RetryableStatus];

type FilterFileResult =
  | 'good'
  | 'invalidCID'
  | 'invalidNoReplica'
  | 'nodeSkipped'
  | 'pfSkipped'
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
  context: AppContext,
): FilterFileResult {
  const config = context.config.scheduler;
  const groupInfo = context.groupInfo;
  try {
    const bn = cidToBigNumber(record.cid);
    if (
      groupInfo.totalMembers > 0 &&
      !bn.mod(groupInfo.totalMembers).eq(groupInfo.nodeIndex)
    ) {
      return 'nodeSkipped';
    }
  } catch (ex) {
    return 'invalidCID';
  }
  if (strategey === 'newFilesWeight' && !probabilityFilter(context)) {
    return 'pfSkipped';
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
    strategey === 'existedFilesWeight' &&
    config.minReplicas > 0 &&
    record.replicas < config.minReplicas
  ) {
    return 'replicasNotEnough';
  }
  if (config.maxReplicas > 0 && record.replicas >= config.maxReplicas) {
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

/**
 *
 * @param size in bytes
 * @returns return timeout in millseconds
 */
export function estimateIpfsPinTimeout(size: number /** in bytes */): number {
  return BasePinTimeout + (size / 1024 / 200) * 1000;
}

function probabilityFilter(context: AppContext): boolean {
  if (!context.nodeInfo) {
    return false;
  }
  // Base probability
  let pTake = 0.0;
  const nodeCount = context.nodeInfo.nodeCount;
  if (nodeCount === 0) {
    pTake = 0.0;
  } else {
    pTake = 150 / nodeCount;
  }

  const memberCount = _.max([1, context.groupInfo.totalMembers]);
  pTake = pTake * memberCount;

  return pTake > rdm(context.config.chain.account);
}

function rdm(seed: string): number {
  const rng = seedrandom(seed, { entropy: true });
  return rng();
}

export async function isSealDone(
  cid: string,
  sworkerApi: SworkerApi,
  logger: Logger,
): Promise<boolean> {
  try {
    // ipfs pin returns quickly if the sealing is done, otherwise it will timeout
    const ret = await sworkerApi.getSealInfo(cid);
    return ret && (ret.type === 'valid' || ret.type === 'lost');
  } catch (ex) {
    logger.error(
      'unexpected error while calling sworker api: %s',
      formatError(ex),
    );
    throw ex;
  }
}
