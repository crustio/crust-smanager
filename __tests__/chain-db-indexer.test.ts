import { cidFromStorageKey } from '../src/indexing/chain-db-indexer';

describe('extract cid from storage key', () => {
  it('extract good cid', () => {
    expect(
      cidFromStorageKey(
        '0x5ebf094108ead4fefa73f7a3b13cb4a7b3b78f30e9b952d60249b22fcdaaa76d0000d896c60e29b7b8516d596761724b736d55335a6f695a757552614d73653732774e6e554b72477337367566573847683564796a4e6e',
      ),
    ).toBe('QmYgarKsmU3ZoiZuuRaMse72wNnUKrGs76ufW8Gh5dyjNn');
    expect(
      cidFromStorageKey(
        '0x5ebf094108ead4fefa73f7a3b13cb4a7b3b78f30e9b952d60249b22fcdaaa76d00028f273372161cb8516d4e56777635457264743833415a6a737a555a78795456357a6e4c6a7a6a5346747a67674732643165384e7471',
      ),
    ).toBe('QmNVwv5Erdt83AZjszUZxyTV5znLjzjSFtzggG2d1e8Ntq');
  });
  it('return null for bad cid', () => {
    expect(
      cidFromStorageKey(
        '0x6ebf094108ead4fefa73f7a3b13cb4a7b3b78f30e9b952d60249b22fcdaaa76d00028f273372161cb8516d4e56777635457264743833415a6a737a555a78795456357a6e4c6a7a6a5346747a67674732643165384e7471',
      ),
    ).toBe(null);
  });
});
