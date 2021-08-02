import {
  NormalizedConfig,
  SManagerConfig,
  StrategyConfig,
  StrategyWeights,
} from '../types/smanager-config';
import fse from 'fs-extra';
import { validateConfig } from './config.schema';
import _ from 'lodash';
import { logger } from '../utils/logger';

const defaultsStrategyWeights = {
  srdFirst: 50,
  newFileFirst: 40,
  random: 10,
};

const srdFirstStrategyWeights = {
  srdFirst: 80,
  newFileFirst: 10,
  random: 10,
};

const newfileFirstStrategyWeights = {
  srdFirst: 10,
  newFileFirst: 80,
  random: 10,
};

function getNormalizedWeights(strategy: StrategyConfig): StrategyWeights {
  switch (strategy) {
    case 'default':
      return defaultsStrategyWeights;
    case 'srdFirst':
      return srdFirstStrategyWeights;
    case 'newFileFirst':
      return newfileFirstStrategyWeights;
    default: {
      // normaliz weights to percentage based weights
      const weights = [
        strategy.srdFirst,
        strategy.newFileFirst,
        strategy.random,
      ];
      const totalWeights = _.sum(weights);
      if (totalWeights > 0) {
        const normalized = _.map(weights, (w) => (w / totalWeights) * 100);
        return {
          srdFirst: normalized[0],
          newFileFirst: normalized[1],
          random: normalized[2],
        };
      }

      logger.warn('invalid strategy weights configured, using default weights');
      return defaultsStrategyWeights;
    }
  }
}

export function normalizeConfig(config: SManagerConfig): NormalizedConfig {
  return {
    ...config,
    scheduler: {
      ...config.scheduler,
      strategy: getNormalizedWeights(config.scheduler.strategy),
    },
  };
}

export async function loadConfig(file: string): Promise<NormalizedConfig> {
  const c = await fse.readFile(file, 'utf8');
  const config = validateConfig(JSON.parse(c));
  return normalizeConfig(config);
}
