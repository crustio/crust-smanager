import dayjs from 'dayjs';
import { BlockTime, estimateTimeAt } from '../src/utils/chain-math';

describe('chain math', () => {
  it('estimate block time', () => {
    const now = dayjs();
    expect(estimateTimeAt(10, 1, now).unix()).toBe(now.unix() + 9 * BlockTime);
    expect(estimateTimeAt(100, 20, now).unix()).toBe(
      now.unix() + 80 * BlockTime,
    );
    expect(estimateTimeAt(1, 20, now).unix()).toBe(
      now.unix() + -19 * BlockTime,
    );
  });
});
