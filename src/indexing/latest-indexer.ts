/**
 * indexer which indexes orders from latest chain events
 */

import Bluebird from 'bluebird';
import _ from 'lodash';
import { Logger } from 'winston';
import { createFileOrderOperator } from '../db/file-record';
import { AppContext } from '../types/context';
import { Task } from '../types/tasks';

export async function createLatestIndexer(
  context: AppContext,
  loggerParent: Logger,
): Promise<Task> {
  const name = 'latest-indexer';
  const logger = loggerParent.child({
    moduleId: name,
  });

  const api = context.api;
  const fileOrderOp = createFileOrderOperator(context.database);

  return {
    name,
    start: () => {}, // eslint-disable-line
    stop: async () => {
      return true;
    },
    onTick: async (block) => {
      const hash = await api.getBlockHash(block);
      const [newFiles, closedFiles] =
        await api.parseNewFilesAndClosedFilesByBlock(hash.toString());
      logger.debug(
        'handling %d new files, %d closed files',
        newFiles.length,
        closedFiles.length,
      );
      const closedById = _.keyBy(closedFiles);
      const validNewFiles = _.filter(
        newFiles,
        (nf) => !_.has(closedById, nf.cid),
      );
      if (validNewFiles.length !== newFiles.length) {
        logger.warn(
          '%d files are deleted at the mean time',
          newFiles.length - validNewFiles.length,
        );
      }
      if (!_.isEmpty(newFiles)) {
        // create file record for new files
        await fileOrderOp.addFiles(newFiles, 'chainEvent');
      }
      if (!_.isEmpty(closedFiles)) {
        // create a cleanup record for closed files
        await Bluebird.mapSeries(closedFiles, (cf) =>
          fileOrderOp.createCleanupRecord(cf),
        );
      }
    },
  };
}
