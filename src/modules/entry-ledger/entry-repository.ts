import type { ClientSession, Db } from 'mongodb';
import { z } from 'zod';
import { assertWorkspaceContext, type WorkspaceContext } from '../workspace-foundation/context.ts';
import { temperatureSchema, workoutReferenceSchema } from './types.ts';

const id = z.string().regex(/^[A-Z][A-Z0-9]+$/);
export const sourceSchema = z.object({
  channelId: id,
  messageTs: z.string().regex(/^\d+\.\d+$/),
  role: z.enum(['preblast', 'backblast']),
  qUserIds: z.array(id).default([]),
});
export const entrySchema = z.object({
  _id: z.uuid(),
  schemaVersion: z.literal(1),
  teamId: id,
  regionId: z.uuid(),
  entryId: z.uuid(),
  seasonId: z.uuid(),
  workoutReference: workoutReferenceSchema,
  temperatureF: temperatureSchema,
  paxUserIds: z.array(id).min(1),
  sourceQUserIds: z.array(id),
  pointsPerPax: z.number().int().nonnegative().safe(),
  scoringPolicyId: z.uuid(),
  scoringPolicyRevision: z.number().int().positive(),
  generationId: z.string().min(1),
  status: z.enum(['active', 'archived']),
  version: z.number().int().positive(),
  createdBy: id,
  createdAt: z.date(),
  updatedBy: id,
  updatedAt: z.date(),
});
export type Entry = z.infer<typeof entrySchema>;
export const receiptSchema = z.object({
  teamId: id,
  regionId: z.uuid(),
  operationKey: z.string().min(1),
  actorUserId: id,
  payloadHash: z.string().length(64),
  entryId: z.uuid(),
  version: z.number().int().positive(),
  outcome: z.enum(['saved', 'duplicate']),
  committedAt: z.date(),
});
export type SaveReceipt = z.infer<typeof receiptSchema>;
const revisionSchema = z.object({
  teamId: id,
  regionId: z.uuid(),
  entryId: z.uuid(),
  version: z.number().int().positive(),
  actorUserId: id,
  operationKey: z.string().min(1),
  action: z.enum(['create', 'modify']),
  reason: z.string().min(1),
  committedAt: z.date(),
  before: entrySchema.nullable(),
  after: entrySchema,
});
export const scoreSchema = z.object({
  teamId: id,
  regionId: z.uuid(),
  entryId: z.uuid(),
  seasonId: z.uuid(),
  factVersion: z.number().int().positive(),
  generationId: z.string().min(1),
  scoringPolicyId: z.uuid(),
  scoringPolicyRevision: z.number().int().positive(),
  pointsPerPax: z.number().int().nonnegative().safe(),
});
export const outboxSchema = z.object({
  teamId: id,
  regionId: z.uuid(),
  operationKey: z.string().min(1),
  entryId: z.uuid(),
  desiredRevision: z.number().int().positive(),
  destination: id,
  kind: z.literal('entry-summary'),
  status: z.literal('pending'),
  createdAt: z.date(),
});

export function createEntryRepository(db: Db) {
  const entries = db.collection<Entry>('entries');
  const scope = (context: WorkspaceContext) => {
    assertWorkspaceContext(context);
    return { teamId: context.teamId, regionId: context.regionId };
  };
  const decode = (value: unknown) => (value === null ? null : entrySchema.parse(value));
  return {
    async get(context: WorkspaceContext, entryId: string, session?: ClientSession) {
      return decode(await entries.findOne({ ...scope(context), entryId }, { session }));
    },
    async byReference(
      context: WorkspaceContext,
      reference: { aoId: string; localDate: string; localStartTime: string },
      session?: ClientSession,
    ) {
      return decode(
        await entries.findOne(
          {
            ...scope(context),
            'workoutReference.aoId': reference.aoId,
            'workoutReference.localDate': reference.localDate,
            'workoutReference.localStartTime': reference.localStartTime,
          },
          { session },
        ),
      );
    },
    async bySource(
      context: WorkspaceContext,
      source: z.infer<typeof sourceSchema>,
      session?: ClientSession,
    ) {
      const raw = await db
        .collection('entrySources')
        .findOne(
          { ...scope(context), channelId: source.channelId, messageTs: source.messageTs },
          { session },
        );
      if (!raw) return null;
      const link = sourceSchema.extend({ entryId: z.uuid() }).parse(raw);
      return decode(
        await entries.findOne({ ...scope(context), entryId: link.entryId }, { session }),
      );
    },
    async receipt(context: WorkspaceContext, operationKey: string, session?: ClientSession) {
      const raw = await db
        .collection('operationReceipts')
        .findOne({ ...scope(context), operationKey }, { session });
      return raw ? receiptSchema.parse(raw) : null;
    },
    async save(
      context: WorkspaceContext,
      before: Entry | null,
      after: Entry,
      session: ClientSession,
    ) {
      if (!before) await entries.insertOne(entrySchema.parse(after), { session });
      else {
        const result = await entries.replaceOne(
          { ...scope(context), entryId: before.entryId, version: before.version, status: 'active' },
          entrySchema.parse(after),
          { session },
        );
        if (result.matchedCount !== 1) throw new Error('VERSION_CONFLICT');
      }
    },
    async recordReceipt(context: WorkspaceContext, receipt: SaveReceipt, session: ClientSession) {
      await db
        .collection('operationReceipts')
        .insertOne(receiptSchema.parse({ ...receipt, ...scope(context) }), { session });
    },
    async recordEffects(
      context: WorkspaceContext,
      before: Entry | null,
      after: Entry,
      receipt: SaveReceipt,
      reason: string,
      destination: string,
      source: z.infer<typeof sourceSchema> | undefined,
      session: ClientSession,
    ) {
      const tenant = scope(context);
      await db.collection('entryRevisions').insertOne(
        revisionSchema.parse({
          ...tenant,
          entryId: after.entryId,
          version: after.version,
          actorUserId: context.actorUserId,
          operationKey: receipt.operationKey,
          action: before ? 'modify' : 'create',
          reason,
          committedAt: receipt.committedAt,
          before,
          after,
        }),
        { session },
      );
      await db.collection('entryScoreGenerations').insertOne(
        scoreSchema.parse({
          ...tenant,
          entryId: after.entryId,
          seasonId: after.seasonId,
          factVersion: after.version,
          generationId: after.generationId,
          scoringPolicyId: after.scoringPolicyId,
          scoringPolicyRevision: after.scoringPolicyRevision,
          pointsPerPax: after.pointsPerPax,
        }),
        { session },
      );
      if (source)
        await db
          .collection('entrySources')
          .insertOne(
            { ...sourceSchema.parse(source), ...tenant, entryId: after.entryId },
            { session },
          );
      await db.collection('messageOutbox').insertOne(
        outboxSchema.parse({
          ...tenant,
          operationKey: receipt.operationKey,
          entryId: after.entryId,
          desiredRevision: after.version,
          destination,
          kind: 'entry-summary',
          status: 'pending',
          createdAt: receipt.committedAt,
        }),
        { session },
      );
    },
  };
}
