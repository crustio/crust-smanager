import { Dayjs } from 'dayjs';

export const BlockTime = 6; // block time: 6s

export interface BlockAndTime {
  block: number;
  time: Dayjs;
}

export function estimateTimeAt(
  block: number,
  knownBlock: number,
  knowBlockTime: Dayjs,
): Dayjs {
  const delta = (block - knownBlock) * BlockTime;
  return knowBlockTime.add(delta, 'seconds');
}

export function estimateTimeAtBlock(
  block: number,
  knowBlock: BlockAndTime,
): Dayjs {
  return estimateTimeAt(block, knowBlock.block, knowBlock.time);
}
