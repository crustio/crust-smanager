import _ from 'lodash';
import { validateConfig } from '../src/config/config.schema';
import { normalizeConfig } from '../src/config/load-config';
import { SManagerConfig } from '../src/types/smanager-config';

const defaultConfig: SManagerConfig = {
  chain: {
    endPoint: 'chain',
  },
  sworker: {
    endPoint: 'sworker',
  },
  ipfs: {
    endPoint: 'ipfs',
  },
  node: {
    account: 'mock',
    role: 'member',
  },
  telemetry: {
    endPoint: 'telemetry',
  },
  dataDir: 'data',
  strategy: 'default',
};

describe('config validation', () => {
  // Assert if setTimeout was called properly
  it('load good config', () => {
    expect(validateConfig(defaultConfig)).toStrictEqual(defaultConfig);
    const srdStrategey = {
      ...defaultConfig,
      strategy: 'srdFirst',
    };
    expect(validateConfig(srdStrategey).strategy).toBe('srdFirst');
  });

  it('load custom weights', () => {
    const customWeights: SManagerConfig = {
      ...defaultConfig,
      strategy: {
        srdFirst: 1,
        newFileFirst: 1,
        random: 1,
      },
    };
    expect(validateConfig(customWeights).strategy).toStrictEqual({
      srdFirst: 1,
      newFileFirst: 1,
      random: 1,
    });

    const config = _.omit(customWeights, 'strategy');
    expect(validateConfig(config).strategy).toBe('default');
  });

  it('fail with invalid config', () => {
    const config = {
      ...defaultConfig,
      strategy: 'test',
    };
    expect(() => validateConfig(config)).toThrow();
    const configWithoutChain = _.omit(defaultConfig, 'chain');
    expect(() => validateConfig(configWithoutChain)).toThrow();
  });

  it('normalize weights', () => {
    const config: SManagerConfig = {
      ...defaultConfig,
      strategy: {
        srdFirst: 10,
        newFileFirst: 10,
        random: 5,
      },
    };
    expect(normalizeConfig(config).strategy).toStrictEqual({
      srdFirst: 40,
      newFileFirst: 40,
      random: 20,
    });
  });
});
