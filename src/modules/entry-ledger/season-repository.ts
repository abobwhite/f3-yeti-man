import type { ClientSession, Db } from 'mongodb';
import { z } from 'zod';

const date = z.iso.date();
export const seasonInputSchema = z
  .object({
    selector: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
    label: z.string().trim().min(1).max(100),
    startDate: date,
    endDate: date,
    timezone: z.string().min(1),
  })
  .refine((value) => value.startDate <= value.endDate, 'Season start must precede end.');

export const seasonSchema = seasonInputSchema.safeExtend({
  _id: z.uuid(),
  teamId: z.string().min(1),
  regionId: z.uuid(),
  seasonId: z.uuid(),
  locked: z.boolean(),
  version: z.number().int().positive(),
  mutationFence: z.number().int().nonnegative(),
  createdAt: z.date(),
  createdBy: z.string().min(1),
  updatedAt: z.date(),
  updatedBy: z.string().min(1),
});
export type Season = z.infer<typeof seasonSchema>;
export type SeasonInput = z.infer<typeof seasonInputSchema>;

const auditSchema = z.object({
  teamId: z.string().min(1),
  regionId: z.uuid(),
  seasonId: z.uuid(),
  version: z.number().int().positive(),
  operationKey: z.string().min(1),
  action: z.enum(['create', 'configure', 'lock', 'unlock']),
  actorUserId: z.string().min(1),
  reason: z.string().min(1),
  committedAt: z.date(),
  before: seasonSchema.nullable(),
  after: seasonSchema,
});

export async function provisionSeasonIndexes(db: Db): Promise<void> {
  await db
    .collection('seasons')
    .createIndexes([
      { key: { teamId: 1, regionId: 1, seasonId: 1 }, unique: true },
      { key: { teamId: 1, regionId: 1, selector: 1 }, unique: true },
      { key: { teamId: 1, regionId: 1, startDate: 1, endDate: 1 } },
    ]);
  await db
    .collection('seasonAudit')
    .createIndexes([{ key: { teamId: 1, regionId: 1, seasonId: 1, version: 1 }, unique: true }]);
  await db
    .collection('seasonOperations')
    .createIndexes([{ key: { teamId: 1, regionId: 1, operationKey: 1 }, unique: true }]);
}

export function createSeasonRepository(db: Db) {
  const seasons = db.collection<Season>('seasons');
  const catalogs = db.collection<{ _id: string; teamId: string; regionId: string; fence: number }>(
    'seasonCatalogs',
  );
  const audits = db.collection('seasonAudit');
  const operations = db.collection('seasonOperations');
  const decode = (raw: unknown) => (raw === null ? null : seasonSchema.parse(raw));
  return {
    async get(teamId: string, regionId: string, seasonId: string, session?: ClientSession) {
      return decode(await seasons.findOne({ teamId, regionId, seasonId }, { session }));
    },
    async bySelector(teamId: string, regionId: string, selector: string) {
      return decode(await seasons.findOne({ teamId, regionId, selector }));
    },
    async byDate(teamId: string, regionId: string, localDate: string) {
      return decode(
        await seasons.findOne({
          teamId,
          regionId,
          startDate: { $lte: localDate },
          endDate: { $gte: localDate },
        }),
      );
    },
    async list(teamId: string, regionId: string) {
      return (
        await seasons.find({ teamId, regionId }).sort({ startDate: 1, seasonId: 1 }).toArray()
      ).map((raw) => seasonSchema.parse(raw));
    },
    async fenceCatalog(teamId: string, regionId: string, session: ClientSession) {
      await catalogs.updateOne(
        { _id: `${teamId}:${regionId}`, teamId, regionId },
        { $inc: { fence: 1 } },
        { upsert: true, session },
      );
    },
    async overlap(
      teamId: string,
      regionId: string,
      startDate: string,
      endDate: string,
      excludingId: string | undefined,
      session: ClientSession,
    ) {
      return decode(
        await seasons.findOne(
          {
            teamId,
            regionId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
            ...(excludingId ? { seasonId: { $ne: excludingId } } : {}),
          },
          { session },
        ),
      );
    },
    async insert(season: Season, session: ClientSession) {
      await seasons.insertOne(season, { session });
    },
    async update(before: Season, after: Season, session: ClientSession) {
      const result = await seasons.replaceOne(
        {
          _id: before._id,
          teamId: before.teamId,
          regionId: before.regionId,
          version: before.version,
          mutationFence: before.mutationFence,
        },
        after,
        { session },
      );
      if (result.matchedCount !== 1) throw new Error('VERSION_CONFLICT');
    },
    async fenceOpen(teamId: string, regionId: string, seasonId: string, session: ClientSession) {
      const result = await seasons.updateOne(
        { teamId, regionId, seasonId, locked: false },
        { $inc: { mutationFence: 1 } },
        { session },
      );
      if (result.matchedCount !== 1) throw new Error('SEASON_LOCKED_OR_MISSING');
    },
    async retainedOutside(
      teamId: string,
      regionId: string,
      seasonId: string,
      startDate: string,
      endDate: string,
      session: ClientSession,
    ) {
      return db
        .collection('entries')
        .find(
          {
            teamId,
            regionId,
            seasonId,
            $or: [
              { 'workoutReference.localDate': { $lt: startDate } },
              { 'workoutReference.localDate': { $gt: endDate } },
            ],
          },
          { session, projection: { entryId: 1 } },
        )
        .toArray();
    },
    async audit(value: z.input<typeof auditSchema>, session: ClientSession) {
      await audits.insertOne(auditSchema.parse(value), { session });
    },
    async operation(
      teamId: string,
      regionId: string,
      operationKey: string,
      session: ClientSession,
    ) {
      return operations.findOne({ teamId, regionId, operationKey }, { session });
    },
    async saveOperation(
      teamId: string,
      regionId: string,
      operationKey: string,
      payload: string,
      result: Season,
      session: ClientSession,
    ) {
      await operations.insertOne({ teamId, regionId, operationKey, payload, result }, { session });
    },
    async lockCounts(teamId: string, regionId: string, seasonId: string) {
      const scope = { teamId, regionId, seasonId };
      const [activeEntries, pendingDrafts] = await Promise.all([
        db.collection('entries').countDocuments({ ...scope, status: 'active' }),
        db.collection('entryDrafts').countDocuments({ ...scope, status: 'pending' }),
      ]);
      return { activeEntries, pendingDrafts };
    },
  };
}
