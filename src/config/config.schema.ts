import Joi = require('joi');
import { SManagerConfig } from '../types/smanager-config';
import { createChildLogger } from '../utils/logger';

const chainConfigSchema = Joi.object().keys({
  account: Joi.string().required(),
  endPoint: Joi.string().required(),
});

const sworkerConfigSchema = Joi.object().keys({
  endPoint: Joi.string().required(),
});

const ipfsConfigSchema = Joi.object().keys({
  endPoint: Joi.string().required(),
});

const telemetryConfigSchema = Joi.object().keys({
  endPoint: Joi.string().required(),
});

const strategyWeightsSchema = Joi.object().keys({
  srdFirst: Joi.number().default(0),
  newFileFirst: Joi.number().default(10),
  random: Joi.number().default(10),
});

const configSchema = Joi.object()
  .keys({
    chain: chainConfigSchema.required(),
    sworker: sworkerConfigSchema.required(),
    ipfs: ipfsConfigSchema.required(),
    telemetry: telemetryConfigSchema.required(),
    dataDir: Joi.string().default('data').required(),
    strategy: Joi.alternatives(
      'default',
      'srdFirst',
      'newFileFirst',
      strategyWeightsSchema,
    ).default('default'),
  })
  .unknown();

const logger = createChildLogger({
  moduleId: 'config',
});

export function validateConfig(config: unknown): SManagerConfig {
  const r = configSchema.validate(config);
  if (r.error) {
    logger.error('invalid config', r.error.message);
    for (const details of r.error.details) {
      logger.error(details.message);
    }
    throw new Error('invalid config');
  }
  return r.value as SManagerConfig;
}
