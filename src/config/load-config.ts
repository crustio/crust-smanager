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

const defaultsStrategyWeights: StrategyWeights = {
  existedFilesWeight: 50,
  newFilesWeight: 40,
};

const srdFirstStrategyWeights: StrategyWeights = {
  existedFilesWeight: 80,
  newFilesWeight: 10,
};

const newfileFirstStrategyWeights: StrategyWeights = {
  existedFilesWeight: 10,
  newFilesWeight: 80,
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
      const weights = [strategy.existedFilesWeight, strategy.newFilesWeight];
      const totalWeights = _.sum(weights);
      if (totalWeights > 0) {
        const normalized = _.map(weights, (w) => (w / totalWeights) * 100);
        return {
          existedFilesWeight: normalized[0],
          newFilesWeight: normalized[1],
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
