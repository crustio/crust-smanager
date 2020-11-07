// TODO: Basic flow - func main with producer and consumer(2 queues, PendingQueue and PullingQueue)
// TODO: Better logging
// TODO: Add README
import {argv} from 'process';
import DecisionEngine from './decision';

const chainAddr = argv[2] || 'ws://localhost:9944';
const ipfsAddr = argv[3] || 'http://localhost:5001';
const maxIpfsTimeout = 20000; // 20s

try {
  const de = new DecisionEngine(chainAddr, ipfsAddr, maxIpfsTimeout);

  // TODO: Get cancellation signal and handle errors?
  de.subscribePendings();
  de.subscribePullings();
  de.subscribeSealings();
} catch (e) {
  console.error(e.toString());
}
