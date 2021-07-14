import { SManagerConfig } from '../types/smanager-config';
import fse from 'fs-extra';
import { validateConfig } from './config.schema';

export async function loadConfig(file: string): Promise<SManagerConfig> {
  const c = await fse.readFile(file, 'utf8');
  return validateConfig(JSON.parse(c));
}
