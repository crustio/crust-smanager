import { toQuotedList } from '../src/utils';

describe('toQuotedList test', () => {
  it('encode to quoted', () => {
    expect(toQuotedList(['new', 'pending'])).toBe('"new","pending"');
    expect(toQuotedList(['new'])).toBe('"new"');
  });
});
