import axios from 'axios';
import { Logger } from 'winston';
import {
  MarkSealResponse,
  SealCoordinatorApi,
} from '../types/seal-coordinator';
import { NormalizedConfig } from '../types/smanager-config';
import { formatError } from '../utils';
import { createChildLoggerWith } from '../utils/logger';

//
// check Seal Coordinate Spec at docs/seal-coordinator.md
export function makeSealCoordinatorApi(
  endPoint: string,
  authToken: string,
  nodeUuid: string,
  loggerParent: Logger,
): SealCoordinatorApi {
  const logger = createChildLoggerWith(
    {
      moduleId: 'seal-coordinator',
    },
    loggerParent,
  );
  logger.debug(
    'creating seal coordinator: "%s", token: "%s", uuid: "%s"',
    endPoint,
    authToken,
    nodeUuid,
  );
  const timeout = 10 * 1000;
  const authHeader = `Bear: ${authToken}`;
  const headers = {
    Authorization: authHeader,
    nodeId: nodeUuid,
  };
  const checkError = <T>(fn: (...args) => Promise<T>) => {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        logger.error('request failed: %s', formatError(e));
        throw e;
      }
    };
  };

  const api = axios.create({
    baseURL: endPoint,
    timeout,
    headers,
  });
  const ping = async () => {
    const ret = await api.get('/ping');
    if (ret.status !== 200) {
      logger.warn(
        'ping failed, status: %d, text:  %s, data: %o',
        ret.status,
        ret.statusText,
        ret.data,
      );
    }

    return ret.status === 200;
  };

  const markSeal = async (cid: string): Promise<MarkSealResponse> => {
    const ret = await axios.post(`/node/${nodeUuid}/seal/${cid}`);
    if (ret.status !== 200) {
      logger.info(
        'request failed, status: %d, text:  %s, data: %o',
        ret.status,
        ret.statusText,
        ret.data,
      );
      return {
        seal: false,
        reason: 'failed',
      };
    }
    return ret.data;
  };

  const unMarkSeal = async (cid: string): Promise<MarkSealResponse> => {
    const ret = await axios.delete(`/node/${nodeUuid}/seal/${cid}`);
    if (ret.status !== 200) {
      logger.info(
        'request failed, status: %d, text:  %s, data: %o',
        ret.status,
        ret.statusText,
        ret.data,
      );
      return {
        seal: false,
        reason: 'failed',
      };
    }
    return ret.data;
  };

  return {
    ping: checkError(ping),
    markSeal: checkError(markSeal),
    unMarkSeal: checkError(unMarkSeal),
  };
}

export async function makeSealCoordinatorApiFromConfig(
  config: NormalizedConfig,
  logger: Logger,
): Promise<SealCoordinatorApi | null> {
  if (config.sealCoordinator) {
    const { endPoint, authToken, nodeUUID } = config.sealCoordinator;
    const api = makeSealCoordinatorApi(endPoint, authToken, nodeUUID, logger);
    const ping = await api.ping();
    if (!ping) {
      throw new Error('ping seal api failed!');
    }
  }
  return null;
}
