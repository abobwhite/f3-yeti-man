import { randomUUID } from 'node:crypto';
import { type Db, MongoServerError } from 'mongodb';
import { z } from 'zod';
import { assertWorkspaceContext, type WorkspaceContext } from '../workspace-foundation/context.ts';

const ref = z.object({
  channelId: z.string().regex(/^[A-Z][A-Z0-9]+$/),
  messageTs: z.string().regex(/^\d+\.\d+$/),
});
const viewSchema = z.object({
  _id: z.string(),
  teamId: z.string(),
  regionId: z.uuid(),
  entryId: z.uuid(),
  status: z.enum(['idle', 'leased', 'sending', 'uncertain']),
  leaseId: z.uuid().optional(),
  leaseUntil: z.date().optional(),
  canonical: ref.optional(),
  previous: z.array(ref).default([]),
  pendingRedirects: z.array(ref).optional(),
  version: z.number().int().nonnegative().default(0),
  fixedChannelId: z.string().optional(),
});
export type MessageView = z.infer<typeof viewSchema>;
export type MessageReference = z.infer<typeof ref>;

export async function provisionMessageViewIndexes(db: Db) {
  await db
    .collection('entryMessageViews')
    .createIndexes([{ key: { teamId: 1, regionId: 1, entryId: 1 }, unique: true }]);
}

export function createMessageViews(db: Db) {
  const views = db.collection<MessageView>('entryMessageViews');
  const scope = (context: WorkspaceContext, entryId: string) => {
    assertWorkspaceContext(context);
    z.uuid().parse(entryId);
    return {
      _id: `${context.teamId}:${context.regionId}:${entryId}`,
      teamId: context.teamId,
      regionId: context.regionId,
      entryId,
    };
  };
  return {
    async get(context: WorkspaceContext, entryId: string) {
      const raw = await views.findOne(scope(context, entryId));
      return raw ? viewSchema.parse(raw) : null;
    },
    async claim(context: WorkspaceContext, entryId: string, now: Date) {
      const tenant = scope(context, entryId);
      try {
        await views.updateOne(
          tenant,
          { $setOnInsert: { status: 'idle', previous: [], version: 0 } },
          { upsert: true },
        );
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      }
      await views.updateOne(
        { ...tenant, status: 'sending', leaseUntil: { $lte: now } },
        { $set: { status: 'uncertain' } },
      );
      const raw = await views.findOneAndUpdate(
        { ...tenant, $or: [{ status: 'idle' }, { status: 'leased', leaseUntil: { $lte: now } }] },
        {
          $set: {
            status: 'leased',
            leaseId: randomUUID(),
            leaseUntil: new Date(now.getTime() + 30_000),
          },
        },
        { returnDocument: 'after' },
      );
      return raw ? viewSchema.parse(raw) : null;
    },
    async markSending(context: WorkspaceContext, view: MessageView, now: Date) {
      const result = await views.updateOne(
        {
          ...scope(context, view.entryId),
          leaseId: view.leaseId,
          status: 'leased',
          leaseUntil: { $gt: now },
        },
        { $set: { status: 'sending' } },
      );
      return result.modifiedCount === 1;
    },
    async checkpoint(
      context: WorkspaceContext,
      view: MessageView,
      canonical: MessageReference,
      previous: MessageReference[],
      version: number,
      pendingRedirects: MessageReference[] = [],
    ) {
      const result = await views.updateOne(
        { ...scope(context, view.entryId), leaseId: view.leaseId, status: 'sending' },
        {
          $set: {
            canonical: ref.parse(canonical),
            previous: previous.map((item) => ref.parse(item)),
            version,
            pendingRedirects: pendingRedirects.map((item) => ref.parse(item)),
          },
        },
      );
      if (result.matchedCount !== 1) throw new Error('MESSAGE_VIEW_LEASE_LOST');
    },
    async release(context: WorkspaceContext, view: MessageView, status: 'idle' | 'uncertain') {
      await views.updateOne(
        { ...scope(context, view.entryId), leaseId: view.leaseId },
        { $set: { status }, $unset: { leaseId: '', leaseUntil: '' } },
      );
    },
    /** Trusted capture composition calls this with an existing app-owned inline prompt, never a source Backblast. */
    async registerInline(context: WorkspaceContext, entryId: string, reference: MessageReference) {
      await views.insertOne(
        viewSchema.parse({
          ...scope(context, entryId),
          status: 'idle',
          canonical: ref.parse(reference),
          fixedChannelId: reference.channelId,
          previous: [],
          version: 0,
        }),
      );
    },
  };
}
