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
const ipfsTimeout = 20 * 1000; // 20s
const sworkerTimeout = 8000 * 1000; //20s

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
    logger.error(`💥  Caught pending queue error: ${e.toString()}`)
  );
  de.subscribePullings().catch(e =>
    logger.error(`💥  Caught pulling queue error: ${e.toString()}`)
  );
  de.subscribeSealings().catch(e =>
    logger.error(`💥  Caught sealing queue error: ${e.toString()}`)
  );
} catch (e) {
  logger.error(`💥  Caught unhandled error ${e.toString()}`);
}
