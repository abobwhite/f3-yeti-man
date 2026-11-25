import { randomUUID } from 'node:crypto';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import { z } from 'zod';

const slackId = z.string().regex(/^[A-Z][A-Z0-9]+$/);
const installationSchema = z.object({
  _id: slackId,
  teamId: slackId,
  appId: slackId,
  installerUserId: slackId,
  active: z.literal(true),
  botToken: z.unknown().refine((value) => value !== undefined),
});
const regionSchema = z.object({
  _id: slackId,
  teamId: slackId,
  regionId: z.string().uuid(),
  adminUserIds: z.array(slackId).min(1),
});
const trustedContexts = new WeakSet<object>();

export interface WorkspaceContext {
  readonly teamId: string;
  readonly regionId: string;
  readonly actorUserId: string;
  readonly installationId: string;
}

export interface VerifiedSlackEnvelope {
  readonly teamId: string;
  readonly actorUserId: string;
  readonly appId: string;
}

export function assertWorkspaceContext(
  context: WorkspaceContext | undefined,
): asserts context is WorkspaceContext {
  if (!context || !trustedContexts.has(context)) {
    throw new Error('A foundation-validated workspace context is required.');
  }
}

export function createWorkspaceContextProvider(db: Db, client: MongoClient, appId: string) {
  slackId.parse(appId);
  const installations = db.collection<{
    _id: string;
    teamId: string;
    appId: string;
    installerUserId: string;
    active: boolean;
    botToken?: unknown;
    authorizationFence?: number;
  }>('installations');
  const regions = db.collection<{
    _id: string;
    teamId: string;
    regionId: string;
    adminUserIds: string[];
    authorizationFence?: number;
  }>('regions');

  async function activeInstallation(teamId: string, session?: ClientSession) {
    const raw = await installations.findOne(
      { _id: teamId, teamId, appId, active: true },
      { session },
    );
    const parsed = installationSchema.safeParse(raw);
    if (!parsed.success || parsed.data.teamId !== teamId || parsed.data.appId !== appId) {
      throw new Error('No active installation exists for this workspace.');
    }
    return parsed.data;
  }

  async function mappedRegion(context: WorkspaceContext, session?: ClientSession) {
    assertWorkspaceContext(context);
    await activeInstallation(context.teamId, session);
    const raw = await regions.findOne(
      { _id: context.teamId, teamId: context.teamId, regionId: context.regionId },
      { session },
    );
    const parsed = regionSchema.safeParse(raw);
    if (!parsed.success || parsed.data.regionId !== context.regionId) {
      throw new Error('Workspace region mapping is unavailable.');
    }
    return parsed.data;
  }

  return {
    async resolveWorkspaceContext(envelope: VerifiedSlackEnvelope): Promise<WorkspaceContext> {
      // The caller must pass a payload after transport signature verification.
      const teamId = slackId.parse(envelope.teamId);
      const actorUserId = slackId.parse(envelope.actorUserId);
      if (envelope.appId !== appId) throw new Error('Unexpected Slack application ID.');
      const installation = await activeInstallation(teamId);
      await regions.updateOne(
        { _id: teamId },
        {
          $setOnInsert: {
            teamId,
            regionId: randomUUID(),
            adminUserIds: [installation.installerUserId],
          },
        },
        { upsert: true },
      );
      const region = regionSchema.parse(await regions.findOne({ _id: teamId, teamId }));
      const context = Object.freeze({
        teamId,
        regionId: region.regionId,
        actorUserId,
        installationId: teamId,
      });
      trustedContexts.add(context);
      return context;
    },
    assertActive: mappedRegion,
    async fenceActive(context: WorkspaceContext, session: ClientSession): Promise<void> {
      await mappedRegion(context, session);
      const result = await installations.updateOne(
        { _id: context.teamId, teamId: context.teamId, appId, active: true },
        { $inc: { authorizationFence: 1 } },
        { session },
      );
      if (result.matchedCount !== 1) throw new Error('NOT_FOUND_OR_FORBIDDEN');
    },
    async requireAdmin(context: WorkspaceContext, session?: ClientSession): Promise<void> {
      const region = await mappedRegion(context, session);
      if (!region.adminUserIds.includes(context.actorUserId)) {
        throw new Error('NOT_FOUND_OR_FORBIDDEN');
      }
    },
    async withAdminCommit<T>(
      context: WorkspaceContext,
      action: (session: ClientSession) => Promise<T>,
    ): Promise<T> {
      assertWorkspaceContext(context);
      const session = client.startSession();
      try {
        return await session.withTransaction(async () => {
          const installation = await installations.updateOne(
            { _id: context.teamId, teamId: context.teamId, appId, active: true },
            { $inc: { authorizationFence: 1 } },
            { session },
          );
          if (installation.matchedCount !== 1)
            throw new Error('No active installation exists for this workspace.');
          // This write conflicts with concurrent admin-list changes on the same region.
          const result = await regions.updateOne(
            {
              _id: context.teamId,
              teamId: context.teamId,
              regionId: context.regionId,
              adminUserIds: context.actorUserId,
            },
            { $inc: { authorizationFence: 1 } },
            { session },
          );
          if (result.matchedCount !== 1) throw new Error('NOT_FOUND_OR_FORBIDDEN');
          return action(session);
        });
      } finally {
        await session.endSession();
      }
    },
  };
}
