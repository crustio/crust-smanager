import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { IsStopped, makeIntervalTask } from './task-utils';

async function handleUpdate(
  context: AppContext,
  logger: Logger,
  _isStopped: IsStopped,
) {
  const { api } = context;
  try {
    const sworkIdentity = await api.sworkIdentity();
    if (!sworkIdentity) {
      logger.warn('⚠️ no sworker identity');
      return;
    }
    const groupOwner = sworkIdentity.group;
    if (!groupOwner) {
      logger.warn('⚠️ Wait for the node to join group');
      return;
    }
    if (this.crustApi.getChainAccount() === groupOwner) {
      logger.error("💥 Can't use owner account to configure isolation/member");
      return;
    }

    // Get group members
    const members = await this.crustApi.groupMembers(groupOwner);
    members.sort();
    const nodeIndex = members.indexOf(api.getChainAccount());
    context.groupInfo = {
      totalMembers: members.length,
      nodeIndex,
    };
  } catch (e) {
    logger.error('failed updating group info: %s', JSON.stringify(e));
    context.groupInfo = null;
  }
}

export async function createGroupInfoUpdateTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const updateInterval = 1 * 60 * 1000; // update group info every minute
  return makeIntervalTask(
    5 * 1000,
    updateInterval,
    'group-info',
    context,
    loggerParent,
    handleUpdate,
  );
}
