import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { assertWorkspaceContext, type WorkspaceContext } from '../workspace-foundation/context.ts';
import { entrySchema, outboxSchema } from './entry-repository.ts';

const jobSchema = outboxSchema.extend({
  status: z.enum(['pending', 'leased', 'succeeded', 'uncertain', 'failed']),
  leaseId: z.uuid().optional(),
  leaseUntil: z.date().optional(),
  availableAt: z.date().optional(),
  attempts: z.number().int().nonnegative().default(0),
});
export type SummaryJob = z.infer<typeof jobSchema>;

/** Ledger owns the transactional outbox. Capture consumes it through this provider. */
export function createSummaryOutbox(db: Db) {
  const jobs = db.collection<SummaryJob>('messageOutbox');
  const scope = (context: WorkspaceContext) => {
    assertWorkspaceContext(context);
    return { teamId: context.teamId, regionId: context.regionId };
  };
  return {
    // Operational inventory only, like the foundation dispatcher: no competition facts returned.
    async next(now = new Date()) {
      const raw = await jobs.findOneAndUpdate(
        {
          kind: 'entry-summary',
          status: { $in: ['pending', 'leased'] },
          $and: [
            { $or: [{ availableAt: { $exists: false } }, { availableAt: { $lte: now } }] },
            { $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
          ],
        },
        { $set: { availableAt: new Date(now.getTime() + 30_000) } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      );
      if (!raw) return null;
      const job = jobSchema.parse(raw);
      const entry = entrySchema.parse(
        await db
          .collection('entries')
          .findOne({ teamId: job.teamId, regionId: job.regionId, entryId: job.entryId }),
      );
      return {
        teamId: job.teamId,
        regionId: job.regionId,
        operationKey: job.operationKey,
        actorUserId: entry.updatedBy,
      };
    },
    async claim(context: WorkspaceContext, operationKey: string, now = new Date()) {
      const raw = await jobs.findOneAndUpdate(
        {
          ...scope(context),
          operationKey,
          status: { $in: ['pending', 'leased'] },
          $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
        },
        {
          $set: {
            status: 'leased',
            leaseId: randomUUID(),
            leaseUntil: new Date(now.getTime() + 30_000),
          },
          $inc: { attempts: 1 },
        },
        { returnDocument: 'after' },
      );
      return raw ? jobSchema.parse(raw) : null;
    },
    async finish(
      context: WorkspaceContext,
      job: SummaryJob,
      status: SummaryJob['status'],
      now = new Date(),
      retryAfterMs = 1000,
    ) {
      await jobs.updateOne(
        {
          ...scope(context),
          operationKey: job.operationKey,
          leaseId: job.leaseId,
          status: 'leased',
        },
        {
          $set: {
            status: status === 'pending' && job.attempts >= 5 ? 'failed' : status,
            availableAt: new Date(now.getTime() + retryAfterMs),
          },
          $unset: { leaseId: '', leaseUntil: '' },
        },
      );
    },
  };
}
