import { NormalizedConfig } from '../types/smanager-config';
import path from 'path';
import { Sequelize } from 'sequelize';
import { createChildLogger } from '../utils/logger';
import { applyMigration } from './migration';

export async function loadDb(config: NormalizedConfig): Promise<boolean> {
  const logger = createChildLogger({
    moduleId: 'db',
    modulePrefix: '💽',
  });
  const dbPath = path.join(config.dataDir, 'smanager-db.sqlite');
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
  });

  await applyMigration(sequelize, logger);
  return true;
}
