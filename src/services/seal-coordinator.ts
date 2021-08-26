import axios, { AxiosRequestConfig } from 'axios';
import { Logger } from 'winston';
import {
  MarkSealResponse,
  SealCoordinatorApi,
} from '../types/seal-coordinator';
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
  const timeout = 10 * 1000;
  const authHeader = `Bear: ${authToken}`;
  const headers = {
    Authorization: authHeader,
    nodeId: nodeUuid,
  };
  const requestOptions = {
    responseType: 'json',
    timeout,
    headers,
  } as AxiosRequestConfig;
  const ping = async () => {
    const ret = await axios.get(`${endPoint}/ping`, requestOptions);
    return ret.status === 200;
  };

  const markSeal = async (cid: string): Promise<MarkSealResponse> => {
    const ret = await axios.post(
      `${endPoint}/node/${nodeUuid}/seal/${cid}`,
      requestOptions,
    );
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
    const ret = await axios.delete(
      `${endPoint}/node/${nodeUuid}/seal/${cid}`,
      requestOptions,
    );
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
    ping,
    markSeal,
    unMarkSeal,
  };
}
