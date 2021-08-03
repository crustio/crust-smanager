import { cidToBigNumber } from '../src/tasks/pull-utils';

describe('extract cid from storage key', () => {
  it('extract good cid', () => {
    expect(
      cidToBigNumber(
        'QmY3yV46Kj4kySVUky35jhZFCwsebHm9GD9oVD4UzrqmsV',
      ).toFixed(),
    ).toBe(
      '7462641670019941206647870581808974408289101716104644620046486700662133202706398401268240',
    );
  });
});
