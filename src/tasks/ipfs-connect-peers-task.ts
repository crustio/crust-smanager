import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { makeIntervalTask } from './task-utils';
import { CrustGWPeers, DefaultCrustGWPeers } from './ipfs-update-peers-list-task';


/**
 * task to connect to dedicated crust gateway peers periodly to improve the ipfs file pin success rate
 */
async function handleIpfsConnectPeers(context: AppContext, logger: Logger): Promise<void> {
  
  const peersToConnect = CrustGWPeers.size > 0 ? Array.from(CrustGWPeers): DefaultCrustGWPeers;
  
  let successCount = 0;
  for (const peer of peersToConnect) {
    try {
      await context.ipfsApi.connectPeer(peer);
      successCount++;
    } catch (error) {
      logger.error(`Failed to connect to peer: '${peer}'. Error: ${error}`);
    }
  }
  logger.info(`Connect to ${successCount} dedicated crust gateway peers.`);
}

export async function createIpfsConnectPeersTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const ipfsInterval = 3 * 60 * 1000; // Connect to dedicated peers every 3 minutes
  return makeIntervalTask(
    30 * 1000,
    ipfsInterval,
    'ipfs-connect-peers',
    context,
    loggerParent,
    handleIpfsConnectPeers,
  );
}
