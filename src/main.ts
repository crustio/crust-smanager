import { loadConfig } from './config/load-config';
import { logger } from './utils/logger';

async function main() {
  logger.info('starting smanager');
  const config = await loadConfig('smanager-config.json');
  logger.debug('smanager config loaded: %o', config);
}

main()
  .then(() => {
    logger.info('application exited normally');
  })
  .catch((e) => {
    logger.error(`Uncaught exception`, e);
    process.exit(1);
  });
