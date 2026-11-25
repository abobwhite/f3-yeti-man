import { z } from 'zod';
import { assertWorkspaceContext, type WorkspaceContext } from './context.ts';
import { type MemberClient, requireMember } from './members.ts';

const slackId = z.string().regex(/^[A-Z][A-Z0-9]+$/);

export interface ChannelClient extends MemberClient {
  conversations: {
    info(args: { channel: string }): Promise<{
      ok?: boolean;
      channel?: {
        id?: string;
        name?: string;
        context_team_id?: string;
        is_channel?: boolean;
        is_private?: boolean;
        is_ext_shared?: boolean;
        is_pending_ext_shared?: boolean;
        is_shared?: boolean;
        is_org_shared?: boolean;
        is_member?: boolean;
        is_archived?: boolean;
        is_frozen?: boolean;
        is_read_only?: boolean;
      };
    }>;
    members(args: { channel: string; cursor?: string; limit?: number }): Promise<{
      ok?: boolean;
      members?: string[];
      response_metadata?: { next_cursor?: string };
    }>;
  };
}

export interface LocalChannel {
  readonly channelId: string;
  readonly name: string;
}

export async function requirePublicLocalDestination(
  context: WorkspaceContext,
  channelId: string,
  actorUserId: string,
  client: ChannelClient,
  assertActive: (context: WorkspaceContext) => Promise<unknown>,
): Promise<LocalChannel> {
  assertWorkspaceContext(context);
  slackId.parse(channelId);
  if (actorUserId !== context.actorUserId)
    throw new Error('Actor does not match verified context.');
  await requireMember(context, actorUserId, client, assertActive);
  const response = await client.conversations.info({ channel: channelId });
  const channel = response.channel;
  if (
    !response.ok ||
    !channel ||
    channel.id !== channelId ||
    channel.context_team_id !== context.teamId ||
    channel.is_channel !== true ||
    channel.is_private !== false ||
    channel.is_ext_shared !== false ||
    channel.is_pending_ext_shared !== false ||
    channel.is_shared !== false ||
    channel.is_org_shared === true ||
    channel.is_member !== true ||
    channel.is_archived === true ||
    channel.is_frozen === true ||
    channel.is_read_only === true
  ) {
    throw new Error('Destination is not a writable local public channel.');
  }
  let cursor: string | undefined;
  let actorIsMember = false;
  do {
    const page = await client.conversations.members({
      channel: channelId,
      ...(cursor ? { cursor } : {}),
      limit: 200,
    });
    if (!page.ok || !page.members) throw new Error('Unable to verify channel membership.');
    actorIsMember ||= page.members.includes(actorUserId);
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor && !actorIsMember);
  if (!actorIsMember) throw new Error('Actor is not a channel member.');
  return { channelId, name: channel.name ?? channelId };
}
