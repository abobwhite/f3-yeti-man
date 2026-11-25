import { randomUUID } from 'node:crypto';
import type { ClientSession, Db } from 'mongodb';
import { z } from 'zod';
import { assertWorkspaceContext, type WorkspaceContext } from './context.ts';

const jobSchema = z.object({
  _id: z.string().uuid(),
  schemaVersion: z.literal(1),
  teamId: z.string().min(1),
  regionId: z.string().uuid(),
  operationKey: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  payloadRef: z.string().min(1).max(500),
  status: z.enum(['pending', 'leased', 'sending', 'succeeded', 'failed', 'uncertain']),
  attempts: z.number().int().nonnegative(),
  availableAt: z.date(),
  leaseUntil: z.date().optional(),
  leaseId: z.string().uuid().optional(),
  resultRef: z.string().max(500).optional(),
  resultCode: z.string().max(100).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Operation = z.infer<typeof jobSchema>;
export type OperationReceipt = Pick<Operation, '_id' | 'operationKey' | 'status'>;
const slotSchema = z.object({
  _id: z.string().min(1),
  teamId: z.string().min(1),
  regionId: z.string().uuid(),
  nextAt: z.date(),
});

export async function provisionOperationIndexes(db: Db): Promise<void> {
  const jobs = db.collection('operationalJobs');
  await jobs.createIndex({ teamId: 1, regionId: 1, operationKey: 1 }, { unique: true }, undefined);
  await jobs.createIndex({ status: 1, availableAt: 1, leaseUntil: 1 });
  await db
    .collection('slackDeliverySlots')
    .createIndex({ teamId: 1, regionId: 1 }, { unique: true }, undefined);
}

export function createOperationRepository(
  db: Db,
  assertActive: (context: WorkspaceContext, session?: ClientSession) => Promise<unknown>,
) {
  const jobs = db.collection<Operation>('operationalJobs');
  const slots = db.collection<z.infer<typeof slotSchema>>('slackDeliverySlots');
  return {
    async reserveDeliverySlot(
      job: Pick<Operation, 'teamId' | 'regionId'>,
      now: Date,
      spacingMs: number,
    ): Promise<number> {
      const nextAt = new Date(now.getTime() + spacingMs);
      const tenant = { _id: job.teamId, teamId: job.teamId, regionId: job.regionId };
      const result = await slots.findOneAndUpdate(
        { ...tenant, nextAt: { $lte: now } },
        { $set: { nextAt } },
        { returnDocument: 'before' },
      );
      if (result) return 0;
      try {
        await slots.insertOne({ ...tenant, nextAt });
        return 0;
      } catch (error) {
        if (
          !(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        )
          throw error;
      }
      const existing = slotSchema.parse(await slots.findOne(tenant));
      return Math.max(1000, existing.nextAt.getTime() - now.getTime());
    },
    async deferDeliverySlot(
      job: Pick<Operation, 'teamId' | 'regionId'>,
      until: Date,
    ): Promise<void> {
      await slots.updateOne(
        { _id: job.teamId, teamId: job.teamId, regionId: job.regionId },
        { $max: { nextAt: until } },
      );
    },
    async enqueue(
      context: WorkspaceContext,
      input: { operationKey: string; type: string; payloadRef: string },
      session?: ClientSession,
    ): Promise<OperationReceipt> {
      assertWorkspaceContext(context);
      const fields = z
        .object({
          operationKey: jobSchema.shape.operationKey,
          type: jobSchema.shape.type,
          payloadRef: jobSchema.shape.payloadRef,
        })
        .parse(input);
      await assertActive(context, session);
      const now = new Date();
      const tenant = { teamId: context.teamId, regionId: context.regionId };
      try {
        await jobs.insertOne(
          {
            _id: randomUUID(),
            schemaVersion: 1,
            ...tenant,
            ...fields,
            status: 'pending',
            attempts: 0,
            availableAt: now,
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
      } catch (error) {
        if (
          !(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        )
          throw error;
      }
      const job = jobSchema.parse(
        await jobs.findOne({ ...tenant, operationKey: fields.operationKey }, { session }),
      );
      if (job.type !== fields.type || job.payloadRef !== fields.payloadRef) {
        throw new Error('Operation key conflicts with a different intent.');
      }
      return { _id: job._id, operationKey: job.operationKey, status: job.status };
    },
    async claim(now = new Date(), leaseMs = 30_000, maxAttempts = 5): Promise<Operation | null> {
      if (leaseMs <= 0 || maxAttempts <= 0) throw new Error('Invalid lease policy.');
      // A process may have died after making a remote call. Preserve that ambiguity.
      await jobs.updateMany(
        { status: 'sending', leaseUntil: { $lte: now } },
        {
          $set: { status: 'uncertain', resultCode: 'REMOTE_LEASE_EXPIRED', updatedAt: now },
          $unset: { leaseId: '', leaseUntil: '' },
        },
      );
      await jobs.updateMany(
        { status: 'leased', leaseUntil: { $lte: now }, attempts: { $gte: maxAttempts } },
        {
          $set: { status: 'failed', resultCode: 'RETRY_EXHAUSTED', updatedAt: now },
          $unset: { leaseId: '', leaseUntil: '' },
        },
      );
      const leaseId = randomUUID();
      const job = await jobs.findOneAndUpdate(
        {
          attempts: { $lt: maxAttempts },
          $or: [
            { status: 'pending', availableAt: { $lte: now } },
            { status: 'leased', leaseUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            status: 'leased',
            leaseId,
            leaseUntil: new Date(now.getTime() + leaseMs),
            updatedAt: now,
          },
          $inc: { attempts: 1 },
        },
        { sort: { availableAt: 1, createdAt: 1 }, returnDocument: 'after' },
      );
      return job ? jobSchema.parse(job) : null;
    },
    async markSending(job: Operation): Promise<boolean> {
      const result = await jobs.updateOne(
        {
          _id: job._id,
          teamId: job.teamId,
          regionId: job.regionId,
          status: 'leased',
          leaseId: job.leaseId,
          leaseUntil: { $gt: new Date() },
        },
        { $set: { status: 'sending', updatedAt: new Date() } },
      );
      return result.modifiedCount === 1;
    },
    async finish(
      job: Operation,
      outcome: {
        status: 'succeeded' | 'pending' | 'failed' | 'uncertain';
        resultCode: string;
        resultRef?: string;
        availableAt?: Date;
      },
    ): Promise<boolean> {
      const parsed = z
        .object({
          status: z.enum(['succeeded', 'pending', 'failed', 'uncertain']),
          resultCode: jobSchema.shape.resultCode.unwrap(),
          resultRef: jobSchema.shape.resultRef,
          availableAt: z.date().optional(),
        })
        .parse(outcome);
      if (parsed.status === 'pending' && !parsed.availableAt)
        throw new Error('Retry time required.');
      const result = await jobs.updateOne(
        {
          _id: job._id,
          teamId: job.teamId,
          regionId: job.regionId,
          status: { $in: ['leased', 'sending'] },
          leaseId: job.leaseId,
          leaseUntil: { $gt: new Date() },
        },
        {
          $set: {
            status: parsed.status,
            resultCode: parsed.resultCode,
            updatedAt: new Date(),
            ...(parsed.resultRef ? { resultRef: parsed.resultRef } : {}),
            ...(parsed.availableAt ? { availableAt: parsed.availableAt } : {}),
          },
          $unset: { leaseId: '', leaseUntil: '' },
        },
      );
      return result.modifiedCount === 1;
    },
    async resolveUncertain(
      context: WorkspaceContext,
      operationKey: string,
      resultRef: string,
    ): Promise<boolean> {
      assertWorkspaceContext(context);
      await assertActive(context);
      const result = await jobs.updateOne(
        { teamId: context.teamId, regionId: context.regionId, operationKey, status: 'uncertain' },
        {
          $set: { status: 'succeeded', resultCode: 'RECONCILED', resultRef, updatedAt: new Date() },
        },
      );
      return result.modifiedCount === 1;
    },
  };
}
