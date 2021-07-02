// TODO: Add README
import {argv} from 'process';
import DecisionEngine from './decision';
import {logger} from './log';

const chainAddr = argv[2] || 'ws://localhost:9944';
const ipfsAddr = argv[3] || 'http://localhost:5001';
const sworkerAddr = argv[4] || 'http://localhost:12222';
// disable/isolation/member
const nodeId = argv[5] || 'isolation';
const chainAccount = argv[6] || '';
const ipfsTimeout = 8000 * 1000; // 8000s
const sworkerTimeout = 8000 * 1000; //8000s

try {
  const de = new DecisionEngine(
    chainAddr,
    ipfsAddr,
    sworkerAddr,
    nodeId,
    chainAccount,
    ipfsTimeout,
    sworkerTimeout
  );

  // TODO: Get cancellation signal and handle errors?
  de.subscribeNewFiles().catch(e =>
    logger.error(`💥 Caught pending queue error: ${e.toString()}`)
  );
  de.subscribePullings().catch(e =>
    logger.error(`💥 Caught pulling queue error: ${e.toString()}`)
  );
  de.subscribeCheckPendings().catch(e =>
    logger.error(`💥 Caught check pendings error: ${e.toString()}`)
  );
} catch (e) {
  logger.error(`💥 Caught unhandled error ${e.toString()}`);
}

process.on('uncaughtException', (err: Error) => {
  logger.error(`☄️ [global] Uncaught exception ${err.message}`);
  // eslint-disable-next-line no-process-exit
  process.exit(1); // Restart by DevOps scripts
});
