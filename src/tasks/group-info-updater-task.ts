import { Logger } from 'winston';
import { AppContext } from '../types/context';
import { SimpleTask } from '../types/tasks';
import { formatError } from '../utils';
import { makeIntervalTask } from './task-utils';
import { Identity } from '../chain';
import { ValidNodeAnchors } from './node-info-updater-task';
import _ from 'lodash';

async function handleUpdate(context: AppContext, logger: Logger) {
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
      context.groupInfo = null;
      return;
    }
    if (api.getChainAccount() === groupOwner) {
      logger.error("💥 Can't use owner account to configure isolation/member");
      context.groupInfo = null;
      return;
    }

    // Get group members
    const members = await api.groupMembers(groupOwner);

    /// Filter valid members
    // First get swork.Identities of the members
    const queries = [];
    for (const member of members) {
      const query = [api.chainApi().query.swork.identities, member];
      queries.push(query);
    }
    const identities = await api.chainApi().queryMulti(queries);

    // Perform the filter
    const validMembers = [];
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      const idCodec = identities[i];
      if (!_.isNil(idCodec) && !idCodec.isEmpty) {
        const id = idCodec.toJSON() as Identity;
        const anchor = id.anchor;
        if (ValidNodeAnchors.has(anchor)) {
          validMembers.push(member);
        }
      }
    }

    if (validMembers.length > 0) {
      logger.info(`load ${validMembers.length} valid group members`);
      validMembers.sort();
      const nodeIndex = validMembers.indexOf(api.getChainAccount());
      context.groupInfo = {
        groupAccount: groupOwner,
        totalMembers: validMembers.length,
        nodeIndex,
      };
    } else {
      logger.warn(`load ${validMembers.length} valid group members`);
    }
  } catch (e) {
    logger.error('failed updating group info: %s', formatError(e));
    context.groupInfo = null;
  }
}

export async function createGroupInfoUpdateTask(
  context: AppContext,
  loggerParent: Logger,
): Promise<SimpleTask> {
  const updateInterval = 1 * 60 * 1000; // update group info every minute
  return makeIntervalTask(
    30 * 1000,
    updateInterval,
    'group-info',
    context,
    loggerParent,
    handleUpdate,
    false,
  );
}
