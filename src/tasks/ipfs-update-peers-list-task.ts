import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { makeIntervalTask } from './task-utils';
import axios from 'axios';
import https from 'https';

export const CrustGWPeers = new Set<string>();

export const DefaultCrustGWPeers: string[] = [
  '/ip4/60.188.112.180/tcp/14001/p2p/12D3KooWP4PpTGcVQsiSCRS6E7X31j6ivWNLdfSMdgErQXXv3WoL',
  '/ip4/60.188.112.178/tcp/14001/p2p/12D3KooWMcAHcs97R49PLZjGUKDbP1fr9iijeepod8fkktHTLCgN',
  '/ip4/45.77.251.250/tcp/4001/p2p/12D3KooWAEw4RBa1oRyqMXUCzyAbwgvDduRFvi1KzaahSb5Pk61q',
  '/ip4/103.73.242.131/tcp/14001/p2p/12D3KooWDbPeYWubpE2tyDs3Gp7UgNGmHRgMvyALRNCeL3s77fgv'];

const PeersListURL = 'https://gw-peer-address.crust.network/crust-gw-peer-address';

/**
 * task to download and refresh the peers cache list periodly
 */
async function handleUpdatePeersList(_context: AppContext, logger: Logger): Promise<void> {
  try {
    const agent = new https.Agent({
      rejectUnauthorized: false, // Ignore the SSL certificate
    });
    const response = await axios.get(PeersListURL, {
        responseType: 'text',
        timeout: 10 * 1000,
        httpsAgent: agent
      });
    
    if (response.status !== 200) {
      logger.error(`Download gateway peers list failed. Status Code: ${response.status}`);
      return;
    }

    // Split the data, each line represents one peer address
    const lines = response.data.split('\n').filter(line => line.trim() != '');

    logger.info(`Update the gateway peers list with ${lines.length} peers`);
    CrustGWPeers.clear();
    lines.forEach((line) => {
      CrustGWPeers.add(line);
      logger.debug(line);
    });
    
  } catch(error) {
    logger.error(`Download the gateway peers list failed: ${error}`);
    // Request failed, keep the existing peers list, or use the default list if empty
    if (CrustGWPeers.size === 0) {
      logger.info('Use the default gateway peers list');
      DefaultCrustGWPeers.forEach((peer) => CrustGWPeers.add(peer));
    }
  }
}

export async function createIpfsUpdatePeersListTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const ipfsInterval = 60 * 60 * 1000; // Download and refresh the peers cache list every hour
  return makeIntervalTask(
    15 * 1000,
    ipfsInterval,
    'ipfs-update-peers-list',
    context,
    loggerParent,
    handleUpdatePeersList,
  );
}
