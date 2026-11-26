import { randomUUID } from 'node:crypto';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import { z } from 'zod';
import { assertWorkspaceContext, type WorkspaceContext } from '../workspace-foundation/context.ts';

export const editorValuesSchema = z.object({
  aoId: z.string(),
  localDate: z.string(),
  localStartTime: z.string(),
  temperatureF: z.string(),
  paxUserIds: z.array(z.string()),
  offset: z.string(),
});
export type EditorValues = z.infer<typeof editorValuesSchema>;
export const draftSchema = z.object({
  _id: z.uuid(),
  teamId: z.string(),
  regionId: z.uuid(),
  actorUserId: z.string(),
  originChannelId: z.string(),
  fixedAoId: z.uuid().optional(),
  entryId: z.uuid().optional(),
  expectedEntryVersion: z.number().int().positive().optional(),
  originalAoId: z.uuid().optional(),
  historicalPaxUserIds: z.array(z.string()).optional(),
  reviewTarget: z
    .object({
      entryVersion: z.number().int().positive(),
      configurationRevision: z.number().int().positive(),
      summary: z.string(),
    })
    .optional(),
  configurationRevision: z.number().int().positive(),
  version: z.number().int().positive(),
  status: z.enum(['editing', 'queued', 'saved', 'cancelled']),
  values: editorValuesSchema,
  timeOrigin: z.enum(['schedule', 'user', 'required']),
  timeGeneration: z.number().int().nonnegative(),
  expiresAt: z.date(),
  createdAt: z.date(),
  viewId: z.string().optional(),
  operationKey: z.string().optional(),
  receiptEntryId: z.uuid().optional(),
  duplicate: z.boolean().optional(),
  errorCode: z.string().optional(),
  conflictLink: z
    .string()
    .regex(/^slack:\/\/channel\?/)
    .optional(),
});
export type EntryDraft = z.infer<typeof draftSchema>;
export async function provisionDraftIndexes(db: Db) {
  await db
    .collection('entryDrafts')
    .createIndexes([{ key: { teamId: 1, regionId: 1, actorUserId: 1, _id: 1 } }]);
}
export function createDraftRepository(db: Db, client: MongoClient) {
  const drafts = db.collection<EntryDraft>('entryDrafts');
  const scope = (context: WorkspaceContext, id: string) => {
    assertWorkspaceContext(context);
    z.uuid().parse(id);
    return {
      _id: id,
      teamId: context.teamId,
      regionId: context.regionId,
      actorUserId: context.actorUserId,
    };
  };
  return {
    async create(
      context: WorkspaceContext,
      input: Omit<EntryDraft, '_id' | 'teamId' | 'regionId' | 'actorUserId' | 'version' | 'status'>,
    ) {
      const draft = draftSchema.parse({
        ...input,
        ...scope(context, randomUUID()),
        version: 1,
        status: 'editing',
      });
      await drafts.insertOne(draft);
      return draft;
    },
    async get(context: WorkspaceContext, id: string) {
      const raw = await drafts.findOne(scope(context, id));
      if (!raw) throw new Error('DRAFT_NOT_FOUND_OR_FORBIDDEN');
      return draftSchema.parse(raw);
    },
    async replace(
      context: WorkspaceContext,
      before: EntryDraft,
      after: EntryDraft,
      session?: ClientSession,
    ) {
      const result = await drafts.replaceOne(
        { ...scope(context, before._id), version: before.version, status: before.status },
        draftSchema.parse(after),
        { session },
      );
      if (result.matchedCount !== 1) throw new Error('DRAFT_VERSION_CONFLICT');
    },
    async queue(
      context: WorkspaceContext,
      before: EntryDraft,
      after: EntryDraft,
      enqueue: (session: ClientSession) => Promise<unknown>,
      now = new Date(),
    ) {
      const session = client.startSession();
      try {
        let attempts = 0;
        await session.withTransaction(
          async () => {
            if (++attempts > 5) throw new Error('DRAFT_RETRY_REQUIRED');
            const result = await drafts.replaceOne(
              {
                ...scope(context, before._id),
                version: before.version,
                status: 'editing',
                expiresAt: { $gt: now },
              },
              draftSchema.parse(after),
              { session },
            );
            if (result.matchedCount !== 1) throw new Error('DRAFT_EXPIRED_OR_STALE');
            await enqueue(session);
          },
          { maxCommitTimeMS: 3000 },
        );
      } finally {
        await session.endSession();
      }
    },
    async operationActor(teamId: string, regionId: string, id: string) {
      const raw = await drafts.findOne({ _id: z.uuid().parse(id), teamId, regionId });
      if (!raw) throw new Error('DRAFT_NOT_FOUND_OR_FORBIDDEN');
      return draftSchema.parse(raw).actorUserId;
    },
  };
}
