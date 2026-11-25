import { z } from 'zod';
import { assertWorkspaceContext, type WorkspaceContext } from './context.ts';

const slackId = z.string().regex(/^[A-Z][A-Z0-9]+$/);

export interface LocalMember {
  readonly userId: string;
  readonly displayName: string;
}

export interface MemberClient {
  users: {
    info(args: { user: string }): Promise<{
      ok?: boolean;
      user?: {
        id?: string;
        team_id?: string;
        deleted?: boolean;
        is_bot?: boolean;
        is_app_user?: boolean;
        name?: string;
        real_name?: string;
      };
    }>;
  };
}

export async function requireMember(
  context: WorkspaceContext,
  userId: string,
  client: MemberClient,
  assertActive: (context: WorkspaceContext) => Promise<unknown>,
): Promise<LocalMember> {
  assertWorkspaceContext(context);
  slackId.parse(userId);
  await assertActive(context);
  const response = await client.users.info({ user: userId });
  const user = response.user;
  if (
    !response.ok ||
    user?.id !== userId ||
    user.team_id !== context.teamId ||
    user.deleted !== false ||
    user.is_bot === true ||
    user.is_app_user === true
  ) {
    throw new Error('User is not an eligible local workspace member.');
  }
  return { userId, displayName: user.real_name ?? user.name ?? userId };
}

export async function validateNewAttendees(
  context: WorkspaceContext,
  proposedUserIds: readonly string[],
  historicalUserIds: readonly string[],
  client: MemberClient,
  assertActive: (context: WorkspaceContext) => Promise<unknown>,
): Promise<void> {
  assertWorkspaceContext(context);
  await assertActive(context);
  const historical = new Set(historicalUserIds);
  for (const userId of new Set(proposedUserIds)) {
    if (!historical.has(userId)) await requireMember(context, userId, client, assertActive);
  }
}
