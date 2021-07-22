import sqlite3 = require('sqlite3');
import { Database, open } from 'sqlite';
import { NormalizedConfig } from '../types/smanager-config';
import path from 'path';
import { Sequelize } from 'sequelize';
import { createChildLogger } from '../utils/logger';
import { applyMigration } from './migration';

export async function loadDb(config: NormalizedConfig): Promise<Database> {
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
  // we use sequelize just for migrations
  await sequelize.close();

  logger.info('initialize db connection...', { scope: 'db' });
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  return db;
}
