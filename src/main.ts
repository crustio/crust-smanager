import { logger } from './utils/logger';

async function main() {
  logger.info('☄ [global] starting smanager');
}

main()
  .then(() => {
    logger.info('☄ [global] application exited normally');
  })
  .catch((e) => {
    logger.error(`☄️ [global] Uncaught exception`, e);
    process.exit(1);
  });
